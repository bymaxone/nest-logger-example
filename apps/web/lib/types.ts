/**
 * @fileoverview Shared client types for the logs dashboard data layer.
 *
 * Bridges the `apps/api` `logs/` read-API to `apps/web`. `LogLevel` and the raw
 * `LogEntry` payload shape are imported from the isomorphic
 * `@bymax-one/nest-logger/shared` subpath (never redefined); the row, page, and
 * aggregate response shapes mirror exactly what each endpoint returns.
 *
 * Note: `GET /logs` returns rows projected from the Postgres `ApplicationLog`
 * model (string `level`, `message`, ISO `time`) — a different shape from the
 * library's wire `LogEntry` (numeric `level`, `msg`). `LogRow` models the API
 * row; the row's `payload` field is the full, already-redacted `LogEntry`.
 *
 * @module lib/types
 */

// Isomorphic subpath ONLY — never import the server `.` root in the browser bundle.
import type { LogEntry, LogLevel } from '@bymax-one/nest-logger/shared'

export type { LogEntry, LogLevel }

/** Backend that answers a query — the global source toggle. */
export type LogSource = 'postgres' | 'loki'

/** RBAC role driving query-based access control (sent as the `x-role` header). */
export type RbacRole = 'viewer' | 'operator' | 'admin'

/** Server-side aggregate metric backing each chart panel. */
export type AggregateMetric = 'volume' | 'errorRate' | 'latency' | 'statusMix'

/** Bounded-dimension field that may be faceted in the Explorer rail. */
export type FacetField = 'level' | 'service' | 'logKey' | 'tenantId'

/**
 * Shared filter object accepted by every `logs/` read endpoint.
 *
 * Serialized to a query string by {@link encodeLogQuery}. `role` is the lone
 * exception — it travels as the `x-role` RBAC header, never a query param.
 * `level` is either an exact level or a `{ gte }` "at or above" comparison.
 */
export interface LogQuery {
  /** Exact level (`level:error`) or an at-or-above comparison (`level>=warn`). */
  level?: LogLevel | { gte: LogLevel }
  /** Exact key or a `PREFIX_*` wildcard. */
  logKey?: string
  service?: string
  tenantId?: string
  traceId?: string
  requestId?: string
  /** Free-text message contains (ILIKE in Postgres / `|=` in LogQL). */
  q?: string
  /** ISO-8601 window start; omitted ⇒ the API applies `now-1h`. */
  from?: string
  /** ISO-8601 window end; omitted ⇒ the API applies `now`. */
  to?: string
  /** Which backend answers — the global source toggle. */
  source: LogSource
  /** RBAC role; sent as the `x-role` header, never serialized to the query string. */
  role?: RbacRole
  /** Opaque keyset cursor `(time, id)` from a prior page. */
  cursor?: string
  /** Page size (default 100, max 1000). */
  limit?: number
}

/**
 * A single log row as returned by `GET /logs` / `GET /logs/context`.
 *
 * Mirrors the Postgres `ApplicationLog` projection. `time` is an ISO string over
 * the wire; `payload` is the full, already-redacted entry shown in the Raw JSON tab.
 */
export interface LogRow {
  id: string
  time: string
  level: LogLevel
  logKey: string
  message: string
  service: string
  tenantId?: string | null
  requestId?: string | null
  traceId?: string | null
  spanId?: string | null
  status?: number | null
  durationMs?: number | null
  /**
   * The full, already-redacted entry shown in the Raw JSON tab. From `/logs` this
   * is the stored {@link LogEntry}; from the SSE tail it is the bus entry. Typed
   * as a generic JSON object to cover both shapes.
   */
  payload?: Record<string, unknown>
  /** Present on rows delivered via the SSE live tail — the keyset cursor / event id. */
  cursor?: string
}

/** Page of log rows plus the opaque keyset cursor for the next (older) page. */
export interface LogPage {
  data: LogRow[]
  nextCursor: string | null
  hasMore: boolean
}

/** One zero-filled volume bucket: timestamp, level, and count. */
export interface VolumeRow {
  bucket: string
  level: string
  n: number
}

/** One error-rate bucket: timestamp and the `(4xx+5xx)/total` ratio. */
export interface ErrorRateRow {
  bucket: string
  errorRate: number | null
}

/** One latency bucket: timestamp and p50/p95/p99 over `durationMs`. */
export interface LatencyRow {
  bucket: string
  p50: number | null
  p95: number | null
  p99: number | null
}

/** One status-mix bucket: timestamp and counts per status class. */
export interface StatusMixRow {
  bucket: string
  s2xx: number
  s3xx: number
  s4xx: number
  s5xx: number
}

/** Maps each aggregate metric to its row shape so wrappers stay type-safe. */
export type AggregateRowMap = {
  volume: VolumeRow
  errorRate: ErrorRateRow
  latency: LatencyRow
  statusMix: StatusMixRow
}

/** One facet value with its count in the current filter + time window. */
export interface FacetValue {
  value: string
  count: number
}

/** Map of faceted field → its sorted value list (a field is absent if not requested). */
export type FacetsResult = Partial<Record<FacetField, FacetValue[]>>

/** Surrounding log lines returned by `GET /logs/context`. */
export interface ContextResult {
  before: LogRow[]
  match: LogRow | null
  after: LogRow[]
}

/**
 * Error thrown by {@link apiFetch} for any non-2xx response.
 *
 * Carries the HTTP `status` so callers (hooks, components) can branch — e.g. a
 * `410` resets keyset pagination, a `403` surfaces an RBAC denial.
 */
export class ApiError extends Error {
  /**
   * @param status - The HTTP status code of the failed response.
   * @param message - A human-readable error message.
   */
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message)
    this.name = 'ApiError'
  }
}
