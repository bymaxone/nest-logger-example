/**
 * In-process event bus for the SSE live-tail feed.
 *
 * Layer: logs/sse. Wraps a Node.js `EventEmitter` so log entries emitted by
 * destinations (e.g. `PrismaLogDestination`, `LokiDestination`) are broadcast
 * to all connected SSE clients. The `replaySince` method uses the keyset cursor
 * codec to replay missed rows when a client reconnects with `Last-Event-ID`.
 *
 * This is an in-process singleton — a real deployment would back this with a
 * persistent event bus (Redis Streams, Kafka) for multi-instance support.
 *
 * 🎓 Scoped demo of **real-time log fan-out**. In production use a persistent
 * message queue to fan out across API instances.
 *
 * @module
 */
import { EventEmitter } from 'node:events'
import { Injectable } from '@nestjs/common'
import { EMPTY, Observable, from as from$ } from 'rxjs'

import { PrismaService } from '../prisma/prisma.service.js'
import { LogsService, type QueryRestriction } from './logs.service.js'
import type { LogQueryDto } from './dto/log-query.dto.js'

/** A log entry enriched with its keyset cursor string (the SSE `id`). */
export interface BusLogEntry {
  id: string
  time: Date
  level: string
  logKey: string
  message: string
  service: string
  tenantId?: string | null
  requestId?: string | null
  traceId?: string | null
  cursor: string
  [key: string]: unknown
}

/** The SSE `MessageEvent` shape expected by NestJS `@Sse()`. */
export interface SseMessageEvent {
  data: string
  id?: string
  type?: string
  retry?: number
}

/**
 * Check whether a `BusLogEntry` matches the given `LogQueryDto` filter.
 *
 * @param entry - The log entry to test.
 * @param filter - The filter DTO from the SSE client's query params.
 * @returns `true` when the entry satisfies all specified filter predicates.
 */
export function matches(entry: BusLogEntry, filter: LogQueryDto): boolean {
  if (filter.service !== undefined && entry.service !== filter.service) return false
  if (filter.traceId !== undefined && entry.traceId !== filter.traceId) return false
  if (filter.requestId !== undefined && entry.requestId !== filter.requestId) return false
  if (filter.tenantId !== undefined && entry.tenantId !== filter.tenantId) return false
  if (filter.q !== undefined && !entry.message.toLowerCase().includes(filter.q.toLowerCase())) {
    return false
  }
  if (filter.level !== undefined) {
    const RANK: Record<string, number> = {
      fatal: 60,
      error: 50,
      warn: 40,
      info: 30,
      debug: 20,
      trace: 10,
    }
    if (typeof filter.level === 'string') {
      if (entry.level !== filter.level) return false
    } else {
      const minRank = RANK[filter.level.gte] ?? 0
      if ((RANK[entry.level] ?? 0) < minRank) return false
    }
  }
  if (filter.logKey !== undefined) {
    if (filter.logKey.endsWith('_*')) {
      if (!entry.logKey.startsWith(filter.logKey.slice(0, -1))) return false
    } else {
      if (entry.logKey !== filter.logKey) return false
    }
  }
  return true
}

/**
 * Coerce `message` / `msg` from a parsed log line to a display string.
 *
 * @param parsed - Parsed JSON log record.
 * @returns Message text safe for SSE and `filter.q` matching.
 */
function messageFromParsed(parsed: Record<string, unknown>): string {
  const raw = parsed.message ?? parsed.msg
  if (typeof raw === 'string') return raw
  if (raw == null) return ''
  if (typeof raw === 'number' || typeof raw === 'boolean' || typeof raw === 'bigint') {
    return String(raw)
  }
  try {
    return JSON.stringify(raw)
  } catch {
    return ''
  }
}

/**
 * Injectable event bus that broadcasts log entries to SSE clients.
 *
 * Entries are emitted as `'log'` events on the internal `EventEmitter`.
 * The `replaySince` method fetches rows newer than the last known cursor
 * from Postgres and maps them to `MessageEvent` objects.
 */
@Injectable()
export class LogEventBus {
  /** Node.js EventEmitter — exposed for `fromEvent()` in the SSE controller. */
  readonly emitter = new EventEmitter()

  // Monotonic counter that disambiguates the synthetic cursor of two live entries
  // sharing the same millisecond (live lines have no DB id yet at emit time).
  private seq = 0

  constructor(
    private readonly logs: LogsService,
    private readonly prisma: PrismaService,
  ) {
    this.emitter.setMaxListeners(100)
  }

  /**
   * Emit a new log entry to all connected SSE clients.
   *
   * @param entry - The log entry enriched with its keyset cursor.
   */
  emit(entry: BusLogEntry): void {
    this.emitter.emit('log', entry)
  }

