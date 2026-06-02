/**
 * Downstream service — cross-service correlation surface with two propagation paths.
 *
 * Demonstrates the Feature Matrix rows 10/12/23 and OVERVIEW.md §14:
 *   - `@LogContext(name)` as a CLASS decorator that records a metadata label.
 *   - `setContext()` in the constructor — the call that activates the context.
 *   - **Auto path**: a plain outbound HTTP call; `@opentelemetry/auto-instrumentations-node`
 *     injects the W3C `traceparent` header automatically (zero manual code).
 *   - **Manual path**: `propagation.inject(context.active(), headers)` from
 *     `@opentelemetry/api`; for custom fetch wrappers and vendor SDKs the
 *     auto-instrumentation does not patch.
 *
 * Fail-soft: all network errors, stalled connections (AbortSignal), and non-2xx
 * responses log `DOWNSTREAM_DISPATCH_DEGRADED` and return `{ ok: false }` rather
 * than crashing the caller.
 *
 * @module
 */
import { Injectable } from '@nestjs/common'
import { InjectLogger, LogContext, PinoLoggerService } from '@bymax-one/nest-logger'
import { context, propagation } from '@opentelemetry/api'

import { resolveWorkerUrl } from '../config/env.defaults.js'

// @LogContext is a CLASS decorator in 0.1.0 — records metadata label only.
// setContext() in the constructor is the call that activates it.
@LogContext('DownstreamService')
@Injectable()
export class DownstreamService {
  // WORKER_URL is validated by the Zod env schema at startup; resolveWorkerUrl() reads
  // process.env without a ConfigService dependency that complicates e2e test modules.
  private readonly workerUrl: string = resolveWorkerUrl()

  constructor(@InjectLogger('DownstreamService') private readonly logger: PinoLoggerService) {
    this.logger.setContext('DownstreamService')
  }

  /**
   * Dispatch a task to the worker via the auto-instrumented HTTP path. The
   * `@opentelemetry/auto-instrumentations-node` patches `fetch` / `http.request`
   * and injects `traceparent` with zero manual code.
   *
   * Fail-soft: returns `{ ok: false }` when the worker is unreachable.
   *
   * @returns `{ ok: true }` on success, `{ ok: false }` on failure.
   */
  async dispatchAuto(): Promise<{ ok: boolean }> {
    this.logger.info('DOWNSTREAM_DISPATCH_START', 'Calling worker (auto-instrumented path)')
    try {
      const res = await fetch(`${this.workerUrl}/tasks/process`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ mode: 'auto' }),
        signal: AbortSignal.timeout(3_000),
      })
      if (!res.ok) {
        throw new Error(`Worker returned ${res.status}`)
      }
      this.logger.info('DOWNSTREAM_DISPATCH_SUCCESS', 'Worker accepted dispatch (auto path)')
      return { ok: true }
    } catch (error) {
      this.logger.warnStructured(
        'DOWNSTREAM_DISPATCH_DEGRADED',
        'Worker unreachable (auto path)',
        undefined,
        {
          workerUrl: this.workerUrl,
          reason: error instanceof Error ? error.message : String(error),
        },
      )
      return { ok: false }
    }
  }

  /**
   * Dispatch a task using the **manual** `propagation.inject` path — for non-instrumented
   * HTTP clients, queue producers, or custom fetch wrappers. Injects `traceparent` (and
   * optional `tracestate`) by calling `propagation.inject(context.active(), headers)`
   * directly (OVERVIEW.md §14 "Cross-service correlation — manual path").
   *
   * Fail-soft: returns `{ ok: false }` when the worker is unreachable.
   *
   * @returns `{ ok: true }` on success, `{ ok: false }` on failure.
   */
  async dispatchManual(): Promise<{ ok: boolean }> {
    // Build headers object and inject the active span context via propagation API.
    const headers: Record<string, string> = { 'content-type': 'application/json' }
    propagation.inject(context.active(), headers) // adds `traceparent` (+ `tracestate`)
    this.logger.info('DOWNSTREAM_DISPATCH_MANUAL', 'Calling worker (manual propagation.inject)')
    try {
      const res = await fetch(`${this.workerUrl}/tasks/process`, {
        method: 'POST',
        headers,
        body: JSON.stringify({ mode: 'manual' }),
        signal: AbortSignal.timeout(3_000),
      })
      if (!res.ok) {
        throw new Error(`Worker returned ${res.status}`)
      }
      this.logger.info('DOWNSTREAM_DISPATCH_SUCCESS', 'Worker accepted dispatch (manual path)')
      return { ok: true }
    } catch (error) {
      this.logger.warnStructured(
        'DOWNSTREAM_DISPATCH_DEGRADED',
        'Worker unreachable (manual path)',
        undefined,
        {
          workerUrl: this.workerUrl,
          reason: error instanceof Error ? error.message : String(error),
        },
      )
      return { ok: false }
    }
  }

  /**
   * Dispatch a task using both paths (auto then manual) — the `POST /downstream/dispatch`
   * default that exercises the full feature matrix. Fail-soft on both.
   *
   * @returns `{ auto: boolean, manual: boolean }` with success flags for each path.
   */
  async dispatch(): Promise<{ auto: boolean; manual: boolean }> {
    const [autoResult, manualResult] = await Promise.all([
      this.dispatchAuto(),
      this.dispatchManual(),
    ])
    return { auto: autoResult.ok, manual: manualResult.ok }
  }
}
