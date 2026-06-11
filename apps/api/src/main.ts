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
import type { NestExpressApplication } from '@nestjs/platform-express'
import helmet from 'helmet'

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
  // `PinoLoggerService` bridge is best-effort: if `BymaxLoggerModule` is absent (e.g. a
  // minimal harness without the module), the guard falls back to flushing buffered logs.
  const app = await NestFactory.create<NestExpressApplication>(AppModule, {
    bufferLogs: true,
    abortOnError: false,
  })

  // Bridge NestJS's internal logger to the library logger. Guard the lookup: if
  // `BymaxLoggerModule` is not in scope the provider is absent and the catch falls back
  // to flushing buffered logs so the process still boots. The library also self-bridges
  // via `shouldUseAsNestLogger: true`, making this line belt-and-suspenders.
  try {
    app.useLogger(app.get(PinoLoggerService))
  } catch {
    app.flushLogs()
  }

  // SINGLE coordinated shutdown owner for SIGTERM (orchestrator stop) and SIGINT (Ctrl-C):
  // `app.close()` runs the NestJS shutdown lifecycle (`onApplicationShutdown`, where the
  // library drains its destinations) → THEN flush the OTel SDK → THEN exit 0. Ordered, once.
  //
  // `app.enableShutdownHooks()` is deliberately NOT called here. NestJS 11's implementation
  // calls `process.kill(process.pid, signal)` after `callShutdownHook()` completes
  // (nest-application-context.js:220). That re-raised signal terminates the process via the
  // default handler BEFORE `otelSdk.shutdown()` + `process.exit(0)` can run — a race that
  // drops the final span flush. `app.close()` fires `onApplicationShutdown` hooks on its own,
  // so this manual handler is the sole, correct owner. (OVERVIEW.md §16)
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

  // Secure default response headers (nosniff, frameguard, referrer-policy no-referrer etc.).
  // Registered before CORS so every response — including the JSON read-API — carries
  // the baseline headers. CSP defaults are kept: the API serves JSON only (no HTML),
  // and the dashboard reaches it via CORS fetch, which CSP/CORP do not gate.
  app.use(helmet())

  // Use the qs "extended" query parser so nested params like `level[gte]=warn`
  // deserialize to `{ level: { gte: 'warn' } }` — the dashboard's level>= filter
  // relies on this. Express 5 defaults to the "simple" parser, which would not.
  app.set('query parser', 'extended')

  // Allow the apps/web dashboard (a separate origin in dev) to call the read-API
  // with its RBAC headers. The browser cannot attach custom headers to an
  // EventSource, so the live tail is proxied same-origin through apps/web; these
  // headers cover the plain fetch endpoints (logs/aggregate/facets/context/export).
  // The x-role / x-tenant-id / x-actor headers below drive the demo's header-based
  // RBAC. They are trusted verbatim only because `buildRbacContext` (governance/
  // rbac.context.ts) hard-fails in production — a real deployment must wire
  // `@bymax-one/nest-auth` before relying on these.
  app.enableCors({
    origin: configService.get('WEB_ORIGIN', { infer: true }),
    allowedHeaders: ['Content-Type', 'Accept', 'x-role', 'x-tenant-id', 'x-actor', 'last-event-id'],
    exposedHeaders: ['X-Export-Truncated', 'Content-Disposition', 'X-Request-Id', 'X-Trace-Id'],
  })

  await app.listen(configService.get('PORT', { infer: true }))
}

void bootstrap()
