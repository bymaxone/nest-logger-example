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
 * @module
 */
import { otelSdk } from './instrumentation.js' // MUST be the first import — starts the OTel SDK before NestJS loads
import { PinoLoggerService } from '@bymax-one/nest-logger'
import { NestFactory } from '@nestjs/core'

import { AppModule } from './app.module.js'
import { validateEnv } from './config/env.schema.js'

/**
 * Boot the NestJS worker application and start listening.
 *
 * @returns A promise that resolves once the HTTP server is listening.
 */
async function bootstrap(): Promise<void> {
  // Validate env early so a misconfigured deploy fails at startup, not at first request.
  const workerEnv = validateEnv(process.env)

  const app = await NestFactory.create(AppModule, { bufferLogs: true, abortOnError: false })

  try {
    app.useLogger(app.get(PinoLoggerService))
  } catch (err) {
    // PinoLoggerService not available (e.g. DI misconfiguration) — fall back to buffered logs.
    console.error('PinoLoggerService not available, using default logger', err)
    app.flushLogs()
  }

  app.enableShutdownHooks()

  // Single coordinated shutdown owner for SIGTERM (orchestrator stop) and SIGINT (Ctrl-C):
  // `app.close()` drains log destinations → `otelSdk.shutdown()` flushes spans → `process.exit(0)`.
  let isShuttingDown = false
  const shutdown = (): void => {
    if (isShuttingDown) return
    isShuttingDown = true
    void app
      .close()
      .then(() => otelSdk.shutdown())
      .finally(() => process.exit(0))
  }
  process.once('SIGTERM', shutdown)
  process.once('SIGINT', shutdown)

  await app.listen(workerEnv.PORT)
}

void bootstrap()
