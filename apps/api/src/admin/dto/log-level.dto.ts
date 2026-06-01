/**
 * Request body schema for `PATCH /admin/log-level`.
 *
 * @module
 */
import { z } from 'zod'

/** Zod schema validating the requested Pino log level. */
export const logLevelSchema = z.object({
  level: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace']),
})

/** Type inferred from {@link logLevelSchema}. */
export type LogLevelDto = z.infer<typeof logLevelSchema>
