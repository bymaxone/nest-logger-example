/**
 * @fileoverview Unit tests for the maintenance client — the export URL builder
 * reuses the Explorer query and injects the tenant restriction, and every
 * network helper validates its response at the boundary and attaches RBAC.
 *
 * @module lib/maintenance-api.test
 */
import { afterEach, describe, expect, it, vi } from 'vitest'

import {
  exportLogs,
  exportUrl,
  getActiveRedactPaths,
  getAuditEvents,
  getRetention,
  getSameRecord,
  MaintenanceApiError,
  updateRetention,
} from './maintenance-api'
import type { LogQuery, RbacContext } from './types'

/** The active identity sent with every RBAC-scoped request. */
const RBAC: RbacContext = { role: 'admin', tenantId: 'acme' }

/** One well-formed `/logs` page envelope (validated by `logPageSchema`). */
const logPage = {
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

/** Build a minimal `Response`-like object the helpers consume. */
function jsonResponse(
  body: unknown,
  options: { ok?: boolean; status?: number; headers?: Record<string, string> } = {},
): Response {
  const headers = options.headers ?? {}
  return {
    ok: options.ok ?? true,
    status: options.status ?? 200,
    statusText: 'OK',
    headers: { get: (name: string) => headers[name.toLowerCase()] ?? null },
    json: () => Promise.resolve(body),
    blob: () => Promise.resolve(new Blob([JSON.stringify(body)])),
  } as unknown as Response
}

describe('exportUrl', () => {
  /** CSV export must set format=csv and carry the source from the query. */
  it('sets format=csv and the source', () => {
    const query: LogQuery = { source: 'postgres', role: 'admin' }
    const url = exportUrl('csv', query)
    expect(url).toContain('/logs/export?')
    expect(url).toContain('format=csv')
    expect(url).toContain('source=postgres')
  })

  /** The active tenant restriction must flow into the export URL when present. */
  it('injects the tenantId restriction when set', () => {
    const query: LogQuery = { source: 'loki', tenantId: 'acme', role: 'operator' }
    expect(exportUrl('json', query)).toContain('tenantId=acme')
  })

  /** The role is an RBAC header, never a query param — it must not leak into the URL. */
  it('does not serialize the role into the URL', () => {
    const url = exportUrl('json', { source: 'loki', role: 'admin' })
    expect(url).not.toContain('role=')
  })
})

describe('exportLogs', () => {
  afterEach(() => vi.unstubAllGlobals())

  /** A present `x-export-truncated: true` header must surface as `truncated: true`. */
  it('reports truncated=true when the X-Export-Truncated header is set', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(() => Promise.resolve(jsonResponse([], { headers: { 'x-export-truncated': 'true' } }))),
    )
    const result = await exportLogs('json', { source: 'postgres', role: 'admin' })
    expect(result.truncated).toBe(true)
  })

  /** With no truncation header the result must report `truncated: false`. */
  it('reports truncated=false when the header is absent', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(() => Promise.resolve(jsonResponse([]))),
    )
    const result = await exportLogs('csv', { source: 'loki', role: 'operator' })
    expect(result.truncated).toBe(false)
  })

  /** A query without a role must export with no RBAC headers (the empty-headers branch). */
  it('sends no RBAC headers when the query carries no role', async () => {
    let captured: HeadersInit | undefined
    vi.stubGlobal(
      'fetch',
      vi.fn((_url: string, init?: RequestInit) => {
        captured = init?.headers
        return Promise.resolve(jsonResponse([]))
      }),
    )
    await exportLogs('json', { source: 'postgres' })
    expect(captured).toEqual({})
  })

  /** A query with a role but no tenant must default the tenant restriction to ''. */
  it('attaches the x-role header and defaults the tenant when absent', async () => {
    let captured: HeadersInit | undefined
    vi.stubGlobal(
      'fetch',
      vi.fn((_url: string, init?: RequestInit) => {
        captured = init?.headers
        return Promise.resolve(jsonResponse([]))
      }),
    )
    // `tenantId` is omitted so the `?? ''` fallback path is exercised.
    await exportLogs('json', { source: 'postgres', role: 'admin' })
    expect((captured as Record<string, string>)['x-role']).toBe('admin')
    expect((captured as Record<string, string>)['x-tenant-id']).toBeUndefined()
  })

  /**
   * When the query carries both a role and a tenantId, the x-tenant-id header
   * must be forwarded with the exact tenantId value. Asserting the exact value
   * kills the LogicalOperator mutation (`?? ''` → `&& ''`) that replaces the
   * tenantId with an empty string, causing the header to be omitted.
   */
  it('attaches x-tenant-id when both role and tenantId are present', async () => {
    let captured: HeadersInit | undefined
    vi.stubGlobal(
      'fetch',
      vi.fn((_url: string, init?: RequestInit) => {
        captured = init?.headers
        return Promise.resolve(jsonResponse([]))
      }),
    )
    await exportLogs('json', { source: 'postgres', role: 'admin', tenantId: 'acme' })
    expect((captured as Record<string, string>)['x-role']).toBe('admin')
    expect((captured as Record<string, string>)['x-tenant-id']).toBe('acme')
  })

  /** A non-2xx export response must reject with a MaintenanceApiError carrying the status. */
  it('throws MaintenanceApiError on a non-ok export response', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(() => Promise.resolve(jsonResponse(null, { ok: false, status: 403 }))),
    )
    await expect(exportLogs('json', { source: 'postgres', role: 'viewer' })).rejects.toBeInstanceOf(
      MaintenanceApiError,
    )
  })
})

