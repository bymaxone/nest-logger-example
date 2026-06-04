/**
 * `GET /logs/stream` — SSE live-tail endpoint.
 *
 * Layer: logs/sse. Uses NestJS `@Sse()` returning an `Observable<MessageEvent>`.
 * Merges three sources: a keyset replay of missed rows since `Last-Event-ID`, a
 * live feed from the `LogEventBus`, and a 15-second keep-alive ping.
 *
 * Anti-buffering headers (`X-Accel-Buffering: no`, `Cache-Control: no-cache`) are
 * set so Nginx and CDN proxies do not buffer the event stream.
 *
 * A malformed `Last-Event-ID` degrades gracefully (replay skipped, live continues)
 * rather than returning HTTP 500.
 *
 * 🎓 Scoped demo of **SSE live tail**. In production, back `LogEventBus` with a
 * persistent event bus (Redis Streams, Kafka) for multi-instance fan-out.
 *
 * See `docs/DASHBOARD.md` §7 and §14 for the real-time architecture.
 *
 * @module
 */
import { Controller, Header, Headers, Query, Sse } from '@nestjs/common'
import { fromEvent, interval, merge, Observable } from 'rxjs'
import { filter, map } from 'rxjs/operators'

import { ZodValidationPipe } from '../common/zod-validation.pipe.js'
import { buildRbacContext, toRestriction } from '../governance/rbac.context.js'
import { logQuerySchema, type LogQueryDto } from './dto/log-query.dto.js'
import { LogEventBus, matches, type BusLogEntry, type SseMessageEvent } from './log-event.bus.js'

/** Keep-alive interval in milliseconds — defeats idle-timeout proxies. */
const KEEP_ALIVE_MS = 15_000

/**
 * SSE live-tail controller.
 *
 * A single `@Sse('stream')` handler merges replay + live + keep-alive streams.
 * The `Last-Event-ID` header drives cursor-based replay so no lines are missed
 * on reconnect without per-client server bookkeeping.
 */
@Controller('logs')
export class LogsSseController {
  constructor(private readonly bus: LogEventBus) {}

  /**
   * Server-Sent Events live-tail feed.
   *
   * @param filter - Validated filter DTO (same params as `GET /logs`).
   * @param lastId - `Last-Event-ID` header from the browser on reconnect.
   * @returns Merged observable of replay, live log, and keep-alive events.
   */
  @Sse('stream')
  @Header('X-Accel-Buffering', 'no')
  @Header('Cache-Control', 'no-cache')
  stream(
    @Headers() headers: Record<string, string>,
    @Query(new ZodValidationPipe(logQuerySchema)) logFilter: LogQueryDto,
  ): Observable<SseMessageEvent> {
    const restriction = toRestriction(buildRbacContext(headers))
    const lastId = headers['last-event-id']
    const replay$ = this.bus.replaySince(lastId, logFilter, restriction)

    const live$ = fromEvent(this.bus.emitter, 'log').pipe(
      filter((e): e is BusLogEntry => {
        const entry = e as BusLogEntry
        // Enforce server-side tenant restriction before client filter.
        if (restriction.tenantId !== undefined && entry.tenantId !== restriction.tenantId) {
          return false
        }
        return matches(entry, logFilter)
      }),
      map((e) => this.bus.toEvent(e)),
    )

    const keepAlive$ = interval(KEEP_ALIVE_MS).pipe(
      map((): SseMessageEvent => ({ data: '', type: 'ping' })),
    )

    return merge(replay$, live$, keepAlive$)
  }
}
