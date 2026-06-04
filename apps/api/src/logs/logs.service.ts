/**
 * Dual query compiler and cursor codec for the `logs/` read-API.
 *
 * Layer: logs/service. Compiles a validated `LogQueryDto` into:
 *   - A Prisma `ApplicationLogWhereInput` (Postgres path).
 *   - A LogQL selector + pipeline string (Loki path).
 *
 * These two outputs are what the Explorer's "show generated SQL / show generated LogQL"
 * teaching toggles render. The keyset cursor (opaque base64 of `{time, id}`) lives here
 * so every endpoint sharing the codec behaves identically.
 *
 * RBAC: callers pass an optional `restriction` `{ tenantId }` that is ANDed into BOTH
 * outputs and cannot be widened by the incoming query — the restriction wins.
 *
 * See `docs/DASHBOARD.md` §12–§13 for the full mapping table.
 *
 * @module
 */
import { Injectable } from '@nestjs/common'
import type { LogLevel } from '@bymax-one/nest-logger/shared'
import type { Prisma } from '@prisma/client'

import type { LogQueryDto } from './dto/log-query.dto.js'

/** Pino numeric rank for each level — higher value = higher severity. */
const LEVEL_RANK: Record<LogLevel, number> = {
  fatal: 60,
  error: 50,
  warn: 40,
  info: 30,
  debug: 20,
  trace: 10,
}

/**
 * Escape a string value for safe interpolation into a LogQL label selector or pipeline filter.
 * Doubles backslashes and escapes double-quotes so the value cannot break the selector.
 */
