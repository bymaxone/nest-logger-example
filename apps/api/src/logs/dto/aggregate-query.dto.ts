/**
 * Aggregate query DTO — extends `logQuerySchema` with metric, groupBy, and bucket.
 *
 * Layer: logs/dto. Validates the query params for `GET /logs/aggregate`. The
 * bounded-dimension allow-list (`groupBy`) prevents high-cardinality group-by
 * operations on `requestId`/`traceId`/`userId` per `DASHBOARD.md` §11.
 *
 * @module
 */
import { logQuerySchema } from './log-query.dto.js'
import { z } from 'zod'

/** Allowed group-by dimensions — bounded cardinality only (`DASHBOARD.md` §11). */
export const AGGREGATE_GROUP_BY_ALLOW_LIST = [
  'level',
  'status_class',
  'logKey',
  'service',
  'tenantId',
] as const

/** Supported aggregate metrics. */
export const AGGREGATE_METRICS = ['volume', 'errorRate', 'latency', 'statusMix'] as const

/** Time bucket sizes; `auto` resolves based on the query window. */
export const BUCKET_SIZES = ['auto', '1m', '5m', '1h'] as const

/**
 * Resolve an `auto` bucket to a PostgreSQL `date_trunc` unit and `generate_series` interval.
 *
 * `unit` is passed verbatim to `date_trunc(unit, time)` — must be a single-word PostgreSQL
 * time identifier (`minute`, `hour`, etc.). `interval` drives the `generate_series` step.
 * For 5-minute buckets: `unit='minute'` + `interval='5 minutes'` aligns each bucket to a
 * whole minute boundary while stepping by 5 minutes.
 *
 * @param from - Window start ISO string (or `undefined` for now-1h).
 * @param to - Window end ISO string (or `undefined` for now).
 * @returns `{ unit, interval }` for use in aggregate raw SQL.
 */
export function resolveBucket(
  from: string | undefined,
  to: string | undefined,
): { unit: string; interval: string } {
  const end = to ? new Date(to) : new Date()
  const start = from ? new Date(from) : new Date(end.getTime() - 60 * 60 * 1000)
  const windowMs = end.getTime() - start.getTime()
  const hours = windowMs / (1000 * 60 * 60)
  if (hours <= 6) return { unit: 'minute', interval: '1 minute' }
  if (hours <= 24) return { unit: 'minute', interval: '5 minutes' }
  return { unit: 'hour', interval: '1 hour' }
}

/** Validated aggregate query DTO inferred from {@link aggregateQuerySchema}. */
export const aggregateQuerySchema = logQuerySchema.extend({
  metric: z.enum(AGGREGATE_METRICS),
  groupBy: z.enum(AGGREGATE_GROUP_BY_ALLOW_LIST).optional(),
  bucket: z.enum(BUCKET_SIZES).default('auto'),
})

/** Parsed aggregate query DTO. */
export type AggregateQueryDto = z.infer<typeof aggregateQuerySchema>
