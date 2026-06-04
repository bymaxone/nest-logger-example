/**
 * Time-bucketed aggregation service for chart panels.
 *
 * Layer: logs/aggregate. Runs four `$queryRaw` builders against the `application_logs`
 * table, always zero-filled via `generate_series` so charts have no gaps. Group-by is
 * restricted to bounded dimensions only — never `requestId`/`traceId`/`userId`
 * (high-cardinality fields that belong in search, not aggregation).
 *
 * SQL is fully parameterized via `Prisma.sql` tagged templates — user input is never
 * string-interpolated directly.
 *
 * See `docs/DASHBOARD.md` §11 and §13 for the canonical SQL shapes.
 *
 * @module
 */
import { Injectable } from '@nestjs/common'
import { Prisma } from '@prisma/client'

import { PrismaService } from '../prisma/prisma.service.js'
import { LogsService } from './logs.service.js'
import { resolveBucket, type AggregateQueryDto } from './dto/aggregate-query.dto.js'

/** One zero-filled volume row: bucket timestamp, level, and count. */
export interface VolumeRow {
  bucket: Date
  level: string
  n: number
}

/** One error-rate row: bucket timestamp and ratio of 4xx+5xx to total. */
export interface ErrorRateRow {
  bucket: Date
  errorRate: number | null
}

/** One latency row: bucket and p50/p95/p99 percentiles over `durationMs`. */
export interface LatencyRow {
  bucket: Date
  p50: number | null
  p95: number | null
  p99: number | null
}

/** One status-mix row: bucket and counts per status class. */
export interface StatusMixRow {
  bucket: Date
  s2xx: number
  s3xx: number
  s4xx: number
  s5xx: number
}

/**
 * Server-side aggregation for all chart panels.
 *
 * All SQL runs through Prisma `$queryRaw` with tagged-template parameterization;
 * no user values are string-interpolated. Zero-fill is guaranteed by
 * `generate_series` × `unnest(levels)` for volume, and by the time-bucket series
 * for the other metrics.
 */
