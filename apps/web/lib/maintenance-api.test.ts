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
})
