/**
 * Shared filter DTO for all `logs/` read endpoints.
 *
 * Layer: logs/dto. A single Zod schema (`logQuerySchema`) and its inferred type
 * (`LogQueryDto`) are shared by `/logs`, `/logs/aggregate`, `/logs/export`,
 * `/logs/stream`, and `/logs/loki` so the global source toggle is transparent.
 * `logKey` is validated against `LOG_KEYS_CONVENTION_REGEX` from
 * `@bymax-one/nest-logger/shared`, rejecting typo'd keys at the edge.
 *
 * See `docs/DASHBOARD.md` §12 for the canonical `LogQuery` interface.
 *
 * @module
 */
import { LOG_KEYS_CONVENTION_REGEX, type LogLevel } from '@bymax-one/nest-logger/shared'
import { z } from 'zod'

/**
 * Zod enum matching the library `LogLevel` union.
 *
 * A compile-time parity guard (`_LevelParity`) ensures the two stay in lockstep.
 */
export const logLevelSchema = z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace'])

// Compile-time guard: the Zod enum values MUST equal the library union.
type _LevelParity =
  z.infer<typeof logLevelSchema> extends LogLevel
    ? LogLevel extends z.infer<typeof logLevelSchema>
      ? true
      : never
    : never
const _levelParity: _LevelParity = true
void _levelParity

/** Wildcard prefix pattern: `PREFIX_*` (e.g. `PAYMENT_*`). */
const LOG_KEY_WILDCARD = /^[A-Z][A-Z0-9_]*_\*$/

/**
 * Validates a `logKey` field: either a convention-matching key or a `PREFIX_*` wildcard.
 *
 * @example
 *   logKeySchema.parse('PAYMENT_REFUND_FAILED') // ok
 *   logKeySchema.parse('PAYMENT_*')             // ok (wildcard)
 *   logKeySchema.parse('payment_failed')         // throws
 */
export const logKeySchema = z
  .string()
  .refine((v) => LOG_KEYS_CONVENTION_REGEX.test(v) || LOG_KEY_WILDCARD.test(v), {
    message: 'logKey must match MODULE_ACTION_RESULT convention or a PREFIX_* wildcard',
  })

/**
 * Filter DTO shared by every `logs/` read endpoint.
 *
 * `source` defaults to `'postgres'`; `limit` is coerced and clamped to 1–1000.
 * ISO-8601 `from`/`to` are optional; the service applies `now-1h` / `now` when absent.
 */
export const logQuerySchema = z.object({
  level: z.union([logLevelSchema, z.object({ gte: logLevelSchema })]).optional(),
  logKey: logKeySchema.optional(),
  /** Service name: alphanumeric, hyphens, underscores only — prevents LogQL label injection. */
  service: z
    .string()
    .regex(/^[a-zA-Z0-9_-]{1,64}$/)
    .optional(),
  tenantId: z.string().max(128).optional(),
  traceId: z.string().max(128).optional(),
  requestId: z.string().max(128).optional(),
  /** Free-text message contains (ILIKE in Postgres / `|=` in LogQL); length-capped. */
  q: z.string().max(1024).optional(),
  /** ISO-8601 start time; defaults to now-1h in the service layer. */
  from: z.string().datetime().optional(),
  /** ISO-8601 end time; defaults to now in the service layer. */
  to: z.string().datetime().optional(),
  source: z.enum(['postgres', 'loki']).default('postgres'),
  /** Opaque base64 keyset cursor `(time, id)` from a previous page. */
  cursor: z.string().optional(),
  limit: z.coerce.number().int().min(1).max(1000).default(100),
})

/** Parsed, fully-defaulted log query filter inferred from {@link logQuerySchema}. */
export type LogQueryDto = z.infer<typeof logQuerySchema>
