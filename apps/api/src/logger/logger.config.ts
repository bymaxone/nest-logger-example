/**
 * Logger module options factory for `apps/api`.
 *
 * Layer: app/logger. Single source of truth for `BymaxLoggerModuleOptions`.
 * `buildLoggerOptions` maps Zod-validated environment variables into the library
 * options consumed by `BymaxLoggerModule.forRootAsync` in `app.module.ts`.
 *
 * The `prisma` parameter is declared in the factory signature so that the
 * `forRootAsync` inject list stays stable when database destinations are added.
 * `destinations` is an empty array until concrete log sinks (Loki, database,
 * rolling-file) are wired — add them here and pass the required dependencies
 * via the `inject` array in `app.module.ts`.
 *
 * @module
 */
import type { ConfigService } from '@nestjs/config'
import type { BymaxLoggerModuleOptions, LogLevel } from '@bymax-one/nest-logger'

import type { PrismaService } from '../prisma/prisma.service.js'

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
  // Retained for PrismaLogDestination — passed when database destinations are configured.
  void prisma

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
    // Destinations are populated when concrete log sinks (Loki, database, rolling-file)
    // are configured. Add them here and declare their dependencies in the inject array.
    destinations: [],
  }
}
