/**
 * @fileoverview Runtime Zod schemas for the logs read-API + SSE boundaries.
 *
 * The dashboard validates every network/stream payload before trusting it.
 * Schemas are intentionally permissive (`looseObject` keeps unknown keys; the
 * essential fields are type-checked) so a valid response is never rejected,
 * while a garbage payload is caught at the edge instead of crashing a component.
 *
 * @module lib/schemas
 */

import { z } from 'zod'
import type { LogLevel } from '@bymax-one/nest-logger/shared'

/** The six Pino log levels. */
export const logLevelSchema = z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace'])

/**
 * Coerce an arbitrary string to a {@link LogLevel}, falling back to `info`.
 *
 * Used on the SSE boundary where the bus emits a plain string level.
 *
 * @param value - The raw level string.
 * @returns A valid log level (`info` when unrecognized).
 */
export function coerceLevel(value: string): LogLevel {
  return logLevelSchema.catch('info').parse(value)
}

/** A log row as returned by `/logs` / `/logs/context` (essential fields only). */
const logRowSchema = z.looseObject({
  id: z.string(),
  time: z.string(),
  level: z.string(),
  logKey: z.string(),
  message: z.string(),
  service: z.string(),
})

/** `GET /logs` page envelope. */
export const logPageSchema = z.object({
  data: z.array(logRowSchema),
  nextCursor: z.string().nullable(),
  hasMore: z.boolean(),
})

/** `GET /logs/facets` map of field → value counts. */
export const facetsResultSchema = z.record(
  z.string(),
  z.array(z.object({ value: z.string(), count: z.number() })),
)

/** `GET /logs/context` surrounding-lines envelope. */
export const contextResultSchema = z.object({
  before: z.array(logRowSchema),
  match: logRowSchema.nullable(),
  after: z.array(logRowSchema),
})

/** `GET /logs/aggregate` row schema per metric. */
export const aggregateRowSchemas = {
  volume: z.array(z.looseObject({ bucket: z.string(), level: z.string(), n: z.number() })),
  errorRate: z.array(z.looseObject({ bucket: z.string(), errorRate: z.number().nullable() })),
  latency: z.array(
    z.looseObject({
      bucket: z.string(),
      p50: z.number().nullable(),
      p95: z.number().nullable(),
      p99: z.number().nullable(),
    }),
  ),
  statusMix: z.array(
    z.looseObject({
      bucket: z.string(),
      s2xx: z.number(),
      s3xx: z.number(),
      s4xx: z.number(),
      s5xx: z.number(),
    }),
  ),
} as const

/** A single SSE live-tail frame (bus entry). */
export const streamEntrySchema = z.looseObject({
  id: z.string(),
  time: z.union([z.string(), z.number()]),
  level: z.string(),
  logKey: z.string(),
  message: z.string(),
  service: z.string(),
  tenantId: z.string().nullish(),
  requestId: z.string().nullish(),
  traceId: z.string().nullish(),
  spanId: z.string().nullish(),
  cursor: z.string().optional(),
})

/** Inferred shape of a validated SSE frame. */
export type StreamEntry = z.infer<typeof streamEntrySchema>

/**
 * Permissive validation for the SSE proxy's incoming query string. Constrains
 * the enum/numeric params it understands and lets the rest (`from`, `to`,
 * `level[gte]`, `logKey`, …) pass through to the upstream API, which validates
 * them in full. Rejects an obviously-malformed `source` / `role` / `limit`
 * before they are forwarded.
 */
export const streamQuerySchema = z.looseObject({
  source: z.enum(['postgres', 'loki']).optional(),
  role: z.enum(['viewer', 'operator', 'admin']).optional(),
  limit: z.coerce.number().int().min(1).max(1000).optional(),
})
