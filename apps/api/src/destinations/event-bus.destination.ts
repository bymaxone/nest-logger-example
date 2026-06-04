/**
 * Live-tail fan-out destination — publishes every written entry to the `LogEventBus`.
 *
 * The SSE live-tail endpoint (`GET /logs/stream`) subscribes to the in-process
 * `LogEventBus`; without a producer, a fresh connection (no `Last-Event-ID`, so no
 * keyset replay) would never receive new lines. This destination is that producer: it
 * forwards each already-serialized, already-redacted line to `LogEventBus.publish()`,
 * which parses it and emits it to connected clients.
 *
 * Defaults to `info` so the live tail mirrors the full-fidelity Loki tier (the SSE feed's
 * default source), not just the durable `warn`+ Postgres tier.
 *
 * @module
 */
import type { ILogDestination, LogLevel } from '@bymax-one/nest-logger'

import type { LogEventBus } from '../logs/log-event.bus.js'

/** Options for the live-tail fan-out destination. */
export interface EventBusLogDestinationOptions {
  readonly minLevel?: LogLevel
}

/**
 * Forwards each log line to the SSE live-tail event bus.
 *
 * Purely a side-effect sink — it never persists anything; persistence is handled by
 * the Loki / Prisma / rolling-file destinations.
 *
 * @example
 * ```typescript
 * new EventBusLogDestination(logEventBus, { minLevel: 'info' })
 * ```
 */
export class EventBusLogDestination implements ILogDestination {
  readonly name = 'event-bus'
  readonly minLevel: LogLevel

  constructor(
    private readonly bus: LogEventBus,
    opts: EventBusLogDestinationOptions = {},
  ) {
    this.minLevel = opts.minLevel ?? 'info'
  }

  /**
   * Publish the serialized line to the live-tail bus.
   *
   * @param payload - Serialized JSON log line (already redacted).
   */
  write(payload: string): void {
    this.bus.publish(payload)
  }
}
