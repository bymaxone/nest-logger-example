/**
 * @fileoverview Unit tests for the logs read-API client — query serialization,
 * RBAC header construction, the `apiFetch` boundary (success / non-ok / invalid
 * shape), and every typed endpoint wrapper (logs, aggregate, facets, context,
 * export URL).
 *
 * @module lib/api-client.test
 */
import { afterEach, describe, expect, it, vi } from 'vitest'

import {
  DEFAULT_CONTEXT_LINES,
  encodeLogQuery,
  getAggregate,
  getContext,
  getExportUrl,
  getFacets,
  getLogs,
  rbacHeadersForQuery,
} from './api-client'
import { ApiError, type LogQuery } from './types'

/** One well-formed `/logs` page envelope accepted by `logPageSchema`. */
const LOG_PAGE = {
  data: [
    {
      id: 'l1',
      time: '2026-06-04T00:00:00.000Z',
      level: 'info',
      logKey: 'http',
      message: 'ok',
      service: 'api',
    },
  ],
  nextCursor: null,
  hasMore: false,
}

/** Build a minimal `Response`-like object the client consumes. */
function jsonResponse(
  body: unknown,
  options: { ok?: boolean; status?: number; statusText?: string } = {},
): Response {
  return {
    ok: options.ok ?? true,
    status: options.status ?? 200,
    statusText: options.statusText ?? 'OK',
    json: () => Promise.resolve(body),
  } as unknown as Response
}

describe('encodeLogQuery', () => {
  /** A scalar filter must serialize each present key=value pair into the query string. */
  it('serializes scalar fields', () => {
    const qs = encodeLogQuery({ source: 'postgres', service: 'api', limit: 50 })
    expect(qs).toContain('source=postgres')
    expect(qs).toContain('service=api')
    expect(qs).toContain('limit=50')
  })

  /** `undefined` and `null` values must be skipped entirely (no empty params). */
  it('skips undefined and null values', () => {
    // `service` is undefined and `tenantId` is null — both must be omitted. The
    // keys are present at runtime (cast past exactOptional) so the value-skip
    // branch is genuinely exercised.
    const query = {
      source: 'loki',
      service: undefined,
      tenantId: null,
    } as unknown as LogQuery
    const qs = encodeLogQuery(query)
    expect(qs).not.toContain('service=')
    expect(qs).not.toContain('tenantId=')
    expect(qs).toContain('source=loki')
  })

  /** The RBAC role must never be serialized — it travels as the x-role header. */
  it('omits the role key from the query string', () => {
    const qs = encodeLogQuery({ source: 'postgres', role: 'admin' })
    expect(qs).not.toContain('role=')
  })

  /** A `level: { gte }` comparison must be encoded as the bracketed `level[gte]` param. */
  it('encodes the level gte comparison as level[gte]', () => {
    const qs = encodeLogQuery({ source: 'postgres', level: { gte: 'warn' } })
    // URLSearchParams percent-encodes the brackets; decode to assert the shape.
    expect(decodeURIComponent(qs)).toContain('level[gte]=warn')
  })

  /** An exact (non-object) level must be encoded as a plain `level=` param. */
  it('encodes an exact level as a plain param', () => {
    const qs = encodeLogQuery({ source: 'postgres', level: 'error' })
    expect(qs).toContain('level=error')
    expect(decodeURIComponent(qs)).not.toContain('level[gte]')
  })
})

describe('rbacHeadersForQuery', () => {
  /** A role + non-empty tenant must produce both RBAC headers. */
  it('emits x-role and x-tenant-id when both are set', () => {
    expect(rbacHeadersForQuery({ source: 'postgres', role: 'operator', tenantId: 'acme' })).toEqual(
      {
        'x-role': 'operator',
        'x-tenant-id': 'acme',
      },
    )
  })

  /** A missing role must omit x-role; an empty tenant must omit x-tenant-id. */
  it('omits headers that are absent or empty', () => {
    // No role and an empty-string tenant — both headers must be absent.
    expect(rbacHeadersForQuery({ source: 'loki', tenantId: '' })).toEqual({})
  })
})