describe('getRetention', () => {
  afterEach(() => vi.unstubAllGlobals())

  /** A valid retention envelope is parsed and returned unchanged. */
  it('returns the validated retention status', async () => {
    const status = { retentionDays: 30, nextSweep: '2026-06-05T00:00:00.000Z', pendingRows: 12 }
    vi.stubGlobal(
      'fetch',
      vi.fn(() => Promise.resolve(jsonResponse(status))),
    )
    await expect(getRetention(RBAC)).resolves.toEqual(status)
  })

  /** The active role must travel as the x-role RBAC header on the GET. */
  it('attaches the x-role RBAC header', async () => {
    let captured: HeadersInit | undefined
    vi.stubGlobal(
      'fetch',
      vi.fn((_url: string, init?: RequestInit) => {
        captured = init?.headers
        return Promise.resolve(jsonResponse({ retentionDays: 30, nextSweep: 's', pendingRows: 0 }))
      }),
    )
    await getRetention(RBAC)
    expect((captured as Record<string, string>)['x-role']).toBe('admin')
  })

  /** A response that violates the schema must throw rather than be trusted. */
  it('throws when the response shape is invalid', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(() => Promise.resolve(jsonResponse({ retentionDays: 'nope' }))),
    )
    await expect(getRetention(RBAC)).rejects.toThrow(/unexpected response shape/)
  })

  /** A non-2xx GET must reject with a MaintenanceApiError carrying the status. */
  it('throws MaintenanceApiError on a non-ok response', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(() => Promise.resolve(jsonResponse(null, { ok: false, status: 403 }))),
    )
    await expect(getRetention(RBAC)).rejects.toBeInstanceOf(MaintenanceApiError)
  })
})

describe('updateRetention', () => {
  afterEach(() => vi.unstubAllGlobals())

  /** The new TTL must be sent as a PATCH body and the validated status returned. */
  it('PATCHes the new retentionDays and returns the status', async () => {
    let captured: { method: string | undefined; body: unknown } = {
      method: undefined,
      body: undefined,
    }
    const status = { retentionDays: 7, nextSweep: '2026-06-05T00:00:00.000Z', pendingRows: 3 }
    vi.stubGlobal(
      'fetch',
      vi.fn((_url: string, init?: RequestInit) => {
        captured = { method: init?.method, body: JSON.parse(init?.body as string) as unknown }
        return Promise.resolve(jsonResponse(status))
      }),
    )
    const result = await updateRetention(7, RBAC)
    expect(captured.method).toBe('PATCH')
    expect(captured.body).toEqual({ retentionDays: 7 })
    expect(result).toEqual(status)
  })

  /** A non-2xx PATCH must reject with a MaintenanceApiError carrying the status. */
  it('throws MaintenanceApiError on a non-ok PATCH response', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(() => Promise.resolve(jsonResponse(null, { ok: false, status: 403 }))),
    )
    await expect(updateRetention(7, RBAC)).rejects.toBeInstanceOf(MaintenanceApiError)
  })

  /** A malformed PATCH response must throw instead of returning garbage. */
  it('throws on an invalid response shape', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(() => Promise.resolve(jsonResponse({ wrong: true }))),
    )
    await expect(updateRetention(7, RBAC)).rejects.toThrow(/unexpected response shape/)
  })
})

