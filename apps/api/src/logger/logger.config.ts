/**
 * Logger module options factory for `apps/api`.
 *
 * Layer: app/logger. Single source of truth for `BymaxLoggerModuleOptions`.
 * `buildLoggerOptions` maps Zod-validated environment variables into the library
 * options consumed by `BymaxLoggerModule.forRootAsync` in `app.module.ts`.
 *
 * Three destinations are registered:
 *   - `LokiDestination`          — batched HTTP push for the `info`+ aggregation tier.
 *   - `PrismaLogDestination`     — durable `warn`+ persistence to Postgres.
 *   - `RollingFileDestination`   — dev-only rolling file (pino-roll); omitted in production.
 *
 * @module
 */
import type { ConfigService } from '@nestjs/config'
import type { BymaxLoggerModuleOptions, LogLevel } from '@bymax-one/nest-logger'

import type { PrismaService } from '../prisma/prisma.service.js'
import { LokiDestination } from '../destinations/loki.destination.js'
import { PrismaLogDestination } from '../destinations/prisma-log.destination.js'
import { RollingFileDestination } from '../destinations/rolling-file.destination.js'

/**
 * Build the `BymaxLoggerModuleOptions` object from validated environment variables.
 *
 * @param config - NestJS config service backed by the Zod-validated env schema.
 * @param prisma - Prisma service instance; reserved for `PrismaLogDestination` when
 *   database log sinks are configured. Unused until destinations are wired.
 * @returns The fully-configured module options object.
 */
export function buildLoggerOptions(
  config: ConfigService,
  prisma: PrismaService,
): BymaxLoggerModuleOptions {
  const isProd = config.get('NODE_ENV') === 'production'
  const extraPaths = (config.get<string>('LOG_EXTRA_REDACT_PATHS') ?? '')
    .split(',')
    .map((p) => p.trim())
    .filter(Boolean)

  return {
    service: {
      name: config.getOrThrow<string>('OTEL_SERVICE_NAME'),
      version: config.get<string>('RELEASE_SHA') ?? 'dev',
    },
    // The Zod schema (env.schema.ts) constrains LOG_LEVEL to the LogLevel union; the cast is safe.
    level: (config.get<string>('LOG_LEVEL') ?? 'info') as LogLevel,
    isGlobal: true,
    isPretty: !isProd,
    redactPaths: extraPaths,
    redactCensor: '[REDACTED]',
    maxEntrySizeBytes: 65_536, // 64 KiB — tune to Loki push-path and Prisma JSONB row limit
    shouldUseAsNestLogger: true,
    serializers: {
      // Serializer params typed `unknown` (lib: Record<string, (input: unknown) => unknown>);
      // narrow inside the body rather than in the parameter signature (strictFunctionTypes).
      upstreamError: (e) => {
        const err = e as { status?: number; code?: string }
        return { status: err.status, code: err.code }
      },
    },
    timestamp: () => `,"time":"${new Date().toISOString()}"`,
    http: {
      isEnabled: true,
      // RegExp[] — anchored, ReDoS-safe (the lib .test()s each pattern per request).
      excludePaths: [/^\/health$/, /^\/metrics$/],
      shouldCaptureExceptions: true,
      // false: RequestIdMiddleware is wired explicitly in app.module.ts configure().
      shouldGenerateRequestId: false,
      tenantIdHeader: 'x-tenant-id',
    },
    otel: {
      // Detect @opentelemetry/api → inject traceId/spanId/traceFlags (default true; explicit here).
      shouldAutoInjectTraceContext: true,
      fieldFormat: config.get('OTEL_FIELD_FORMAT') === 'snake_case' ? 'snake_case' : 'camelCase',
    },
    destinations: [
      new LokiDestination({
        url: config.getOrThrow<string>('LOKI_URL'),
        batchSize: 50,
        flushIntervalMs: 3_000,
      }),
      new PrismaLogDestination(prisma, {
        minLevel: config.get<LogLevel>('LOG_DB_MIN_LEVEL') ?? 'warn',
        batchSize: 50,
        flushIntervalMs: 2_000,
      }),
      // RollingFileDestination is dev-only (pino-roll, async onInit) — omitted in production.
      ...(isProd
        ? []
        : [new RollingFileDestination({ file: 'logs/app.log', frequency: 'daily', size: '50m' })]),
    ],
  }
}
