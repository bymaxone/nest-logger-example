/**
 * Zod-validated environment schema for `apps/api`.
 *
 * Layer: app/config. `ConfigModule.forRoot({ validate: validateEnv })` calls this at
 * startup so a misconfigured deploy fails fast with a readable, aggregated message.
 * Add new validated variables here as features are introduced (`LOKI_URL`, etc.).
 */
import { z } from 'zod'

import { DEV_WORKER_URL } from './env.defaults.js'

/**
 * Development default for the OTLP trace endpoint. Exported so the production guard in
 * {@link envSchema} can detect "left at the dev default" and reject it on a real deploy.
 */
export const DEV_OTLP_TRACE_ENDPOINT = 'http://localhost:4318/v1/traces'

/** Loopback hostnames rejected for outbound URLs in production. */
const LOOPBACK_HOSTS = new Set(['localhost', '127.0.0.1', '::1'])

/**
 * Whether a URL string resolves to a loopback host. A parse failure returns
 * `false` because `z.url()` already reports a malformed URL.
 *
 * @param value - The URL string to inspect.
 * @returns `true` when the hostname is a loopback address.
 */
function isLoopbackUrl(value: string): boolean {
  try {
    return LOOPBACK_HOSTS.has(new URL(value).hostname)
  } catch {
    return false
  }
}

/** URL env vars that must point at a real (non-loopback) host in production. */
const PRODUCTION_NON_LOOPBACK_URLS = ['LOKI_URL', 'WORKER_URL', 'DATABASE_URL'] as const

/** Environment-variable schema for `apps/api`. */
export const envSchema = z
  .object({
    NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
    PORT: z.coerce.number().int().positive().default(3001),
    LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace']).default('info'),
    OTEL_SERVICE_NAME: z.string().min(1).default('nest-logger-example-api'),
    RELEASE_SHA: z.string().min(1).default('dev'),
    OTLP_TRACE_ENDPOINT: z.url().default(DEV_OTLP_TRACE_ENDPOINT),
    DATABASE_URL: z.url(),
    LOG_EXTRA_REDACT_PATHS: z.string().default(''),
    OTEL_FIELD_FORMAT: z.enum(['camelCase', 'snake_case']).default('camelCase'),
    LOKI_URL: z.url().default('http://localhost:3100/loki/api/v1/push'),
    LOKI_QUERY_URL: z.url().default('http://localhost:3100'),
    LOG_DB_MIN_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace']).default('warn'),
    WORKER_URL: z.url().default(DEV_WORKER_URL), // apps/api → apps/worker hop
    WEB_ORIGIN: z.url().default('http://localhost:3003'), // apps/web dashboard origin (CORS allow-list)
  })
  .superRefine((env, ctx) => {
    // All cross-host guards apply to production only; dev/test keep the convenient
    // localhost defaults. Each guard fails fast so a misconfigured deploy cannot
    // silently black-hole telemetry or connect to an unintended local service.
    if (env.NODE_ENV !== 'production') return

    // OTLP left at the localhost dev default would send every span to a non-existent collector.
    if (env.OTLP_TRACE_ENDPOINT === DEV_OTLP_TRACE_ENDPOINT) {
      ctx.addIssue({
        code: 'custom',
        path: ['OTLP_TRACE_ENDPOINT'],
        message: 'must be set explicitly in production (not the localhost dev default)',
      })
    }

    // Outbound URLs (Loki push, worker hop, database) must point at a real peer, not loopback.
    for (const key of PRODUCTION_NON_LOOPBACK_URLS) {
      if (isLoopbackUrl(env[key])) {
        ctx.addIssue({
          code: 'custom',
          path: [key],
          message: 'must not point to localhost in production',
        })
      }
    }

    // The CORS allow-list must use HTTPS so dashboard↔API requests are not served insecurely.
    try {
      if (new URL(env.WEB_ORIGIN).protocol !== 'https:') {
        ctx.addIssue({
          code: 'custom',
          path: ['WEB_ORIGIN'],
          message: 'must use https:// in production',
        })
      }
    } catch {
      // URL parse failed — already reported by z.url().
    }
  })

/** Parsed, fully-defaulted environment shape inferred from {@link envSchema}. */
export type Env = z.infer<typeof envSchema>

/**
 * Validate raw environment variables, applying defaults.
 *
 * Used as the `ConfigModule.forRoot({ validate })` entrypoint so the process exits
 * non-zero at boot on an invalid value instead of failing later at runtime.
 *
 * @param config - Raw environment record (typically `process.env`).
 * @returns The parsed, fully-defaulted {@link Env}.
 * @throws {Error} When any variable fails validation; the message aggregates every
 *   offending key and its reason.
 */
export function validateEnv(config: Record<string, unknown>): Env {
  const parsed = envSchema.safeParse(config)
  if (!parsed.success) {
    const issues = parsed.error.issues
      .map((issue) => `  - ${issue.path.join('.') || '(root)'}: ${issue.message}`)
      .join('\n')
    throw new Error(`Invalid environment variables:\n${issues}`)
  }
  return parsed.data
}