describe('getAuditEvents', () => {
  afterEach(() => vi.unstubAllGlobals())

  /** A valid array of audit events is parsed and returned newest-first. */
  it('returns the validated audit events', async () => {
    const events = [
      { id: 'a1', actor: 'admin', action: 'update', target: 'retention', tenantId: null, at: 't' },
    ]
    vi.stubGlobal(
      'fetch',
      vi.fn(() => Promise.resolve(jsonResponse(events))),
    )
    await expect(getAuditEvents(RBAC)).resolves.toEqual(events)
  })

  /** A non-array / malformed audit payload must be rejected at the boundary. */
  it('throws when the payload is not a valid event array', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(() => Promise.resolve(jsonResponse({ not: 'an array' }))),
    )
    await expect(getAuditEvents(RBAC)).rejects.toThrow(/unexpected response shape/)
  })
})

describe('getActiveRedactPaths', () => {
  afterEach(() => vi.unstubAllGlobals())

  /** The validated string list is returned, and the RBAC header is attached for the gated endpoint. */
  it('returns the validated paths and sends the x-role header', async () => {
    let captured: HeadersInit | undefined
    vi.stubGlobal(
      'fetch',
      vi.fn((_url: string, init?: RequestInit) => {
        captured = init?.headers
        return Promise.resolve(jsonResponse(['req.body.password', 'req.headers.authorization']))
      }),
    )
    const paths = await getActiveRedactPaths(RBAC)
    expect(paths).toEqual(['req.body.password', 'req.headers.authorization'])
    expect((captured as Record<string, string>)['x-role']).toBe('admin')
  })

  /** A payload of non-strings must be rejected rather than rendered. */
  it('throws when the list contains non-strings', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(() => Promise.resolve(jsonResponse([1, 2, 3]))),
    )
    await expect(getActiveRedactPaths(RBAC)).rejects.toThrow(/unexpected response shape/)
  })
})

describe('getSameRecord', () => {
  afterEach(() => vi.unstubAllGlobals())

  /** Both backends are queried (limit=1) and their rows returned under postgres/loki. */
  it('fetches one row from each backend by requestId', async () => {
    const urls: string[] = []
    vi.stubGlobal(
      'fetch',
      vi.fn((url: string) => {
        urls.push(url)
        return Promise.resolve(jsonResponse(logPage))
      }),
    )
    const query: LogQuery = { source: 'postgres', role: 'admin' }
    const result = await getSameRecord({ requestId: 'req_1' }, query)
    expect(result.postgres).toEqual(logPage.data)
    expect(result.loki).toEqual(logPage.data)
    // One call pins source=postgres, the other source=loki — both with the requestId + limit=1.
    expect(urls.some((u) => u.includes('source=postgres'))).toBe(true)
    expect(urls.some((u) => u.includes('source=loki'))).toBe(true)
    expect(urls.every((u) => u.includes('requestId=req_1') && u.includes('limit=1'))).toBe(true)
  })

  /** Same record by traceId must attach the traceId to both parallel calls. */
  it('fetches one row from each backend by traceId', async () => {
    const urls: string[] = []
    vi.stubGlobal(
      'fetch',
      vi.fn((url: string) => {
        urls.push(url)
        return Promise.resolve(jsonResponse(logPage))
      }),
    )
    const query: LogQuery = { source: 'loki', role: 'operator' }
    const result = await getSameRecord({ traceId: 'trace_99' }, query)
    expect(result.postgres).toEqual(logPage.data)
    expect(result.loki).toEqual(logPage.data)
    expect(urls.every((u) => u.includes('traceId=trace_99') && u.includes('limit=1'))).toBe(true)
  })
})

describe('MaintenanceApiError', () => {
  /** The name is set for instanceof-free identification in catch handlers. */
  it('sets name to MaintenanceApiError', () => {
    const err = new MaintenanceApiError(404, 'not found')
    expect(err.name).toBe('MaintenanceApiError')
  })

  /** The status is accessible as a property. */
  it('exposes the HTTP status', () => {
    const err = new MaintenanceApiError(403, 'forbidden')
    expect(err.status).toBe(403)
  })
})

describe('getRetention — exact URL path', () => {
  afterEach(() => vi.unstubAllGlobals())

  /** The GET must request the /maintenance/retention path. */
  it('requests the exact /maintenance/retention path', async () => {
    let capturedUrl = ''
    vi.stubGlobal(
      'fetch',
      vi.fn((url: string) => {
        capturedUrl = url
        return Promise.resolve(
          jsonResponse({
            retentionDays: 30,
            nextSweep: '2026-06-05T00:00:00.000Z',
            pendingRows: 0,
          }),
        )
      }),
    )
    await getRetention(RBAC)
    expect(capturedUrl).toContain('/maintenance/retention')
  })
})

