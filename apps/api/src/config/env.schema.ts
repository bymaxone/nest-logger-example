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
    LOG_DB_MIN_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace']).default('warn'),
    WORKER_URL: z.url().default(DEV_WORKER_URL), // apps/api → apps/worker hop
  })
  .superRefine((env, ctx) => {
    // Fail fast in production if the OTLP endpoint was left at the localhost dev default:
    // a real deploy would otherwise silently black-hole every span to a non-existent
    // local collector. Dev/test keep the convenient default.
    if (env.NODE_ENV === 'production' && env.OTLP_TRACE_ENDPOINT === DEV_OTLP_TRACE_ENDPOINT) {
      ctx.addIssue({
        code: 'custom',
        path: ['OTLP_TRACE_ENDPOINT'],
        message: 'must be set explicitly in production (not the localhost dev default)',
      })
    }
    // Reject a loopback LOKI_URL in production — log data pushed over plaintext HTTP to
    // localhost would be silently black-holed (or sent to an unintended local service).
    if (env.NODE_ENV === 'production') {
      try {
        const lokiHostname = new URL(env.LOKI_URL).hostname
        const isLokiLoopback =
          lokiHostname === 'localhost' || lokiHostname === '127.0.0.1' || lokiHostname === '::1'
        if (isLokiLoopback) {
          ctx.addIssue({
            code: 'custom',
            path: ['LOKI_URL'],
            message: 'must not point to localhost in production',
          })
        }
      } catch {
        // URL parse failed — already caught by z.url() above.
      }
    }
    // Reject a loopback WORKER_URL in production — the cross-service hop must point at
    // a real peer service address, not localhost (which would fail silently in a container).
    if (env.NODE_ENV === 'production') {
      try {
        const workerHostname = new URL(env.WORKER_URL).hostname
        const isWorkerLoopback =
          workerHostname === 'localhost' ||
          workerHostname === '127.0.0.1' ||
          workerHostname === '::1'
        if (isWorkerLoopback) {
          ctx.addIssue({
            code: 'custom',
            path: ['WORKER_URL'],
            message: 'must not point to localhost in production',
          })
        }
      } catch {
        // URL parse failed — already caught by z.url() above.
      }
    }
    // Reject a loopback DATABASE_URL in production — the dev default credential would
    // silently connect to nothing (or worse, a local DB on the prod host). Parse the URL
    // and inspect only the hostname so credentials or query-params containing "localhost"
    // do not produce false positives.
    if (env.NODE_ENV === 'production') {
      try {
        const { hostname } = new URL(env.DATABASE_URL)
        const isLoopback =
          hostname === 'localhost' || hostname === '127.0.0.1' || hostname === '::1'
        if (isLoopback) {
          ctx.addIssue({
            code: 'custom',
            path: ['DATABASE_URL'],
            message: 'must not point to localhost in production',
          })
        }
      } catch {
        // URL parse failed — already caught by z.url() above, so this branch
        // is unreachable in practice; swallowing here avoids a duplicate error message.
      }
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
