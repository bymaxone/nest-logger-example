/**
 * Zod-validated environment schema for `apps/worker`.
 *
 * Layer: app/config. `validateEnv` is called exactly once, at module-load time
 * in `app.module.ts` (before `NestFactory.create` executes), so a misconfigured
 * deploy fails fast at startup. Do NOT call it again in `main.ts` — that creates
 * a second validation pass and makes it unclear which call is authoritative.
 *
 * @module
 */
import { z } from 'zod'

/** Development default for the OTLP trace endpoint. */
export const DEV_OTLP_TRACE_ENDPOINT = 'http://localhost:4318/v1/traces'

/** Environment-variable schema for `apps/worker`. */
export const envSchema = z
  .object({
    NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
    PORT: z.coerce.number().int().positive().default(3002),
    LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace']).default('info'),
    OTEL_SERVICE_NAME: z.string().min(1).default('nest-logger-example-worker'),
    RELEASE_SHA: z.string().min(1).default('dev'),
    OTLP_TRACE_ENDPOINT: z.url().default(DEV_OTLP_TRACE_ENDPOINT),
  })
  .superRefine((env, ctx) => {
    if (env.NODE_ENV === 'production' && env.OTLP_TRACE_ENDPOINT === DEV_OTLP_TRACE_ENDPOINT) {
      ctx.addIssue({
        code: 'custom',
        path: ['OTLP_TRACE_ENDPOINT'],
        message: 'must be set explicitly in production (not the localhost dev default)',
      })
    }
  })

/** Parsed, fully-defaulted environment shape inferred from {@link envSchema}. */
export type WorkerEnv = z.infer<typeof envSchema>

/**
 * Validate raw environment variables, applying defaults.
 *
 * @param config - Raw environment record (typically `process.env`).
 * @returns The parsed, fully-defaulted {@link WorkerEnv}.
 * @throws {Error} When any variable fails validation.
 */
export function validateEnv(config: Record<string, unknown>): WorkerEnv {
  const parsed = envSchema.safeParse(config)
  if (!parsed.success) {
    const issues = parsed.error.issues
      .map((issue) => `  - ${issue.path.join('.') || '(root)'}: ${issue.message}`)
      .join('\n')
    throw new Error(`Invalid environment variables:\n${issues}`)
  }
  return parsed.data
}
