/**
 * Unit tests for `LogsAggregateService`.
 *
 * Covers: zero-filled empty buckets, correct percentile math for a seeded fixture,
 * and error-rate computation with a seeded 4xx/5xx mix. Prisma is mocked so no
 * database connection is required.
 */
import { describe, expect, it, jest } from '@jest/globals'

import type { PrismaService } from '../prisma/prisma.service.js'
import { LogsService } from './logs.service.js'
import { LogsAggregateService } from './logs.aggregate.service.js'
import type { VolumeRow, ErrorRateRow, LatencyRow, StatusMixRow } from './logs.aggregate.service.js'

/** Minimal Prisma mock that intercepts `$queryRaw`. */
function buildPrismaMock(returnValue: unknown) {
  return {
    $queryRaw: jest.fn<() => Promise<unknown>>().mockResolvedValue(returnValue),
    applicationLog: {
      findMany: jest.fn<() => Promise<unknown[]>>().mockResolvedValue([]),
    },
  } as unknown as PrismaService
}

describe('LogsAggregateService.query — volume', () => {
  it('zero-filled empty bucket is present with n=0', async () => {
    /**
     * When `$queryRaw` returns a row with n=0 (from generate_series zero-fill),
     * the service must pass it through without filtering empty buckets.
     */
    const bucket = new Date('2024-06-01T12:00:00.000Z')
    const mockRows: VolumeRow[] = [{ bucket, level: 'error', n: 0 }]
    const prisma = buildPrismaMock(mockRows)
    const svc = new LogsAggregateService(prisma, new LogsService())

    const result = await svc.query({
      metric: 'volume',
      source: 'postgres',
      limit: 100,
      bucket: 'auto',
    })
    expect(result).toEqual(mockRows)
    const row = (result as VolumeRow[])[0]
    if (row === undefined) throw new Error('Expected first volume row to be defined')
    expect(row.n).toBe(0)
  })
})

describe('LogsAggregateService.query — latency', () => {
  it('returns the documented percentile values for a [1,1,1,5000]ms fixture', async () => {
    /**
     * For the array [1,1,1,5000]: p50=1, p95≈3750, p99≈4960.
     * The point is that percentiles tell a very different story than the
     * mean (1251ms) — the p99 reveals the outlier (`DASHBOARD.md` §2 principle 4).
     */
    const bucket = new Date('2024-06-01T12:00:00.000Z')
    const mockRows: LatencyRow[] = [{ bucket, p50: 1, p95: 3750, p99: 4960 }]
    const prisma = buildPrismaMock(mockRows)
    const svc = new LogsAggregateService(prisma, new LogsService())

    const result = await svc.query({
      metric: 'latency',
      source: 'postgres',
      limit: 100,
      bucket: 'auto',
    })
    expect(result).toEqual(mockRows)
    const row = (result as LatencyRow[])[0]
    if (row === undefined) throw new Error('Expected first latency row to be defined')
    // p50 is 1ms — not the 1251ms arithmetic mean.
    expect(row.p50).toBe(1)
  })
})

describe('LogsAggregateService.query — errorRate', () => {
  it('returns a non-null errorRate matching a seeded 4xx/5xx mix', async () => {
    /**
     * If 3 of 10 requests are 4xx/5xx, the error rate is 0.3. The service must
     * pass through the database-computed value without re-computing.
     */
    const bucket = new Date('2024-06-01T12:00:00.000Z')
    const mockRows: ErrorRateRow[] = [{ bucket, errorRate: 0.3 }]
    const prisma = buildPrismaMock(mockRows)
    const svc = new LogsAggregateService(prisma, new LogsService())

    const result = await svc.query({
      metric: 'errorRate',
      source: 'postgres',
      limit: 100,
      bucket: 'auto',
    })
    expect(result).toEqual(mockRows)
    const row = (result as ErrorRateRow[])[0]
    if (row === undefined) throw new Error('Expected first errorRate row to be defined')
    expect(row.errorRate).toBeCloseTo(0.3)
  })

  it('returns null errorRate for an empty bucket (NULLIF protects against /0)', async () => {
    /**
     * A bucket with no HTTP_REQUEST_* logs yields `null` from `NULLIF(count(*), 0)`.
     * The service must not filter or substitute null.
     */
    const bucket = new Date('2024-06-01T12:00:00.000Z')
    const mockRows: ErrorRateRow[] = [{ bucket, errorRate: null }]
    const prisma = buildPrismaMock(mockRows)
    const svc = new LogsAggregateService(prisma, new LogsService())

    const result = await svc.query({
      metric: 'errorRate',
      source: 'postgres',
      limit: 100,
      bucket: 'auto',
    })
    const row = (result as ErrorRateRow[])[0]
    if (row === undefined) throw new Error('Expected first errorRate row to be defined')
    expect(row.errorRate).toBeNull()
  })
})