describe('getLogs', () => {
  afterEach(() => vi.unstubAllGlobals())

  /** A valid page envelope is parsed and returned, and the RBAC header is attached. */
  it('returns the validated page and sends the x-role header', async () => {
    let captured: HeadersInit | undefined
    vi.stubGlobal(
      'fetch',
      vi.fn((_url: string, init?: RequestInit) => {
        captured = init?.headers
        return Promise.resolve(jsonResponse(LOG_PAGE))
      }),
    )
    const page = await getLogs({ source: 'postgres', role: 'admin' })
    expect(page.data).toHaveLength(1)
    expect((captured as Record<string, string>)['x-role']).toBe('admin')
  })

  /** A non-2xx response must reject with an ApiError carrying the status. */
  it('throws ApiError on a non-ok response', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(() =>
        Promise.resolve(jsonResponse(null, { ok: false, status: 403, statusText: 'Forbidden' })),
      ),
    )
    await expect(getLogs({ source: 'postgres', role: 'viewer' })).rejects.toBeInstanceOf(ApiError)
  })

  /** A payload that violates the schema must throw rather than be trusted. */
  it('throws ApiError when the response shape is invalid', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(() => Promise.resolve(jsonResponse({ data: 'not-an-array' }))),
    )
    await expect(getLogs({ source: 'postgres', role: 'admin' })).rejects.toThrow(
      /unexpected response shape/,
    )
  })

  /** With no init headers supplied the default Accept header path is exercised. */
  it('sends the Accept header even when the query has no RBAC fields', async () => {
    let captured: HeadersInit | undefined
    vi.stubGlobal(
      'fetch',
      vi.fn((_url: string, init?: RequestInit) => {
        captured = init?.headers
        return Promise.resolve(jsonResponse(LOG_PAGE))
      }),
    )
    await getLogs({ source: 'loki', tenantId: '' })
    expect((captured as Record<string, string>).Accept).toBe('application/json')
  })
})

describe('getAggregate', () => {
  afterEach(() => vi.unstubAllGlobals())

  /** The aggregate URL must carry the metric, and a valid series is returned. */
  it('requests the metric and returns the validated series', async () => {
    let url = ''
    const rows = [{ bucket: '2026-06-04T00:00:00.000Z', level: 'info', n: 5 }]
    vi.stubGlobal(
      'fetch',
      vi.fn((u: string) => {
        url = u
        return Promise.resolve(jsonResponse(rows))
      }),
    )
    const result = await getAggregate('volume', { source: 'postgres', role: 'admin' })
    expect(url).toContain('/logs/aggregate?metric=volume')
    expect(result).toEqual(rows)
  })
})

describe('getFacets', () => {
  afterEach(() => vi.unstubAllGlobals())

  /** The requested fields must be comma-joined into the facets URL. */
  it('joins the fields and returns the validated facets', async () => {
    let url = ''
    const facets = { level: [{ value: 'error', count: 3 }] }
    vi.stubGlobal(
      'fetch',
      vi.fn((u: string) => {
        url = u
        return Promise.resolve(jsonResponse(facets))
      }),
    )
    const result = await getFacets(['level', 'service'], { source: 'postgres', role: 'admin' })
    expect(url).toContain('/logs/facets?fields=level,service')
    expect(result).toEqual(facets)
  })
})

describe('getContext', () => {
  afterEach(() => vi.unstubAllGlobals())

  /** Explicit before/after counts and a requestId anchor must flow into the URL. */
  it('encodes the requestId anchor and explicit before/after counts', async () => {
    let url = ''
    const context = { before: [], match: null, after: [] }
    vi.stubGlobal(
      'fetch',
      vi.fn((u: string) => {
        url = u
        return Promise.resolve(jsonResponse(context))
      }),
    )
    await getContext(
      { requestId: 'req_1', before: 5, after: 7 },
      { source: 'postgres', role: 'admin' },
    )
    expect(url).toContain('source=postgres')
    expect(url).toContain('requestId=req_1')
    expect(url).toContain('before=5')
    expect(url).toContain('after=7')
  })

  /** A traceId anchor with no counts must default both to DEFAULT_CONTEXT_LINES. */
  it('uses the default context-line count and the traceId anchor', async () => {
    let url = ''
    vi.stubGlobal(
      'fetch',
      vi.fn((u: string) => {
        url = u
        return Promise.resolve(jsonResponse({ before: [], match: null, after: [] }))
      }),
    )
    await getContext({ traceId: 'trace_1' }, { source: 'loki', role: 'operator' })
    expect(url).toContain('traceId=trace_1')
    expect(url).toContain(`before=${DEFAULT_CONTEXT_LINES}`)
    expect(url).toContain(`after=${DEFAULT_CONTEXT_LINES}`)
    // Neither anchor-specific param for the unused id should appear.
    expect(url).not.toContain('requestId=')
  })
})