function escapeLogQL(v: string): string {
  return v.replace(/\\/g, '\\\\').replace(/"/g, '\\"')
}

/** Returns all levels whose severity is at or above `min`. */
function levelsAtOrAbove(min: LogLevel): LogLevel[] {
  return (Object.keys(LEVEL_RANK) as LogLevel[]).filter((l) => LEVEL_RANK[l] >= LEVEL_RANK[min])
}

/**
 * Thrown when `decodeCursor` receives a value that is not a valid keyset cursor.
 * Controllers map this to HTTP 410 Gone so clients know to restart pagination.
 */
export class StaleCursorError extends Error {
  constructor(message = 'cursor is stale or malformed') {
    super(message)
    this.name = 'StaleCursorError'
  }
}

/** RBAC restriction injected by callers — overrides the incoming query's `tenantId`. */
export interface QueryRestriction {
  tenantId?: string
}

/**
 * Dual query compiler and keyset cursor codec.
 *
 * @example
 * ```typescript
 * const where = service.buildPrismaWhere(query, { tenantId: 'acme' })
 * const logql = service.buildLogQL(query, { tenantId: 'acme' })
 * ```
 */
@Injectable()
export class LogsService {
  /** Default time window start: 1 hour before now. */
  private defaultFrom(): string {
    return new Date(Date.now() - 60 * 60 * 1000).toISOString()
  }

  /** Default time window end: now. */
  private defaultTo(): string {
    return new Date().toISOString()
  }

  /**
   * Compile a `LogQueryDto` into a Prisma `ApplicationLog` where clause.
   *
   * The `restriction.tenantId` (when provided) overrides `q.tenantId` and cannot be
   * widened by the caller — RBAC reuses this query layer, never a second path.
   *
   * @param q - Validated filter DTO.
   * @param restriction - Optional RBAC restriction; takes precedence over `q.tenantId`.
   * @returns Prisma where clause for the `application_logs` table.
   */
  buildPrismaWhere(
    q: LogQueryDto,
    restriction?: QueryRestriction,
  ): Prisma.ApplicationLogWhereInput {
    const from = new Date(q.from ?? this.defaultFrom())
    const to = new Date(q.to ?? this.defaultTo())
    const where: Prisma.ApplicationLogWhereInput = {
      time: { gte: from, lte: to },
    }

    if (q.level !== undefined) {
      if (typeof q.level === 'string') {
        where.level = q.level
      } else {
        where.level = { in: levelsAtOrAbove(q.level.gte) }
      }
    }

    if (q.logKey !== undefined) {
      where.logKey = q.logKey.endsWith('_*') ? { startsWith: q.logKey.slice(0, -1) } : q.logKey
    }

    if (q.service !== undefined) where.service = q.service
    if (q.traceId !== undefined) where.traceId = q.traceId
    if (q.requestId !== undefined) where.requestId = q.requestId
    if (q.q !== undefined) where.message = { contains: q.q, mode: 'insensitive' }

    // RBAC: restriction.tenantId wins — it cannot be widened by the incoming query.
    const tenantId = restriction?.tenantId ?? q.tenantId
    if (tenantId !== undefined) where.tenantId = tenantId

    return where
  }

  /**
   * Compile a `LogQueryDto` into a Loki LogQL selector + pipeline string.
   *
   * The `restriction.tenantId` is injected into the pipeline for RBAC parity with
   * the Postgres path. Malformed lines are dropped via `| __error__=""`.
   *
   * @param q - Validated filter DTO.
   * @param restriction - Optional RBAC restriction; takes precedence over `q.tenantId`.
   * @returns A valid LogQL string (e.g. `{service="api"} | json | level="error"`).
   */
  buildLogQL(q: LogQueryDto, restriction?: QueryRestriction): string {
    // NOTE: Loki requires at least one label selector. When the caller omits `service`,
    // we default to `"api"` — the primary stream for this demo. The Postgres path applies
    // no service filter when `service` is undefined, so the two backends return different
    // row sets for the same query without a service filter. This asymmetry is intentional
    // (documented in `DASHBOARD.md` §4) and explained by the source-toggle callout.
    const serviceName = q.service ?? 'api'
    const labels = [`service="${escapeLogQL(serviceName)}"`]

    const pipeline: string[] = ['| json', '| __error__=""']

    if (q.level !== undefined) {
      if (typeof q.level === 'string') {
        pipeline.push(`| level="${escapeLogQL(q.level)}"`)
      } else {
        const levels = levelsAtOrAbove(q.level.gte)
        pipeline.push(`| level=~"${levels.join('|')}"`)
      }
    }

    if (q.logKey !== undefined) {
      if (q.logKey.endsWith('_*')) {
        // Slice only the `*` — preserve the trailing `_` so the regex is `PAYMENT_.*`.
        pipeline.push(`| logKey=~"${escapeLogQL(q.logKey.slice(0, -1))}.*"`)
      } else {
        pipeline.push(`| logKey="${escapeLogQL(q.logKey)}"`)
      }
    }

    // RBAC: restriction.tenantId wins over the incoming query's tenantId.
    const tenantId = restriction?.tenantId ?? q.tenantId
    if (tenantId !== undefined) pipeline.push(`| tenantId="${escapeLogQL(tenantId)}"`)

    if (q.traceId !== undefined) pipeline.push(`| traceId="${escapeLogQL(q.traceId)}"`)
    if (q.requestId !== undefined) pipeline.push(`| requestId="${escapeLogQL(q.requestId)}"`)

    // Free-text line filter uses `|=` — escape embedded quotes to prevent LogQL injection.
    const lineFilter = q.q !== undefined ? ` |= "${escapeLogQL(q.q)}"` : ''

    return `{${labels.join(',')}}${lineFilter} ${pipeline.join(' ')}`.trim()
  }

  /**
   * Encode a keyset cursor as an opaque base64url string.
   *
   * @param c - Cursor components: the log entry's `time` and `id`.
   * @returns Base64url-encoded JSON cursor.
   */
  encodeCursor(c: { time: Date; id: string }): string {
    return Buffer.from(JSON.stringify({ t: c.time.toISOString(), i: c.id })).toString('base64url')
  }

  /**
   * Decode an opaque base64url cursor back to `{ time, id }`.
   *
   * @param s - Base64url-encoded cursor from a prior response.
   * @returns Decoded cursor components.
   * @throws {StaleCursorError} When the cursor is missing, malformed, or contains an invalid date.
   */
  decodeCursor(s: string): { time: Date; id: string } {
    try {
      const json = Buffer.from(s, 'base64url').toString('utf8')
      const parsed = JSON.parse(json) as { t: unknown; i: unknown }
      const time = new Date(parsed.t as string)
      if (Number.isNaN(time.getTime()) || typeof parsed.i !== 'string') {
        throw new Error('bad cursor')
      }
      return { time, id: parsed.i }
    } catch {
      throw new StaleCursorError()
    }
  }
}