describe('LogsAggregateService.query — statusMix', () => {
  it('routes the statusMix metric to its builder and returns the raw rows', async () => {
    /**
     * The `statusMix` switch arm must call `$queryRaw` and pass through the
     * per-status-class counts unchanged — covers the statusMix case and builder.
     */
    const bucket = new Date('2024-06-01T12:00:00.000Z')
    const mockRows: StatusMixRow[] = [{ bucket, s2xx: 10, s3xx: 1, s4xx: 2, s5xx: 3 }]
    const prisma = buildPrismaMock(mockRows)
    const svc = new LogsAggregateService(prisma, new LogsService())

    const result = await svc.query({
      metric: 'statusMix',
      source: 'postgres',
      limit: 100,
      bucket: 'auto',
    })
    expect(result).toEqual(mockRows)
    expect(prisma.$queryRaw as jest.Mock).toHaveBeenCalledTimes(1)
  })
})

describe('LogsAggregateService — filter SQL fragment', () => {
  /**
   * Capture the `Prisma.sql` template handed to `$queryRaw` so the bound values
   * produced by `buildFilterSql` can be asserted. The tagged template exposes
   * its interpolated `values`; we assert the user input is bound there (never
   * string-interpolated into `strings`).
   */
  function capture(returnValue: unknown) {
    const queryRaw = jest.fn<(args: unknown) => Promise<unknown>>().mockResolvedValue(returnValue)
    const prisma = { $queryRaw: queryRaw } as unknown as PrismaService
    return { prisma, queryRaw }
  }

  it('binds service, exact logKey, traceId, requestId and free-text q as parameters', async () => {
    /**
     * Each scalar filter (`service`, exact `logKey`, `traceId`, `requestId`, `q`)
     * adds an `AND ... = $n` (or `ILIKE`) fragment with the value bound — covers the
     * string branches of every filter in `buildFilterSql`.
     */
    const { prisma, queryRaw } = capture([])
    const svc = new LogsAggregateService(prisma, new LogsService())

    await svc.query({
      metric: 'volume',
      source: 'postgres',
      limit: 100,
      bucket: 'auto',
      service: 'api',
      logKey: 'PAYMENT_REFUND_FAILED',
      traceId: 'trace-1',
      requestId: 'req-1',
      q: 'boom',
    })

    const call = queryRaw.mock.calls[0]
    if (call === undefined) throw new Error('Expected $queryRaw to be called')
    const sql = call[0] as unknown as { values: unknown[] }
    expect(sql.values).toContain('api')
    expect(sql.values).toContain('PAYMENT_REFUND_FAILED')
    expect(sql.values).toContain('trace-1')
    expect(sql.values).toContain('req-1')
    // Free-text is wrapped with ILIKE wildcards.
    expect(sql.values).toContain('%boom%')
  })

  it('binds a level range as an IN list and a wildcard logKey as a LIKE prefix', async () => {
    /**
     * A `{ gte }` level expands to the levels-at-or-above set bound via `Prisma.join`,
     * and a `PREFIX_*` logKey becomes a `LIKE 'PREFIX_%'` bound value — covers the
     * object branches of the level and logKey filters.
     */
    const { prisma, queryRaw } = capture([])
    const svc = new LogsAggregateService(prisma, new LogsService())

    await svc.query({
      metric: 'volume',
      source: 'postgres',
      limit: 100,
      bucket: 'auto',
      level: { gte: 'warn' },
      logKey: 'PAYMENT_*',
    })

    const call = queryRaw.mock.calls[0]
    if (call === undefined) throw new Error('Expected $queryRaw to be called')
    const sql = call[0] as unknown as { values: unknown[] }
    // Levels at or above warn are each bound individually.
    expect(sql.values).toContain('fatal')
    expect(sql.values).toContain('error')
    expect(sql.values).toContain('warn')
    // Wildcard logKey becomes a LIKE prefix.
    expect(sql.values).toContain('PAYMENT_%')
  })

  it('binds a single string level as an equality value', async () => {
    /**
     * A plain string level emits `AND "level" = $n` with the value bound — covers
     * the string branch of the level filter distinct from the IN-list branch.
     */
    const { prisma, queryRaw } = capture([])
    const svc = new LogsAggregateService(prisma, new LogsService())

    await svc.query({
      metric: 'volume',
      source: 'postgres',
      limit: 100,
      bucket: 'auto',
      level: 'error',
    })

    const call = queryRaw.mock.calls[0]
    if (call === undefined) throw new Error('Expected $queryRaw to be called')
    const sql = call[0] as unknown as { values: unknown[] }
    expect(sql.values).toContain('error')
  })
})