describe('getExportUrl', () => {
  /** The export URL must include the format and the serialized query. */
  it('builds a fully-qualified export URL with the format', () => {
    const query: LogQuery = { source: 'postgres', service: 'api', role: 'admin' }
    const url = getExportUrl('csv', query)
    expect(url).toContain('/logs/export?format=csv')
    expect(url).toContain('source=postgres')
    expect(url).toContain('service=api')
    // The role is a header, never a query param.
    expect(url).not.toContain('role=')
  })
})

describe('DEFAULT_CONTEXT_LINES', () => {
  /**
   * The constant must be exactly 10 — this assertion uses a literal so a mutation
   * to the constant value (e.g. to 5) is caught even when the test imports the
   * same constant on the expected side.
   */
  it('is exactly 10', () => {
    expect(DEFAULT_CONTEXT_LINES).toBe(10)
  })
})

describe('getLogs — exact URL path', () => {
  afterEach(() => vi.unstubAllGlobals())

  /** The request must target the /logs path. */
  it('requests the /logs path', async () => {
    let capturedUrl = ''
    vi.stubGlobal(
      'fetch',
      vi.fn((url: string) => {
        capturedUrl = url
        return Promise.resolve(jsonResponse(LOG_PAGE))
      }),
    )
    await getLogs({ source: 'postgres', role: 'admin' })
    expect(capturedUrl).toContain('/logs?')
  })
})

describe('getAggregate — exact URL path', () => {
  afterEach(() => vi.unstubAllGlobals())

  /** The aggregate request must target /logs/aggregate with the metric. */
  it('requests /logs/aggregate?metric=errorRate', async () => {
    let capturedUrl = ''
    vi.stubGlobal(
      'fetch',
      vi.fn((url: string) => {
        capturedUrl = url
        return Promise.resolve(jsonResponse([{ bucket: 'b', errorRate: 0.1 }]))
      }),
    )
    await getAggregate('errorRate', { source: 'loki', role: 'viewer' })
    expect(capturedUrl).toContain('/logs/aggregate?metric=errorRate')
  })
})

describe('getFacets — exact URL path', () => {
  afterEach(() => vi.unstubAllGlobals())

  /** The facets request must target /logs/facets with the fields param. */
  it('requests /logs/facets?fields=...', async () => {
    let capturedUrl = ''
    vi.stubGlobal(
      'fetch',
      vi.fn((url: string) => {
        capturedUrl = url
        return Promise.resolve(jsonResponse({ service: [] }))
      }),
    )
    await getFacets(['service'], { source: 'postgres', role: 'admin' })
    expect(capturedUrl).toContain('/logs/facets?fields=service')
  })
})

describe('getContext — exact URL path and default lines', () => {
  afterEach(() => vi.unstubAllGlobals())

  /** getContext targets /logs/context with the anchor id. */
  it('requests /logs/context with the requestId anchor', async () => {
    let capturedUrl = ''
    vi.stubGlobal(
      'fetch',
      vi.fn((url: string) => {
        capturedUrl = url
        return Promise.resolve(jsonResponse({ before: [], match: null, after: [] }))
      }),
    )
    await getContext({ requestId: 'req_x' }, { source: 'postgres', role: 'admin' })
    expect(capturedUrl).toContain('/logs/context?')
    expect(capturedUrl).toContain('requestId=req_x')
  })

  /**
   * The default before/after count is the literal value 10, not just
   * `DEFAULT_CONTEXT_LINES`; using a literal here catches a mutation to the
   * constant regardless of what the import resolves to.
   */
  it('defaults before and after to the literal value 10', async () => {
    let capturedUrl = ''
    vi.stubGlobal(
      'fetch',
      vi.fn((url: string) => {
        capturedUrl = url
        return Promise.resolve(jsonResponse({ before: [], match: null, after: [] }))
      }),
    )
    await getContext({ requestId: 'req_x' }, { source: 'postgres', role: 'admin' })
    expect(capturedUrl).toContain('before=10')
    expect(capturedUrl).toContain('after=10')
  })
})

