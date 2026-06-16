/**
 * Loki-backed log list — the `source=loki` half of the Explorer table.
 *
 * Layer: logs/loki. Compiles the shared `LogQueryDto` to LogQL (via `LogsService`),
 * runs a Loki `query_range`, and maps the returned streams into the same
 * `{ data, nextCursor, hasMore }` envelope the Postgres path returns — so the
 * Explorer table is source-agnostic. This is what surfaces Loki's full-fidelity
 * `info`+ stream, which the durable Postgres tier (`warn`+) does not hold.
 *
 * Pagination is nanosecond-keyset: the cursor carries the last entry's Loki
 * timestamp; the next page queries `end = cursorNs - 1` (strictly older), so paging
 * is stable without OFFSET. Loki failures surface as HTTP 502 so the dashboard
 * degrades gracefully.
 *
 * @module
 */
import { BadGatewayException, Injectable } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import type { ApplicationLog, Prisma } from '@prisma/client'

import type { LogQueryDto } from './dto/log-query.dto.js'
import { LogsService, StaleCursorError, type QueryRestriction } from './logs.service.js'
import { LokiClient, LokiUnavailableError } from './loki.client.js'

/** Page envelope returned by both the Postgres and Loki list paths. */
export interface LogsPageResponse {
  data: ApplicationLog[]
  nextCursor: string | null
  hasMore: boolean
}

/** Loki stream `service` label when `OTEL_SERVICE_NAME` is unset — matches the destination default. */
const DEFAULT_SERVICE = 'nest-logger-example-api'
/** Nanoseconds per millisecond (Loki timestamps are nanosecond Unix). */
const NS_PER_MS = 1_000_000n

/**
 * Loki list service.
 *
 * Mirrors `LogsController.list`'s Postgres envelope so the Explorer table never
 * needs to know which backend answered.
 */
@Injectable()
export class LogsLokiService {
  constructor(
    private readonly logs: LogsService,
    private readonly client: LokiClient,
    private readonly config: ConfigService,
  ) {}

  /**
   * Loki-backed paged log list mirroring the Postgres `LogsController.list` shape.
   *
   * @param q - Validated filter + pagination DTO (with `source: 'loki'`).
   * @param restriction - Optional RBAC restriction injected by the controller.
   * @returns A page of mapped rows plus `nextCursor` / `hasMore`.
   * @throws {StaleCursorError} When the cursor is malformed (controller maps to HTTP 410).
   * @throws {BadGatewayException} HTTP 502 when Loki is unreachable.
   */
  async query(q: LogQueryDto, restriction?: QueryRestriction): Promise<LogsPageResponse> {
    // Loki streams are labelled with the OTel service name, not the literal "api"
    // that `buildLogQL` falls back to — resolve it so the selector matches a real stream.
    const service = q.service ?? this.config.get<string>('OTEL_SERVICE_NAME', DEFAULT_SERVICE)
    const logql = this.logs.buildLogQL({ ...q, service }, restriction)

    const now = Date.now()
    const startMs = new Date(q.from ?? new Date(now - 60 * 60 * 1000).toISOString()).getTime()
    const startNs = BigInt(startMs) * NS_PER_MS

    let resp: { data?: { result?: unknown[] } }
    try {
      resp = await this.client.queryRange(
        logql,
        startNs.toString(),
        this.endNanos(q, now).toString(),
        '60s',
        q.limit,
      )
    } catch (err) {
      if (err instanceof LokiUnavailableError) {
        throw new BadGatewayException(
          `Loki is unavailable — check LOKI_QUERY_URL. Detail: ${err.message}`,
        )
      }
      throw err
    }

    const rows = this.parse(resp)
    const page = rows.slice(0, q.limit)
    const hasMore = rows.length >= q.limit
    const last = page.at(-1)
    const nextCursor =
      hasMore && last !== undefined
        ? this.logs.encodeCursor({ time: last.time, id: last.id })
        : null
    return { data: page, nextCursor, hasMore }
  }

  /**
   * Resolve the Loki `end` timestamp (ns): the cursor boundary or the `to`/now window end.
   *
   * @param q - The validated query (its `cursor` and `to` drive the boundary).
   * @param now - `Date.now()` snapshot for the default window end.
   * @returns Nanosecond Unix timestamp marking the (inclusive) end of the query window.
   * @throws {StaleCursorError} When the cursor id is not a Loki nanosecond timestamp.
   */
  private endNanos(q: LogQueryDto, now: number): bigint {
    if (q.cursor === undefined) {
      return BigInt(new Date(q.to ?? new Date(now).toISOString()).getTime()) * NS_PER_MS
    }
    // The cursor id is the last entry's ns timestamp; page strictly older than it.
    const cursor = this.logs.decodeCursor(q.cursor)
    try {
      return BigInt(cursor.id) - 1n
    } catch {
      // A non-numeric id means the cursor came from the Postgres keyset — treat as stale
      // so the client restarts pagination from the top against this source.
      throw new StaleCursorError()
    }
  }

  /**
   * Flatten and map Loki `query_range` streams into newest-first `ApplicationLog` rows.
   * Malformed JSON lines are dropped (the LogQL pipeline already filters `__error__`).
   *
   * @param resp - The raw Loki `query_range` response body.
   * @returns Mapped rows sorted newest-first.
   */
  private parse(resp: { data?: { result?: unknown[] } }): ApplicationLog[] {
    const result = resp.data?.result
    if (!Array.isArray(result)) return []
    const rows: ApplicationLog[] = []
    for (const stream of result) {
      const values = (stream as { values?: unknown }).values
      const labels = (stream as { stream?: Record<string, unknown> }).stream ?? {}
      if (!Array.isArray(values)) continue
      for (const entry of values) {
        if (!Array.isArray(entry) || entry.length < 2) continue
        let line: Record<string, unknown>
        try {
          line = JSON.parse(String(entry[1])) as Record<string, unknown>
        } catch {
          continue
        }
        rows.push(this.toRow(String(entry[0]), line, labels))
      }
    }
    rows.sort((a, b) => b.time.getTime() - a.time.getTime())
    return rows
  }

  /**
   * Map one Loki entry (ns timestamp + parsed JSON line) to an `ApplicationLog` row.
   * The synthetic `id` is the nanosecond timestamp, which doubles as the keyset cursor.
   *
   * @param tsNs - The entry's nanosecond Unix timestamp string.
   * @param line - The parsed JSON log line.
   * @param labels - The Loki stream labels (fallback for `service`).
   * @returns A row shaped like a Postgres `ApplicationLog`.
   */
  private toRow(
    tsNs: string,
    line: Record<string, unknown>,
    labels: Record<string, unknown>,
  ): ApplicationLog {
    const str = (v: unknown): string | null => (typeof v === 'string' ? v : null)
    const num = (v: unknown): number | null => (typeof v === 'number' ? v : null)
    const lineTime = str(line.time)
    const time =
      lineTime !== null && !Number.isNaN(Date.parse(lineTime))
        ? new Date(lineTime)
        : new Date(Number(BigInt(tsNs) / NS_PER_MS))
    return {
      id: tsNs,
      time,
      level: str(line.level) ?? 'info',
      logKey: str(line.logKey) ?? 'UNKNOWN',
      message: str(line.msg) ?? str(line.message) ?? '',
      service: str(line.service) ?? str(labels.service) ?? DEFAULT_SERVICE,
      tenantId: str(line.tenantId),
      requestId: str(line.requestId),
      traceId: str(line.traceId),
      spanId: str(line.spanId),
      status: num(line.status),
      durationMs: num(line.durationMs),
      payload: line as Prisma.JsonValue,
    }
  }
}