describe('updateRetention — exact URL and headers', () => {
  afterEach(() => vi.unstubAllGlobals())

  /** The PATCH must target /maintenance/retention with the content-type header. */
  it('PATCHes /maintenance/retention with content-type application/json', async () => {
    let captured: { url: string; headers: Record<string, string> } = { url: '', headers: {} }
    vi.stubGlobal(
      'fetch',
      vi.fn((url: string, init?: RequestInit) => {
        captured = { url, headers: (init?.headers ?? {}) as Record<string, string> }
        return Promise.resolve(
          jsonResponse({ retentionDays: 7, nextSweep: '2026-06-05T00:00:00.000Z', pendingRows: 0 }),
        )
      }),
    )
    await updateRetention(7, RBAC)
    expect(captured.url).toContain('/maintenance/retention')
    expect(captured.headers['content-type']).toBe('application/json')
  })

  /**
   * The PATCH must also carry `Accept: application/json` so the server knows
   * the client expects a JSON response body. Asserting the exact value kills
   * the StringLiteral→"" mutation on the Accept header value.
   */
  it('sends Accept: application/json header on the PATCH', async () => {
    let capturedHeaders: Record<string, string> = {}
    vi.stubGlobal(
      'fetch',
      vi.fn((_url: string, init?: RequestInit) => {
        capturedHeaders = (init?.headers ?? {}) as Record<string, string>
        return Promise.resolve(
          jsonResponse({ retentionDays: 7, nextSweep: '2026-06-05T00:00:00.000Z', pendingRows: 0 }),
        )
      }),
    )
    await updateRetention(7, RBAC)
    expect(capturedHeaders['Accept']).toBe('application/json')
  })
})

describe('getAuditEvents — exact URL path and error path', () => {
  afterEach(() => vi.unstubAllGlobals())

  /** The GET must request the /audit path. */
  it('requests the exact /audit path', async () => {
    let capturedUrl = ''
    vi.stubGlobal(
      'fetch',
      vi.fn((url: string) => {
        capturedUrl = url
        return Promise.resolve(jsonResponse([]))
      }),
    )
    await getAuditEvents(RBAC)
    expect(capturedUrl).toContain('/audit')
  })

  /** A non-2xx response must throw a MaintenanceApiError. */
  it('throws MaintenanceApiError on a non-ok response', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(() => Promise.resolve(jsonResponse(null, { ok: false, status: 403 }))),
    )
    await expect(getAuditEvents(RBAC)).rejects.toBeInstanceOf(MaintenanceApiError)
  })
})

describe('getActiveRedactPaths — exact URL path and error path', () => {
  afterEach(() => vi.unstubAllGlobals())

  /** The GET must request the /logger/redact-paths path. */
  it('requests the exact /logger/redact-paths path', async () => {
    let capturedUrl = ''
    vi.stubGlobal(
      'fetch',
      vi.fn((url: string) => {
        capturedUrl = url
        return Promise.resolve(jsonResponse(['req.body.password']))
      }),
    )
    await getActiveRedactPaths(RBAC)
    expect(capturedUrl).toContain('/logger/redact-paths')
  })

  /** A non-2xx response must throw a MaintenanceApiError. */
  it('throws MaintenanceApiError on a non-ok response', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(() => Promise.resolve(jsonResponse(null, { ok: false, status: 403 }))),
    )
    await expect(getActiveRedactPaths(RBAC)).rejects.toBeInstanceOf(MaintenanceApiError)
  })
})

describe('exportLogs — header value boundary', () => {
  afterEach(() => vi.unstubAllGlobals())

  /**
   * The `x-export-truncated` comparison is strict equality against the string `'true'`.
   * A header present with value `'false'` must NOT set truncated=true.
   */
  it('reports truncated=false when the header value is "false"', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(() =>
        Promise.resolve(jsonResponse([], { headers: { 'x-export-truncated': 'false' } })),
      ),
    )
    const result = await exportLogs('json', { source: 'postgres', role: 'admin' })
    expect(result.truncated).toBe(false)
  })

  /**
   * An `x-export-truncated: 1` value is not strictly `'true'` and must also be
   * treated as non-truncated.
   */
  it('reports truncated=false when the header value is "1"', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(() => Promise.resolve(jsonResponse([], { headers: { 'x-export-truncated': '1' } }))),
    )
    const result = await exportLogs('json', { source: 'postgres', role: 'admin' })
    expect(result.truncated).toBe(false)
  })
})

