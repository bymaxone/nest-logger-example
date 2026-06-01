/**
 * Downstream service — cross-service correlation surface with fail-soft worker stub.
 *
 * Demonstrates:
 *   - `@LogContext(name)` as a CLASS decorator that only records a metadata label
 *     (`LOG_CONTEXT_METADATA_KEY`) in `0.1.0`. It does NOT activate the context.
 *   - `setContext()` in the constructor — the call that ACTUALLY applies the context.
 *   - Fail-soft outbound HTTP: connection errors, stalled connections (via AbortSignal),
 *     and non-2xx responses all log `DOWNSTREAM_DISPATCH_DEGRADED` instead of crashing.
 *     The real worker hop with W3C traceparent propagation is wired in a later release.
 *
 * @module
 */
import { Injectable } from '@nestjs/common'
import { InjectLogger, LogContext, PinoLoggerService } from '@bymax-one/nest-logger'

// @LogContext is a CLASS decorator in 0.1.0 — it only records a metadata label.
// It does NOT activate the log context. The activating call is setContext() below.
@LogContext('DownstreamService')
@Injectable()
export class DownstreamService {
  constructor(
    // Host property MUST be named `logger` for @LogPerformance compatibility.
    @InjectLogger('DownstreamService') private readonly logger: PinoLoggerService,
  ) {
    // The class decorator label alone does NOT apply context in 0.1.0.
    // setContext() is the call that activates the label on every log entry.
    this.logger.setContext('DownstreamService')
  }

  /**
   * Dispatch a task to the worker service. Fail-soft: network errors, stalled connections,
   * and non-2xx responses all log `DOWNSTREAM_DISPATCH_DEGRADED` and return `{ ok: false }`.
   *
   * @returns `{ ok: true }` on success, `{ ok: false }` when the worker is unreachable.
   */
  async dispatch(): Promise<{ ok: boolean }> {
    this.logger.info('DOWNSTREAM_DISPATCH_ATTEMPT', 'Dispatching to worker', undefined, {})
    const workerUrl = process.env['WORKER_URL'] ?? 'http://localhost:3002/tasks/dispatch'
    try {
      const res = await fetch(workerUrl, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ kind: 'demo' }),
        // AbortSignal.timeout causes an AbortError after 3 s, caught below like any
        // other network error. Without this, a stalled connection hangs indefinitely.
        signal: AbortSignal.timeout(3_000),
      })
      if (!res.ok) {
        throw new Error(`Worker returned ${res.status}`)
      }
      this.logger.info('DOWNSTREAM_DISPATCH_SUCCESS', 'Worker accepted dispatch', undefined, {})
      return { ok: true }
    } catch (error) {
      // Worker not up (connection refused, timeout, or non-2xx) — degrade gracefully.
      this.logger.warnStructured(
        'DOWNSTREAM_DISPATCH_DEGRADED',
        'Worker unreachable (stub)',
        undefined,
        {
          workerUrl,
          reason: error instanceof Error ? error.message : String(error),
        },
      )
      return { ok: false }
    }
  }
}
