/**
 * @fileoverview Typed client for the Maintenance & Governance API — retention
 * status/config, the read-only audit trail, the active redact-path list, the
 * filtered log export, and the side-by-side "same record" proof.
 *
 * Export and the same-record proof reuse the Explorer's exact `LogQuery` (and its
 * RBAC headers) via the shared `api-client`, so there is no second, divergent
 * filter path. Shapes mirror the `apps/api` controllers exactly.
 *
 * @module lib/maintenance-api
 */

import { z, type ZodType } from 'zod'

import type { LogQuery, LogRow, RbacContext } from './types'
import { rbacHeaders } from './rbac-headers'
import { encodeLogQuery, getExportUrl, getLogs } from './api-client'

/** API base URL — the governance API. Defaults to the local `apps/api` port. */
const API = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001'

/** Error thrown for any non-2xx maintenance response (carries the HTTP status). */
export class MaintenanceApiError extends Error {
  /**
   * @param status - HTTP status of the failed response.
   * @param message - Human-readable message.
   */
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message)
    this.name = 'MaintenanceApiError'
  }
}

/**
 * GET a JSON resource with the active RBAC headers, validated at the boundary.
 *
 * @typeParam T - The expected JSON payload type.
 * @param path - Path relative to the API base (e.g. `/maintenance/retention`).
 * @param schema - Zod schema validating the response shape before it is trusted.
 * @param rbac - The active role + tenant, sent as `x-role` / `x-tenant-id`.
 * @returns The parsed, shape-validated JSON payload.
 * @throws {MaintenanceApiError} When the status is not 2xx, or the body fails validation.
 */
async function getJson<T>(path: string, schema: ZodType, rbac: RbacContext): Promise<T> {
  const res = await fetch(`${API}${path}`, {
    headers: { Accept: 'application/json', ...rbacHeaders(rbac) },
  })
  if (!res.ok) throw new MaintenanceApiError(res.status, `${res.status} ${res.statusText}`)
  const parsed = schema.safeParse(await res.json())
  if (!parsed.success) {
    throw new MaintenanceApiError(res.status, `unexpected response shape for ${path}`)
  }
  // Shape validated at the boundary above; the cast bridges the schema to the
  // typed API contract.
  return parsed.data as T
}

// ── Retention ────────────────────────────────────────────────────────────────

/** Retention status returned by `GET /maintenance/retention`. */
export interface RetentionStatus {
  /** Postgres TTL window in days (`RETENTION_DAYS`, default 30). */
  retentionDays: number
  /** ISO timestamp of the next scheduled sweep (next midnight UTC). */
  nextSweep: string
  /** Rows currently older than the TTL, pending deletion at the next sweep. */
  pendingRows: number
}

/** Boundary schema for the retention status envelope. */
const retentionStatusSchema = z.object({
  retentionDays: z.number(),
  nextSweep: z.string(),
  pendingRows: z.number(),
})

/**
 * Read the retention status (`GET /maintenance/retention`, operator+ only).
 *
 * @param rbac - The active role + tenant, sent as `x-role` / `x-tenant-id`.
 * @returns The TTL window, the next sweep time, and the pending-row count.
 * @throws {MaintenanceApiError} When the status is not 2xx, or the body fails validation.
 */
export const getRetention = (rbac: RbacContext): Promise<RetentionStatus> =>
  getJson<RetentionStatus>('/maintenance/retention', retentionStatusSchema, rbac)

/**
 * Update the TTL window (`PATCH /maintenance/retention`, admin only).
 *
 * @param retentionDays - The new Postgres TTL window in days.
 * @param rbac - The active role + tenant, sent as `x-role` / `x-tenant-id`.
 * @returns The updated retention status (TTL window, next sweep, pending rows).
 * @throws {MaintenanceApiError} When the status is not 2xx, or the body fails validation.
 */
export async function updateRetention(
  retentionDays: number,
  rbac: RbacContext,
): Promise<RetentionStatus> {
  const res = await fetch(`${API}/maintenance/retention`, {
    method: 'PATCH',
    headers: {
      'content-type': 'application/json',
      Accept: 'application/json',
      ...rbacHeaders(rbac),
    },
    body: JSON.stringify({ retentionDays }),
  })
  if (!res.ok) throw new MaintenanceApiError(res.status, `${res.status} ${res.statusText}`)
  const parsed = retentionStatusSchema.safeParse(await res.json())
  if (!parsed.success) {
    throw new MaintenanceApiError(
      res.status,
      'unexpected response shape for PATCH /maintenance/retention',
    )
  }
  return parsed.data
}