describe('rbacHeadersForQuery — edge branches', () => {
  /** A query with only a role (no tenantId) emits x-role but no x-tenant-id. */
  it('emits only x-role when there is no tenantId', () => {
    const headers = rbacHeadersForQuery({ source: 'postgres', role: 'viewer' })
    expect(headers['x-role']).toBe('viewer')
    expect(headers['x-tenant-id']).toBeUndefined()
  })

  /** A query with no role and no tenant emits an empty headers record. */
  it('returns an empty record when neither role nor tenant is set', () => {
    expect(rbacHeadersForQuery({ source: 'loki' })).toEqual({})
  })
})

describe('apiFetch — error message format', () => {
  afterEach(() => vi.unstubAllGlobals())

  /**
   * The thrown ApiError message must include both the status code and the
   * statusText. Asserting the exact string kills the StringLiteral mutation
   * that replaces the template literal with an empty string.
   */
  it('includes the status code and statusText in the ApiError message', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(() =>
        Promise.resolve(jsonResponse(null, { ok: false, status: 500, statusText: 'Server Error' })),
      ),
    )
    const err = await getLogs({ source: 'postgres', role: 'admin' }).catch((e) => e)
    expect(err.message).toBe('500 Server Error')
  })
})

describe('getContext — traceId inclusion guard', () => {
  afterEach(() => vi.unstubAllGlobals())

  /**
   * When only a requestId is provided the URL must not contain traceId at all.
   * Asserting this kills the ConditionalExpression→true mutation that would
   * always append traceId (as `traceId=undefined`) even when absent.
   */
  it('omits traceId from the URL when only a requestId is provided', async () => {
    let url = ''
    vi.stubGlobal(
      'fetch',
      vi.fn((u: string) => {
        url = u
        return Promise.resolve(jsonResponse({ before: [], match: null, after: [] }))
      }),
    )
    await getContext({ requestId: 'req_only' }, { source: 'postgres', role: 'admin' })
    expect(url).toContain('requestId=req_only')
    expect(url).not.toContain('traceId=')
  })
})

describe('BASE URL — default localhost base', () => {
  afterEach(() => vi.unstubAllGlobals())

  /**
   * When `NEXT_PUBLIC_API_URL` is not set the module falls back to
   * `http://localhost:3001`. Asserting the prefix of the captured URL kills two
   * mutations on the fallback expression: the `LogicalOperator` that swaps `??`
   * for `&&` (producing `undefined` when the env var is absent) and the
   * `StringLiteral→""` that empties the fallback string (producing a
   * root-relative URL like `/logs?…`).
   */
  it('prefixes requests with the http://localhost:3001 base URL', async () => {
    let capturedUrl = ''
    vi.stubGlobal(
      'fetch',
      vi.fn((u: string) => {
        capturedUrl = u
        return Promise.resolve(jsonResponse(LOG_PAGE))
      }),
    )
    await getLogs({ source: 'postgres' })
    expect(capturedUrl).toMatch(/^http:\/\/localhost:3001\//)
  })
})

describe('rbacHeadersForQuery — absent fields do not produce headers', () => {
  /**
   * When `q.role` is absent (undefined) the returned record must not carry an
   * `x-role` key at all. `toEqual({})` ignores `undefined`-valued properties, so
   * this test uses `not.toHaveProperty` to detect the ConditionalExpression→true
   * mutation that always assigns `headers['x-role'] = undefined`.
   */
  it('does not set x-role when role is absent', () => {
    const headers = rbacHeadersForQuery({ source: 'loki' })
    expect(headers).not.toHaveProperty('x-role')
  })

  /**
   * When `q.tenantId` is absent (undefined) the returned record must not carry
   * an `x-tenant-id` key. This kills the ConditionalExpression→true mutation on
   * the first sub-expression (`q.tenantId !== undefined`) that would cause
   * `headers['x-tenant-id'] = undefined` to be set even when tenantId is missing.
   */
  it('does not set x-tenant-id when tenantId is absent', () => {
    const headers = rbacHeadersForQuery({ source: 'loki', role: 'admin' })
    expect(headers).not.toHaveProperty('x-tenant-id')
  })
})
