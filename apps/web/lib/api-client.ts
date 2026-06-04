/**
 * @fileoverview Typed fetch wrappers for the `apps/api` `logs/` read-API.
 *
 * A single {@link apiFetch} helper centralizes the base URL, JSON parsing, the
 * RBAC headers, and non-2xx → {@link ApiError} mapping. {@link encodeLogQuery}
 * serializes a {@link LogQuery} to a query string (re-used by the SSE hook).
 * Charts are fed by the server-side `/logs/aggregate` endpoint — the browser
 * never aggregates raw rows.
 *
 * @module lib/api-client
 */

import type { ZodType } from 'zod'

import type {
  AggregateMetric,
  AggregateRowMap,
  ContextResult,
  FacetField,
  FacetsResult,
  LogPage,
  LogQuery,
} from './types'
import { ApiError } from './types'
import {
  aggregateRowSchemas,
  contextResultSchema,
  facetsResultSchema,
  logPageSchema,
} from './schemas'

/** API base URL — the `logs/` read-API. Defaults to the local `apps/api` port. */
const BASE = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001'

/** Default surrounding-line count for the context endpoint (matches the API default). */
export const DEFAULT_CONTEXT_LINES = 10

/**
 * Serialize a {@link LogQuery} to a URL query string.
 *
 * `role` is intentionally omitted — it travels as the `x-role` RBAC header. The
 * `level` `{ gte }` form is encoded as `level[gte]=...` so the API's extended
 * query parser reconstructs the object.
 *
 * @param q - The filter to serialize.
 * @returns A URL-encoded query string (without the leading `?`).
 */
export function encodeLogQuery(q: LogQuery): string {
  const p = new URLSearchParams()
  for (const [key, value] of Object.entries(q)) {
    if (value === undefined || value === null) continue
    // RBAC role is a header, not a query param — see rbacHeaders().
    if (key === 'role') continue
    if (key === 'level' && typeof value === 'object') {
      p.set('level[gte]', (value as { gte: string }).gte)
    } else {
      p.set(key, String(value))
    }
  }
  return p.toString()
}

/**
 * Build the RBAC headers for a request from the query's `role` / `tenantId`.
 *
 * The API resolves access from `x-role` + `x-tenant-id`; sending them is what
 * makes the tenant/role switcher actually scope the data.
 *
 * @param q - The filter carrying the active role and tenant.
 * @returns A headers record with the RBAC fields that are present.
 */
export function rbacHeaders(q: LogQuery): Record<string, string> {
  const headers: Record<string, string> = {}
  if (q.role !== undefined) headers['x-role'] = q.role
  if (q.tenantId !== undefined && q.tenantId !== '') headers['x-tenant-id'] = q.tenantId
  return headers
}

/**
 * Base fetch helper — prefixes the API base URL, sets JSON + RBAC headers, and
 * maps any non-2xx response to a thrown {@link ApiError}.
 *
 * @typeParam T - The expected JSON payload type.
 * @param path - Path relative to the API base (e.g. `/logs?...`).
 * @param schema - Zod schema validating the response shape at the boundary.
 * @param init - Optional fetch init; its `headers` are merged last.
 * @returns The parsed, shape-validated JSON payload.
 * @throws {ApiError} When the response status is not 2xx, or the body fails validation.
 */
async function apiFetch<T>(path: string, schema: ZodType, init?: RequestInit): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    ...init,
    headers: { Accept: 'application/json', ...(init?.headers ?? {}) },
  })
  if (!res.ok) throw new ApiError(res.status, `${res.status} ${res.statusText}`)
  const parsed = schema.safeParse(await res.json())
  if (!parsed.success) throw new ApiError(res.status, `unexpected response shape for ${path}`)
  // Shape validated at the boundary above; the cast bridges the permissive schema
  // to the typed read-API contract.
  return parsed.data as T
}

/**
 * Fetch a keyset page of logs.
 *
 * @param q - The active filter (its `cursor` selects the page).
 * @returns A page of rows plus the next keyset cursor.
 */
export const getLogs = (q: LogQuery): Promise<LogPage> =>
  apiFetch<LogPage>(`/logs?${encodeLogQuery(q)}`, logPageSchema, { headers: rbacHeaders(q) })

/**
 * Fetch a time-bucketed aggregate series for a chart panel.
 *
 * @typeParam M - The metric, narrowing the returned row shape.
 * @param metric - One of `volume` / `errorRate` / `latency` / `statusMix`.
 * @param q - The active filter (time window + source).
 * @returns The metric-specific array of buckets.
 */
export const getAggregate = <M extends AggregateMetric>(
  metric: M,
  q: LogQuery,
): Promise<Array<AggregateRowMap[M]>> =>
  apiFetch<Array<AggregateRowMap[M]>>(
    `/logs/aggregate?metric=${metric}&${encodeLogQuery(q)}`,
    aggregateRowSchemas[metric],
    { headers: rbacHeaders(q) },
  )

/**
 * Fetch facet values + counts for the Explorer rail.
 *
 * @param fields - The bounded-dimension fields to facet.
 * @param q - The active filter (counts reflect it + the time window).
 * @returns A map of field → `{ value, count }[]` sorted by count.
 */
export const getFacets = (fields: FacetField[], q: LogQuery): Promise<FacetsResult> =>
  apiFetch<FacetsResult>(
    `/logs/facets?fields=${fields.join(',')}&${encodeLogQuery(q)}`,
    facetsResultSchema,
    { headers: rbacHeaders(q) },
  )

/** Parameters for the detail drawer's Context tab. */
export interface ContextParams {
  /** Anchor correlation id — exactly one of these is required by the API. */
  requestId?: string
  traceId?: string
  /** Lines strictly before / after the anchor (default 10 each, max 100). */
  before?: number
  after?: number
}

/**
 * Fetch surrounding log lines for a correlation id (Context tab).
 *
 * @param params - The anchor correlation id plus before/after counts.
 * @param q - The active filter (supplies source + RBAC).
 * @returns `{ before, match, after }` ordered oldest→newest.
 */
export const getContext = (params: ContextParams, q: LogQuery): Promise<ContextResult> => {
  const p = new URLSearchParams({ source: q.source })
  if (params.requestId !== undefined) p.set('requestId', params.requestId)
  if (params.traceId !== undefined) p.set('traceId', params.traceId)
  p.set('before', String(params.before ?? DEFAULT_CONTEXT_LINES))
  p.set('after', String(params.after ?? DEFAULT_CONTEXT_LINES))
  return apiFetch<ContextResult>(`/logs/context?${p.toString()}`, contextResultSchema, {
    headers: rbacHeaders(q),
  })
}

/**
 * Build the export download URL for the current filter.
 *
 * Returned as a plain URL because exports stream a file attachment; RBAC is
 * enforced server-side (viewers receive 403).
 *
 * @param format - `json` or `csv`.
 * @param q - The active filter to export.
 * @returns A fully-qualified export URL.
 */
export const getExportUrl = (format: 'json' | 'csv', q: LogQuery): string =>
  `${BASE}/logs/export?format=${format}&${encodeLogQuery(q)}`