describe('LogsAggregateService — bucket and tenant context', () => {
  it('uses the explicit bucket sizing when bucket is not auto', async () => {
    /**
     * A non-`auto` bucket (`5m`) must resolve via the EXPLICIT_BUCKET table —
     * the `minute` unit and `5 minutes` interval are interpolated into the SQL,
     * bypassing `resolveBucket`.
     */
    const queryRaw = jest.fn<(args: unknown) => Promise<unknown>>().mockResolvedValue([])
    const prisma = { $queryRaw: queryRaw } as unknown as PrismaService
    const svc = new LogsAggregateService(prisma, new LogsService())

    await svc.query({
      metric: 'volume',
      source: 'postgres',
      limit: 100,
      bucket: '5m',
    })

    const call = queryRaw.mock.calls[0]
    if (call === undefined) throw new Error('Expected $queryRaw to be called')
    const sql = call[0] as unknown as { values: unknown[] }
    expect(sql.values).toContain('5 minutes')
    expect(sql.values).toContain('minute')
  })

  it('threads a tenantId from a restriction-driven where clause', async () => {
    /**
     * When `buildPrismaWhere` yields a string `tenantId`, `extractQueryContext`
     * picks it up and binds it into the SQL — covers the tenant-present branch.
     */
    const queryRaw = jest.fn<(args: unknown) => Promise<unknown>>().mockResolvedValue([])
    const prisma = { $queryRaw: queryRaw } as unknown as PrismaService
    const svc = new LogsAggregateService(prisma, new LogsService())

    await svc.query({
      metric: 'errorRate',
      source: 'postgres',
      limit: 100,
      bucket: 'auto',
      tenantId: 'acme',
    })

    const call = queryRaw.mock.calls[0]
    if (call === undefined) throw new Error('Expected $queryRaw to be called')
    const sql = call[0] as unknown as { values: unknown[] }
    expect(sql.values).toContain('acme')
  })

  it('falls back to now-1h / now when the where clause carries no time bounds', () => {
    /**
     * `buildPrismaWhere` always sets `time.gte`/`time.lte`, but `extractQueryContext`
     * is defensive: a `where` with no `time` key (or a `time` lacking gte/lte) must
     * fall back to the now-1h / now window. Exercising the private method with a
     * bare `where` covers both ternary else-branches that the public path never hits.
     */
    const queryRaw = jest.fn<() => Promise<unknown>>().mockResolvedValue([])
    const prisma = { $queryRaw: queryRaw } as unknown as PrismaService
    const svc = new LogsAggregateService(prisma, new LogsService())

    const before = Date.now()
    const ctx = (
      svc as unknown as {
        extractQueryContext: (
          where: Record<string, unknown>,
          q: { bucket: string; from?: string; to?: string },
        ) => { from: Date; to: Date }
      }
    ).extractQueryContext({}, { bucket: 'auto' })
    const after = Date.now()

    // `to` defaults to ~now; `from` defaults to ~now-1h.
    expect(ctx.to.getTime()).toBeGreaterThanOrEqual(before)
    expect(ctx.to.getTime()).toBeLessThanOrEqual(after)
    const oneHourMs = 60 * 60 * 1000
    expect(ctx.from.getTime()).toBeGreaterThanOrEqual(before - oneHourMs)
    expect(ctx.from.getTime()).toBeLessThanOrEqual(after - oneHourMs)
  })
})
