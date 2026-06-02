/**
 * Application entrypoint for `apps/worker`.
 *
 * Layer: app/main. Boots NestJS with buffered logs, bridges the library logger,
 * and installs ordered SIGTERM + SIGINT handlers that drain destinations before
 * flushing the OTel SDK.
 *
 * Constraint: `./instrumentation.js` MUST remain the first import so the OTel SDK
 * starts before any NestJS/library module loads. See OVERVIEW.md §14.
 *
 * Env validation: `AppModule` calls `validateEnv(process.env)` at module-load time
 * (before `NestFactory.create` executes). `main.ts` reads PORT directly from
 * `process.env` using the schema's default so no second validation pass is needed.
 *
 * @module
 */
import { otelSdk } from './instrumentation.js' // MUST be the first import — starts the OTel SDK before NestJS loads
import { PinoLoggerService } from '@bymax-one/nest-logger'
import { NestFactory } from '@nestjs/core'

import { AppModule } from './app.module.js'

/**
 * Boot the NestJS worker application and start listening.
 *
 * @returns A promise that resolves once the HTTP server is listening.
 */
async function bootstrap(): Promise<void> {
  // Env already validated at module-load time in app.module.ts; no second pass here.
  const app = await NestFactory.create(AppModule, { bufferLogs: true, abortOnError: false })

  try {
    app.useLogger(app.get(PinoLoggerService))
  } catch (err) {
    // PinoLoggerService not available (e.g. DI misconfiguration) — fall back to buffered logs.
    console.error('PinoLoggerService not available, using default logger', err)
    app.flushLogs()
  }

  // `enableShutdownHooks()` is deliberately NOT called here. NestJS 11 re-raises the
  // signal after `callShutdownHook()`, which races with `otelSdk.shutdown()` and can
  // drop the final span flush. The manual handlers below are the sole shutdown owners.
  // (Same reasoning as apps/api/src/main.ts — see OVERVIEW.md §16.)

  // Single coordinated shutdown owner for SIGTERM (orchestrator stop) and SIGINT (Ctrl-C).
  // `.catch()` ensures otelSdk.shutdown() always runs even when app.close() rejects.
  let isShuttingDown = false
  const shutdown = (): void => {
    if (isShuttingDown) return
    isShuttingDown = true
    void app
      .close()
      .catch((err: unknown) => {
        console.error('app.close() failed during shutdown', err)
      })
      .then(() => otelSdk.shutdown())
      .finally(() => process.exit(0))
  }
  process.once('SIGTERM', shutdown)
  process.once('SIGINT', shutdown)

  // PORT is validated by the Zod schema in app.module.ts; use the same raw default here.
  await app.listen(process.env['PORT'] ?? 3002)
}

void bootstrap()
