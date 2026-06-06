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
