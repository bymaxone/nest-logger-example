/**
 * Application entrypoint for `apps/api`.
 *
 * Layer: app/main. Boots NestJS with buffered logs, best-effort bridges the library
 * logger, and installs a single coordinated SIGTERM/SIGINT shutdown that drains the log
 * destinations before flushing the OTel SDK.
 *
 * Constraint: the `./instrumentation.js` side-effect import below MUST remain the first
 * import so the OTel SDK starts before any NestJS/library module loads (a leading comment
 * does not change ES-module evaluation order). See `docs/OVERVIEW.md` §14.
 */
import './instrumentation.js' // MUST be the first import — starts the OTel SDK before NestJS loads
import { PinoLoggerService } from '@bymax-one/nest-logger'
import { ConfigService } from '@nestjs/config'
import { NestFactory } from '@nestjs/core'

import { AppModule } from './app.module.js'
import type { Env } from './config/env.schema.js'
import { otelSdk } from './instrumentation.js'

/**
 * Boot the NestJS application and start listening.
 *
 * The app buffers logs until the library logger is bridged, then installs a SINGLE
 * ordered shutdown owner — `app.close()` (drains the library destinations via
 * `onApplicationShutdown`) → `otelSdk.shutdown()` (flush spans) → `process.exit(0)`.
 *
 * @returns A promise that resolves once the HTTP server is listening.
 */
async function bootstrap(): Promise<void> {
  // `abortOnError: false` so a failed provider lookup re-throws (caught below) instead of
  // calling `process.exit(1)` inside NestJS's ExceptionsZone — needed because the
  // `PinoLoggerService` bridge is best-effort until `BymaxLoggerModule` is wired in Phase 4.
  const app = await NestFactory.create(AppModule, { bufferLogs: true, abortOnError: false })

  // Bridge NestJS's internal logger to the library logger. `PinoLoggerService` is
  // provided by `BymaxLoggerModule`, which is wired in Phase 4 — in this Phase-3
  // skeleton the provider is absent, so guard the lookup and fall back to flushing the
  // buffered logs so the app still boots (`/health`). Once Phase 4 adds the module the
  // lookup succeeds (and the library also self-bridges via `shouldUseAsNestLogger`).
  try {
    app.useLogger(app.get(PinoLoggerService))
  } catch {
    app.flushLogs()
  }

  // SINGLE coordinated shutdown owner for SIGTERM (orchestrator stop) and SIGINT (Ctrl-C):
  // `app.close()` runs the NestJS shutdown lifecycle (`onApplicationShutdown`, where the
  // library drains its destinations) → THEN flush the OTel SDK → THEN exit 0. Ordered, once.
  //
  // We deliberately do NOT call `app.enableShutdownHooks()`: that registers NestJS's own
  // signal listeners which run `app.close()` and then RE-RAISE the signal
  // (`process.kill(pid, signal)`), terminating the process by signal before this handler's
  // `otelSdk.shutdown()` + `process.exit(0)` can run — a race that drops the final span
  // flush. `app.close()` triggers the same lifecycle hooks on its own, so this manual
  // handler is the sole, correct owner (see `docs/OVERVIEW.md` §16).
  let isShuttingDown = false
  const shutdown = (): void => {
    if (isShuttingDown) return // idempotent: if both signals arrive, run the sequence once
    isShuttingDown = true
    void app
      .close()
      .then(() => otelSdk.shutdown())
      .finally(() => process.exit(0))
  }
  process.once('SIGTERM', shutdown)
  process.once('SIGINT', shutdown)

  // Read the validated, coerced PORT from ConfigService (a number) rather than the raw
  // `process.env.PORT` string — the Zod schema is the single source of truth for config.
  const configService = app.get<ConfigService<Env, true>>(ConfigService)
  await app.listen(configService.get('PORT', { infer: true }))
}

void bootstrap()
