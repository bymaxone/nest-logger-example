/**
 * Zod-validated environment schema for `apps/api`.
 *
 * Layer: app/config. `ConfigModule.forRoot({ validate: validateEnv })` calls this at
 * startup so a misconfigured deploy fails fast with a readable, aggregated message.
 * Phase 3 validates only the variables this skeleton reads; later phases extend the
 * schema with their own variables (`LOKI_URL`, `DATABASE_URL`, …).
 */
import { z } from 'zod'

/**
 * Development default for the OTLP trace endpoint. Exported so the production guard in
 * {@link envSchema} can detect "left at the dev default" and reject it on a real deploy.
 */
export const DEV_OTLP_TRACE_ENDPOINT = 'http://localhost:4318/v1/traces'

/** Environment-variable schema covering the Phase-3 API skeleton surface. */
export const envSchema = z
  .object({
    NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
    PORT: z.coerce.number().int().positive().default(3001),
    LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace']).default('info'),
    OTEL_SERVICE_NAME: z.string().min(1).default('nest-logger-example-api'),
    RELEASE_SHA: z.string().min(1).default('dev'),
    OTLP_TRACE_ENDPOINT: z.string().url().default(DEV_OTLP_TRACE_ENDPOINT),
  })
  .superRefine((env, ctx) => {
    // Fail fast in production if the OTLP endpoint was left at the localhost dev default:
    // a real deploy would otherwise silently black-hole every span to a non-existent
    // local collector. Dev/test keep the convenient default.
    if (env.NODE_ENV === 'production' && env.OTLP_TRACE_ENDPOINT === DEV_OTLP_TRACE_ENDPOINT) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['OTLP_TRACE_ENDPOINT'],
        message: 'must be set explicitly in production (not the localhost dev default)',
      })
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