  /**
   * Parse a serialized log line and broadcast it live to connected SSE clients.
   *
   * Called by `EventBusLogDestination` for every entry the logger writes, so a fresh
   * live-tail connection (which has no `Last-Event-ID`, hence no replay) still sees new
   * lines arrive in real time. The line is already redacted by the library pipeline.
   * Malformed lines are ignored — this must never throw back into the logger.
   *
   * The cursor is synthesized from the entry time plus a monotonic sequence (the row has
   * no DB id at emit time); reconnect replay is time-ordered, so this is sufficient for
   * resume without missing newer rows.
   *
   * @param line - Serialized JSON log line (already redacted) from the logger pipeline.
   */
  publish(line: string): void {
    // Bulletproof: this runs inside the logger's write path, so it must NEVER throw.
    // A throw here would make the library emit a LOGGER_DESTINATION_WRITE_FAILED meta-log,
    // which re-enters this destination — an infinite feedback loop.
    try {
      const parsed = JSON.parse(line) as Record<string, unknown>

      // Skip the library's own destination-failure meta-logs — fanning them back through the
      // live tail risks a feedback loop and is noise; they surface in the pipeline-health panel.
      if (typeof parsed.logKey === 'string' && parsed.logKey.startsWith('LOGGER_DESTINATION')) {
        return
      }

      const parsedTime = parsed.time != null ? new Date(parsed.time as string | number) : new Date()
      const time = isNaN(parsedTime.getTime()) ? new Date() : parsedTime

      // The library emits `service` as a { name, version } object; project its name.
      const svc = parsed.service
      const service =
        typeof svc === 'object' && svc !== null
          ? String((svc as { name?: string }).name ?? '')
          : typeof svc === 'string'
            ? svc
            : (process.env.OTEL_SERVICE_NAME ?? 'nest-logger-example-api')

      this.seq = (this.seq + 1) % 1_000_000
      const id = `live-${time.getTime()}-${this.seq}`
      const cursor = this.logs.encodeCursor({ time, id })

      this.emit({
        ...parsed, // keep raw fields (method/url/status/spanId/…) for the detail drawer
        id,
        time,
        level: typeof parsed.level === 'string' ? parsed.level : 'info',
        logKey: typeof parsed.logKey === 'string' ? parsed.logKey : 'UNKNOWN',
        message: messageFromParsed(parsed),
        service,
        tenantId: typeof parsed.tenantId === 'string' ? parsed.tenantId : null,
        requestId: typeof parsed.requestId === 'string' ? parsed.requestId : null,
        traceId: typeof parsed.traceId === 'string' ? parsed.traceId : null,
        cursor,
      })
    } catch {
      // Swallow — never propagate into the logger pipeline.
    }
  }

  /**
   * Replay rows that arrived after the given keyset cursor, matching the filter.
   *
   * Returns `EMPTY` when `lastId` is undefined or malformed — the client
   * receives live entries only, without crashing the stream.
   *
   * @param lastId - The SSE `Last-Event-ID` header value (may be undefined).
   * @param filter - The filter DTO from the SSE client.
   * @returns An `Observable<SseMessageEvent>` of replayed rows.
   */
  replaySince(
    lastId: string | undefined,
    filter: LogQueryDto,
    restriction?: QueryRestriction,
  ): Observable<SseMessageEvent> {
    if (lastId === undefined || lastId === '') return EMPTY

    let from: { time: Date; id: string }
    try {
      from = this.logs.decodeCursor(lastId)
    } catch {
      // Malformed cursor — degrade gracefully to live-only (no 500).
      return EMPTY
    }

    return from$(this.fetchSince(from, filter, restriction))
  }

  /**
   * Fetch rows newer than `from` matching the filter, returning SSE events.
   *
   * @param from - Keyset lower bound (exclusive).
   * @param filter - Filter DTO.
   * @returns Async generator of `SseMessageEvent` objects.
   */
  private async *fetchSince(
    from: { time: Date; id: string },
    filter: LogQueryDto,
    restriction?: QueryRestriction,
  ): AsyncGenerator<SseMessageEvent> {
    const where = this.logs.buildPrismaWhere(filter, restriction)
    // Rows strictly newer than `from` (correct tuple keyset).
    const fromClause = {
      OR: [{ time: { gt: from.time } }, { time: from.time, id: { gt: from.id } }],
    }
    where.AND = [...(Array.isArray(where.AND) ? where.AND : []), fromClause]

    const rows = await this.prisma.applicationLog.findMany({
      where,
      orderBy: [{ time: 'asc' }, { id: 'asc' }],
      take: 500,
    })

    for (const row of rows) {
      const cursor = this.logs.encodeCursor({ time: row.time, id: row.id })
      const entry: BusLogEntry = {
        id: row.id,
        time: row.time,
        level: row.level,
        logKey: row.logKey,
        message: row.message,
        service: row.service,
        tenantId: row.tenantId,
        requestId: row.requestId,
        traceId: row.traceId,
        cursor,
      }
      if (matches(entry, filter)) {
        yield { data: JSON.stringify(entry), id: cursor }
      }
    }
  }

  /**
   * Map a `BusLogEntry` to an `SseMessageEvent`.
   *
   * @param entry - The log entry emitted on the bus.
   * @returns An SSE event with `data` (JSON) and `id` (keyset cursor).
   */
  toEvent(entry: BusLogEntry): SseMessageEvent {
    return { data: JSON.stringify(entry), id: entry.cursor }
  }
}