describe('getJson — Accept header and error message format', () => {
  afterEach(() => vi.unstubAllGlobals())

  /**
   * The request must carry `Accept: application/json` and the thrown error
   * message must not be empty. Both assertions kill their respective
   * StringLiteral mutations: the Accept header value and the template literal
   * that produces `'${status} ${statusText}'`.
   */
  it('sends Accept: application/json and produces a non-empty error message', async () => {
    let captured: Record<string, string> = {}
    vi.stubGlobal(
      'fetch',
      vi.fn((_url: string, init?: RequestInit) => {
        captured = (init?.headers ?? {}) as Record<string, string>
        return Promise.resolve(jsonResponse(null, { ok: false, status: 503 }))
      }),
    )
    const err = await getRetention(RBAC).catch((e) => e)
    expect(captured['Accept']).toBe('application/json')
    // The message format is '${status} ${statusText}' — must not be empty.
    expect(err.message).toBe('503 OK')
  })
})

describe('updateRetention — error message format', () => {
  afterEach(() => vi.unstubAllGlobals())

  /**
   * The thrown MaintenanceApiError message must equal `'${status} ${statusText}'`.
   * Asserting the exact non-empty format kills the StringLiteral mutation that
   * replaces the whole template literal with an empty string.
   */
  it('produces a non-empty error message on a non-ok PATCH response', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(() => Promise.resolve(jsonResponse(null, { ok: false, status: 500 }))),
    )
    const err = await updateRetention(7, RBAC).catch((e) => e)
    expect(err.message).toBe('500 OK')
  })
})

describe('exportLogs — error message format', () => {
  afterEach(() => vi.unstubAllGlobals())

  /**
   * The thrown MaintenanceApiError message must equal `'${status} ${statusText}'`.
   * Asserting the exact format kills the StringLiteral mutation that replaces
   * the template literal with an empty string.
   */
  it('produces a non-empty error message on a non-ok export response', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(() => Promise.resolve(jsonResponse(null, { ok: false, status: 403 }))),
    )
    const err = await exportLogs('json', { source: 'postgres', role: 'viewer' }).catch((e) => e)
    expect(err.message).toBe('403 OK')
  })
})

describe('API base URL — default localhost', () => {
  afterEach(() => vi.unstubAllGlobals())

  /**
   * When `NEXT_PUBLIC_API_URL` is not set the governance client falls back to
   * `http://localhost:3001`. Asserting that the captured URL starts with that
   * prefix kills both mutations on the fallback expression: the `LogicalOperator`
   * that swaps `??` for `&&` (yielding `undefined` when the env var is absent)
   * and the `StringLiteral→""` that empties the fallback string.
   */
  it('prefixes governance requests with the http://localhost:3001 base URL', async () => {
    let capturedUrl = ''
    vi.stubGlobal(
      'fetch',
      vi.fn((url: string) => {
        capturedUrl = url
        return Promise.resolve(
          jsonResponse({
            retentionDays: 30,
            nextSweep: '2026-06-05T00:00:00.000Z',
            pendingRows: 0,
          }),
        )
      }),
    )
    await getRetention(RBAC)
    expect(capturedUrl).toMatch(/^http:\/\/localhost:3001\//)
  })
})

describe('exportLogs — no role omits x-role header', () => {
  afterEach(() => vi.unstubAllGlobals())

  /**
   * When `query.role` is undefined the export helper must take the `{}` headers
   * branch rather than calling `rbacHeaders`. `toEqual({})` ignores
   * `undefined`-valued properties, so this test uses `not.toHaveProperty` to
   * detect the ConditionalExpression→true mutation that always calls
   * `rbacHeaders({ role: undefined, … })` and sets `headers['x-role'] = undefined`.
   */
  it('does not attach x-role when the query has no role', async () => {
    let capturedHeaders: Record<string, string> = {}
    vi.stubGlobal(
      'fetch',
      vi.fn((_url: string, init?: RequestInit) => {
        capturedHeaders = (init?.headers ?? {}) as Record<string, string>
        return Promise.resolve(jsonResponse([]))
      }),
    )
    await exportLogs('json', { source: 'postgres' })
    expect(capturedHeaders).not.toHaveProperty('x-role')
  })
})