// ── Audit trail ──────────────────────────────────────────────────────────────

/** One audit event (`AuditEvent` row) — an action, never a login. */
export interface AuditEvent {
  id: string
  actor: string
  action: string
  target: string
  tenantId: string | null
  at: string
}

/** Boundary schema for a single audit event. */
const auditEventSchema = z.object({
  id: z.string(),
  actor: z.string(),
  action: z.string(),
  target: z.string(),
  tenantId: z.string().nullable(),
  at: z.string(),
})

/** Boundary schema for the audit trail (newest-first array of events). */
const auditEventsSchema = z.array(auditEventSchema)

/**
 * Read the audit trail (`GET /audit`, operator+ only), newest-first.
 *
 * @param rbac - The active role + tenant, sent as `x-role` / `x-tenant-id`.
 * @returns The audit events ordered newest-first.
 * @throws {MaintenanceApiError} When the status is not 2xx, or the body fails validation.
 */
export const getAuditEvents = (rbac: RbacContext): Promise<AuditEvent[]> =>
  getJson<AuditEvent[]>('/audit', auditEventsSchema, rbac)

// ── Redaction ────────────────────────────────────────────────────────────────

/** Boundary schema for the active redact-path list. */
const redactPathsSchema = z.array(z.string())

/**
 * Fetch the active redact-path list (`GET /logger/redact-paths`, operator+ only).
 *
 * The list comes from `LogAuditService.listEffectiveRedactPaths()` (library
 * defaults + app extensions) — never hardcoded in the browser. The server gates
 * this endpoint to operator/admin, so the active RBAC headers must be attached.
 *
 * @param rbac - The active role + tenant, sent as `x-role` / `x-tenant-id`.
 * @returns The effective redact-path strings.
 * @throws {MaintenanceApiError} When the status is not 2xx, or the body fails validation.
 */
export const getActiveRedactPaths = (rbac: RbacContext): Promise<string[]> =>
  getJson<string[]>('/logger/redact-paths', redactPathsSchema, rbac)

// ── Export ───────────────────────────────────────────────────────────────────

/** A downloaded export plus whether the server hit the 100k-row cap. */
export interface ExportResult {
  blob: Blob
  /** `true` when the server signalled `X-Export-Truncated` (result exceeded 100k rows). */
  truncated: boolean
}

/**
 * Export the current filtered result set as JSON or CSV.
 *
 * Reuses the Explorer's exact {@link LogQuery} (filters + window + source +
 * `tenantId` RBAC restriction) and reads the `X-Export-Truncated` header so the
 * caller can surface the truncation banner. RBAC is enforced server-side
 * (viewers receive 403).
 *
 * @param format - `json` or `csv`.
 * @param query - The active Explorer query to export.
 * @returns The downloaded blob plus the truncation flag.
 * @throws {MaintenanceApiError} When the response status is not 2xx.
 */
export async function exportLogs(format: 'json' | 'csv', query: LogQuery): Promise<ExportResult> {
  const headers =
    query.role !== undefined
      ? rbacHeaders({ role: query.role, tenantId: query.tenantId ?? '' })
      : {}
  const res = await fetch(getExportUrl(format, query), { headers })
  if (!res.ok) throw new MaintenanceApiError(res.status, `${res.status} ${res.statusText}`)
  const truncated = res.headers.get('x-export-truncated') === 'true'
  return { blob: await res.blob(), truncated }
}

/**
 * Re-export the human-facing export URL builder under the public maintenance name
 * so panels can show the download URL without depending on `api-client` directly.
 */
export { getExportUrl as exportUrl }

/** Re-export so panels can show the encoded query string without re-deriving it. */
export { encodeLogQuery }

// ── Same record (redaction proof) ────────────────────────────────────────────

/** The same logical entry fetched from both backends for the side-by-side proof. */
export interface SameRecord {
  postgres: LogRow[]
  loki: LogRow[]
}

/**
 * Fetch the same record from Postgres and Loki for the redaction-at-source proof.
 *
 * @param id - Exactly one correlation id (`requestId` or `traceId`).
 * @param query - The active query (supplies the time window + RBAC).
 * @returns The matching row(s) from each backend (both already redacted).
 */
export async function getSameRecord(
  id: { requestId?: string; traceId?: string },
  query: LogQuery,
): Promise<SameRecord> {
  const base: LogQuery = { ...query, limit: 1, ...id }
  const [postgres, loki] = await Promise.all([
    getLogs({ ...base, source: 'postgres' }),
    getLogs({ ...base, source: 'loki' }),
  ])
  return { postgres: postgres.data, loki: loki.data }
}