@Injectable()
export class LogsAggregateService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly logs: LogsService,
  ) {}

  /**
   * Extract the time window boundaries and tenantId from a compiled Prisma `where` clause.
   *
   * All four metric builders share this pattern — centralising it avoids 4× duplicated
   * type-narrowing logic and ensures every metric uses the same fallback window.
   *
   * @param where - Prisma where clause produced by `LogsService.buildPrismaWhere`.
   * @param q - Original aggregate query (used for the `resolveBucket` fallback window).
   * @returns `{ from, to, tenantId, unit, interval }` for use in raw SQL.
   */
  private extractQueryContext(
    where: import('@prisma/client').Prisma.ApplicationLogWhereInput,
    q: AggregateQueryDto,
  ): { from: Date; to: Date; tenantId: string | null; unit: string; interval: string } {
    const from =
      where.time && typeof where.time === 'object' && 'gte' in where.time
        ? (where.time.gte as Date)
        : new Date(Date.now() - 60 * 60 * 1000)
    const to =
      where.time && typeof where.time === 'object' && 'lte' in where.time
        ? (where.time.lte as Date)
        : new Date()
    const tenantId = typeof where.tenantId === 'string' ? where.tenantId : null
    const { unit, interval } = resolveBucket(q.from, q.to)
    return { from, to, tenantId, unit, interval }
  }

  /**
   * Route the aggregate query to the correct metric builder.
   *
   * @param q - Validated aggregate query DTO.
   * @returns Metric-specific array of time-series rows.
   */
  async query(
    q: AggregateQueryDto,
  ): Promise<VolumeRow[] | ErrorRateRow[] | LatencyRow[] | StatusMixRow[]> {
    switch (q.metric) {
      case 'volume':
        return this.volume(q)
      case 'errorRate':
        return this.errorRate(q)
      case 'latency':
        return this.latency(q)
      case 'statusMix':
        return this.statusMix(q)
    }
  }

  /**
   * Zero-filled log volume stacked by level.
   *
   * Uses `generate_series` × `unnest(levels)` so every level has a row for
   * every bucket, even when no logs were emitted.
   *
   * @param q - Validated aggregate query.
   * @returns Zero-filled `{ bucket, level, n }[]`.
   */
  private async volume(q: AggregateQueryDto): Promise<VolumeRow[]> {
    const where = this.logs.buildPrismaWhere(q)
    const { from, to, tenantId, unit, interval } = this.extractQueryContext(where, q)

    const rows = await this.prisma.$queryRaw<VolumeRow[]>(Prisma.sql`
      SELECT b.bucket, l.level, COALESCE(c.n, 0)::int AS n
      FROM generate_series(${from}::timestamptz, ${to}::timestamptz, ${interval}::interval) AS b(bucket)
      CROSS JOIN unnest(ARRAY['fatal','error','warn','info','debug','trace']::text[]) AS l(level)
      LEFT JOIN (
        SELECT date_trunc(${unit}, time) AS bucket, level, count(*)::int AS n
        FROM "ApplicationLog"
        WHERE time BETWEEN ${from} AND ${to}
          AND (${tenantId}::text IS NULL OR "tenantId" = ${tenantId})
        GROUP BY 1, 2
      ) c ON c.bucket = b.bucket AND c.level = l.level
      ORDER BY b.bucket
    `)
    return rows
  }

  /**
   * Error rate per time bucket.
   *
   * Scoped to `HTTP_REQUEST_*` log keys. Returns `null` for empty buckets
   * (NULLIF protects against division by zero).
   *
   * @param q - Validated aggregate query.
   * @returns `{ bucket, errorRate }[]`.
   */
  private async errorRate(q: AggregateQueryDto): Promise<ErrorRateRow[]> {
    const where = this.logs.buildPrismaWhere(q)
    const { from, to, tenantId, unit } = this.extractQueryContext(where, q)
    const rows = await this.prisma.$queryRaw<ErrorRateRow[]>(Prisma.sql`
      SELECT
        date_trunc(${unit}, time) AS bucket,
        count(*) FILTER (WHERE status >= 400)::float / NULLIF(count(*), 0) AS "errorRate"
      FROM "ApplicationLog"
      WHERE "logKey" LIKE 'HTTP_REQUEST_%'
        AND time BETWEEN ${from} AND ${to}
        AND (${tenantId}::text IS NULL OR "tenantId" = ${tenantId})
      GROUP BY 1
      ORDER BY 1
    `)
    return rows
  }

  /**
   * Latency percentiles per time bucket via `percentile_cont`.
   *
   * Scoped to rows with a non-null `durationMs`. Uses `percentile_cont` — not
   * average — per `DASHBOARD.md` §2 principle 4.
   *
   * @param q - Validated aggregate query.
   * @returns `{ bucket, p50, p95, p99 }[]`.
   */
  private async latency(q: AggregateQueryDto): Promise<LatencyRow[]> {
    const where = this.logs.buildPrismaWhere(q)
    const { from, to, tenantId, unit } = this.extractQueryContext(where, q)

    const rows = await this.prisma.$queryRaw<LatencyRow[]>(Prisma.sql`
      SELECT
        date_trunc(${unit}, time) AS bucket,
        percentile_cont(0.50) WITHIN GROUP (ORDER BY "durationMs") AS p50,
        percentile_cont(0.95) WITHIN GROUP (ORDER BY "durationMs") AS p95,
        percentile_cont(0.99) WITHIN GROUP (ORDER BY "durationMs") AS p99
      FROM "ApplicationLog"
      WHERE "durationMs" IS NOT NULL
        AND time BETWEEN ${from} AND ${to}
        AND (${tenantId}::text IS NULL OR "tenantId" = ${tenantId})
      GROUP BY 1
      ORDER BY 1
    `)
    return rows
  }

  /**
   * Status-class counts per time bucket.
   *
   * Groups HTTP status codes into 2xx / 3xx / 4xx / 5xx per bucket.
   *
   * @param q - Validated aggregate query.
   * @returns `{ bucket, s2xx, s3xx, s4xx, s5xx }[]`.
   */
  private async statusMix(q: AggregateQueryDto): Promise<StatusMixRow[]> {
    const where = this.logs.buildPrismaWhere(q)
    const { from, to, tenantId, unit } = this.extractQueryContext(where, q)

    const rows = await this.prisma.$queryRaw<StatusMixRow[]>(Prisma.sql`
      SELECT
        date_trunc(${unit}, time) AS bucket,
        count(*) FILTER (WHERE status BETWEEN 200 AND 299)::int AS s2xx,
        count(*) FILTER (WHERE status BETWEEN 300 AND 399)::int AS s3xx,
        count(*) FILTER (WHERE status BETWEEN 400 AND 499)::int AS s4xx,
        count(*) FILTER (WHERE status >= 500)::int AS s5xx
      FROM "ApplicationLog"
      WHERE time BETWEEN ${from} AND ${to}
        AND (${tenantId}::text IS NULL OR "tenantId" = ${tenantId})
      GROUP BY 1
      ORDER BY 1
    `)
    return rows
  }
}
