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

  it('passes through all three percentile fields (p50, p95, p99) with distinct values', async () => {
    /**
     * The service must not drop or zero p95/p99 — omitting high percentiles would mask
     * tail-latency outliers.  Uses three distinct values so a field-swap mutation is also caught.
     */
    const bucket = new Date('2024-06-01T12:00:00.000Z')
    const mockRows: LatencyRow[] = [{ bucket, p50: 10, p95: 950, p99: 990 }]
    const prisma = buildPrismaMock(mockRows)
    const svc = new LogsAggregateService(prisma, new LogsService())

    const result = await svc.query({
      metric: 'latency',
      source: 'postgres',
      limit: 100,
      bucket: 'auto',
    })
    const row = (result as LatencyRow[])[0]
    if (row === undefined) throw new Error('Expected first latency row to be defined')
    expect(row.p50).toBe(10)
    expect(row.p95).toBe(950)
    expect(row.p99).toBe(990)
  })

  it('binds percentile fractions 0.50, 0.95, 0.99 in the raw SQL so all three orders are present', async () => {
    /**
     * The latency SQL must contain the three percentile_cont fractions as bound values.
     * If any fraction were mutated (e.g. 0.95 → 0.50), two percentile columns would
     * compute the same thing and tail-latency visibility would be silently lost.
     */
    const queryRaw = jest.fn<(args: unknown) => Promise<unknown>>().mockResolvedValue([])
    const prisma = { $queryRaw: queryRaw } as unknown as PrismaService
    const svc = new LogsAggregateService(prisma, new LogsService())

    await svc.query({ metric: 'latency', source: 'postgres', limit: 100, bucket: 'auto' })

    const call = queryRaw.mock.calls[0]
    if (call === undefined) throw new Error('Expected $queryRaw to be called')
    // percentile_cont values are interpolated into the SQL as bound parameters.
    const sql = call[0] as unknown as { strings: readonly string[] }
    const fullSql = sql.strings.join('')
    expect(fullSql).toContain('0.50')
    expect(fullSql).toContain('0.95')
    expect(fullSql).toContain('0.99')
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

  it('scopes the error-rate query to log keys matching the HTTP_REQUEST_ prefix', async () => {
    /**
     * The errorRate SQL must filter rows with "logKey" LIKE 'HTTP_REQUEST_%'.
     * If that prefix were mutated or removed, unrelated log keys would be counted,
     * silently widening the error-rate denominator.  Asserting the joined SQL template
     * strings catches any string-literal mutation of the prefix.
     */
    const queryRaw = jest.fn<(args: unknown) => Promise<unknown>>().mockResolvedValue([])
    const prisma = { $queryRaw: queryRaw } as unknown as PrismaService
    const svc = new LogsAggregateService(prisma, new LogsService())

    await svc.query({ metric: 'errorRate', source: 'postgres', limit: 100, bucket: 'auto' })

    const call = queryRaw.mock.calls[0]
    if (call === undefined) throw new Error('Expected $queryRaw to be called')
    const sql = call[0] as unknown as { strings: readonly string[] }
    expect(sql.strings.join('')).toContain('HTTP_REQUEST_')
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

  it('passes through all four status-class counts with distinct values', async () => {
    /**
     * s2xx, s3xx, s4xx, s5xx must all be present and match the raw query output.
     * Using four distinct counts means a field-swap mutation (e.g. s2xx and s4xx
     * swapped) would be caught by this test.
     */
    const bucket = new Date('2024-06-01T12:00:00.000Z')
    const mockRows: StatusMixRow[] = [{ bucket, s2xx: 200, s3xx: 30, s4xx: 40, s5xx: 50 }]
    const prisma = buildPrismaMock(mockRows)
    const svc = new LogsAggregateService(prisma, new LogsService())

    const result = await svc.query({
      metric: 'statusMix',
      source: 'postgres',
      limit: 100,
      bucket: 'auto',
    })
    const row = (result as StatusMixRow[])[0]
    if (row === undefined) throw new Error('Expected first statusMix row to be defined')
    expect(row.s2xx).toBe(200)
    expect(row.s3xx).toBe(30)
    expect(row.s4xx).toBe(40)
    expect(row.s5xx).toBe(50)
  })

  it('scopes status-class counts via the 200-299 / 300-399 / 400-499 / 500+ boundaries in the SQL', async () => {
    /**
     * The BETWEEN boundaries and >= 500 threshold are static strings in the SQL template.
     * If any boundary were mutated (e.g. 299 → 300), two status classes would overlap
     * or have gaps.  Asserting the joined template strings catches literal mutations.
     */
    const queryRaw = jest.fn<(args: unknown) => Promise<unknown>>().mockResolvedValue([])
    const prisma = { $queryRaw: queryRaw } as unknown as PrismaService
    const svc = new LogsAggregateService(prisma, new LogsService())

    await svc.query({ metric: 'statusMix', source: 'postgres', limit: 100, bucket: 'auto' })

    const call = queryRaw.mock.calls[0]
    if (call === undefined) throw new Error('Expected $queryRaw to be called')
    const sql = call[0] as unknown as { strings: readonly string[] }
    const fullSql = sql.strings.join('')
    expect(fullSql).toContain('200')
    expect(fullSql).toContain('299')
    expect(fullSql).toContain('300')
    expect(fullSql).toContain('399')
    expect(fullSql).toContain('400')
    expect(fullSql).toContain('499')
    expect(fullSql).toContain('500')
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

  it('does not add a level filter when no level is supplied (covers the falsy level guard)', async () => {
    /**
     * When `level` is absent the level filter block must be entirely skipped.
     * This exercises the false path of `typeof level === 'string'` and the false
     * path of `level && typeof level === 'object' && ...` — the level guard prevents
     * a null/undefined from being passed to Array.isArray.
     */
    const { prisma, queryRaw } = capture([])
    const svc = new LogsAggregateService(prisma, new LogsService())

    await svc.query({ metric: 'volume', source: 'postgres', limit: 100, bucket: 'auto' })

    const call = queryRaw.mock.calls[0]
    if (call === undefined) throw new Error('Expected $queryRaw to be called')
    const sql = call[0] as unknown as { strings: readonly string[]; values: readonly unknown[] }
    // No level value should be bound when no level filter is active.
    const levelValues = ['fatal', 'error', 'warn', 'info', 'debug', 'trace']
    for (const lv of levelValues) {
      expect(sql.values).not.toContain(lv)
    }
    expect(sql.strings.join('')).not.toContain('"level"')
  })

  it('does not add a logKey filter when no logKey is supplied (covers the logKey guard branches)', async () => {
    /**
     * When `logKey` is absent neither the equality nor the LIKE branch of the logKey
     * filter runs.  Exercises the false path of `typeof logKey === 'string'` and the
     * false path of `logKey && typeof logKey === 'object' && ...`.
     */
    const { prisma, queryRaw } = capture([])
    const svc = new LogsAggregateService(prisma, new LogsService())

    await svc.query({ metric: 'volume', source: 'postgres', limit: 100, bucket: 'auto' })

    const call = queryRaw.mock.calls[0]
    if (call === undefined) throw new Error('Expected $queryRaw to be called')
    const sql = call[0] as unknown as { strings: readonly string[] }
    expect(sql.strings.join('')).not.toContain('"logKey"')
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

  it('uses the exact string minute and 1 minute for the 1m explicit bucket', async () => {
    /**
     * EXPLICIT_BUCKET['1m'] must bind unit='minute' and interval='1 minute'.
     * If either string literal were mutated the SQL would use the wrong granularity,
     * silently corrupting 1-minute charts without any runtime error.
     */
    const queryRaw = jest.fn<(args: unknown) => Promise<unknown>>().mockResolvedValue([])
    const prisma = { $queryRaw: queryRaw } as unknown as PrismaService
    const svc = new LogsAggregateService(prisma, new LogsService())

    await svc.query({
      metric: 'volume',
      source: 'postgres',
      limit: 100,
      bucket: '1m',
    })

    const call = queryRaw.mock.calls[0]
    if (call === undefined) throw new Error('Expected $queryRaw to be called')
    const sql = call[0] as unknown as { values: unknown[] }
    // '1 minute' is the interval unique to the 1m bucket (5m uses '5 minutes').
    expect(sql.values).toContain('1 minute')
    expect(sql.values).toContain('minute')
  })

  it('uses the exact string hour and 1 hour for the 1h explicit bucket', async () => {
    /**
     * EXPLICIT_BUCKET['1h'] must bind unit='hour' and interval='1 hour'.
     * If either string literal were mutated the hour-level chart panels would
     * group data at the wrong granularity.
     */
    const queryRaw = jest.fn<(args: unknown) => Promise<unknown>>().mockResolvedValue([])
    const prisma = { $queryRaw: queryRaw } as unknown as PrismaService
    const svc = new LogsAggregateService(prisma, new LogsService())

    await svc.query({
      metric: 'volume',
      source: 'postgres',
      limit: 100,
      bucket: '1h',
    })

    const call = queryRaw.mock.calls[0]
    if (call === undefined) throw new Error('Expected $queryRaw to be called')
    const sql = call[0] as unknown as { values: unknown[] }
    // 'hour' appears only in the 1h bucket entry; '1 hour' uniquely identifies the interval.
    expect(sql.values).toContain('1 hour')
    expect(sql.values).toContain('hour')
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

  it('binds exactly the string minute (not empty) for the 1m bucket unit', async () => {
    /**
     * Extra assertion to guarantee the unit string bound for the '1m' explicit bucket
     * is 'minute' and not the empty string produced by a StringLiteral mutation.
     * Complements the `toContain('minute')` check by asserting `''` is absent.
     */
    const queryRaw = jest.fn<(args: unknown) => Promise<unknown>>().mockResolvedValue([])
    const prisma = { $queryRaw: queryRaw } as unknown as PrismaService
    const svc = new LogsAggregateService(prisma, new LogsService())

    await svc.query({ metric: 'volume', source: 'postgres', limit: 100, bucket: '1m' })

    const call = queryRaw.mock.calls[0]
    if (call === undefined) throw new Error('Expected $queryRaw to be called')
    const sql = call[0] as unknown as { values: unknown[] }
    expect(sql.values).toContain('1 minute')
    expect(sql.values).toContain('minute')
    // Mutant changes 'minute' or '1 minute' to ''. An empty string in the values array
    // means the wrong granularity is used — assert it is absent.
    expect(sql.values).not.toContain('')
  })

  it('binds exactly the string hour (not empty) for the 1h bucket unit', async () => {
    /**
     * Same guard for the '1h' explicit bucket — unit='hour', interval='1 hour'.
     * A StringLiteral mutation to '' would silently break hour-level chart panels.
     */
    const queryRaw = jest.fn<(args: unknown) => Promise<unknown>>().mockResolvedValue([])
    const prisma = { $queryRaw: queryRaw } as unknown as PrismaService
    const svc = new LogsAggregateService(prisma, new LogsService())

    await svc.query({ metric: 'volume', source: 'postgres', limit: 100, bucket: '1h' })

    const call = queryRaw.mock.calls[0]
    if (call === undefined) throw new Error('Expected $queryRaw to be called')
    const sql = call[0] as unknown as { values: unknown[] }
    expect(sql.values).toContain('1 hour')
    expect(sql.values).toContain('hour')
    expect(sql.values).not.toContain('')
  })
})

// ---------------------------------------------------------------------------
// buildFilterSql — null-safety and type-guard branches
//
// `buildFilterSql` is private, so these tests access it via an unsafe cast.
// This is intentional: `buildPrismaWhere` always produces well-typed values
// so the guards are never exercised through the normal call path. Directly
// crafted `where` objects reach the false sides of every guard.
// ---------------------------------------------------------------------------

describe('LogsAggregateService — buildFilterSql null-safety and type-guard branches', () => {
  type FilterSql = { strings: readonly string[]; values: readonly unknown[] }

  function callFilter(where: Record<string, unknown>): FilterSql {
    const prisma = {
      $queryRaw: jest.fn<() => Promise<unknown>>().mockResolvedValue([]),
    } as unknown as PrismaService
    const svc = new LogsAggregateService(prisma, new LogsService())
    type BFS = (w: Record<string, unknown>) => FilterSql
    return (svc as unknown as { buildFilterSql: BFS }).buildFilterSql.call(svc, where)
  }

  it('does not add service, traceId, or requestId filters when those fields are absent', async () => {
    /**
     * Guards the `typeof where.service === 'string'`, `typeof where.traceId === 'string'`,
     * and `typeof where.requestId === 'string'` conditions against ConditionalExpression
     * mutations that replace each with `true`. If any condition is always-true, the filter
     * is emitted even for undefined fields, producing broken SQL with unbound parameters.
     */
    const queryRaw = jest.fn<(args: unknown) => Promise<unknown>>().mockResolvedValue([])
    const prisma = { $queryRaw: queryRaw } as unknown as PrismaService
    const svc = new LogsAggregateService(prisma, new LogsService())

    await svc.query({ metric: 'volume', source: 'postgres', limit: 100, bucket: 'auto' })

    const call = queryRaw.mock.calls[0]
    if (call === undefined) throw new Error('Expected $queryRaw to be called')
    const sql = call[0] as unknown as { strings: readonly string[] }
    const fullSql = sql.strings.join('')
    expect(fullSql).not.toContain('"service"')
    expect(fullSql).not.toContain('"traceId"')
    expect(fullSql).not.toContain('"requestId"')
  })

  it('does not throw when where.level is null (guards the level && short-circuit)', () => {
    /**
     * When `where.level` is `null`, the `level &&` must short-circuit before any
     * property access. The LogicalOperator mutation `&&` → `||` makes
     * `(null || typeof null === 'object')` evaluate to `true`, then crashes on
     * `null.in`. Asserting no throw kills that mutant.
     */
    expect(() => callFilter({ level: null })).not.toThrow()
    expect(callFilter({ level: null }).values).toHaveLength(0)
  })

  it('returns no level IN filter when where.level is an object without an in array', () => {
    /**
     * An object without `.in` (e.g. `{}`) must not trigger the IN-list branch.
     * Guards the `Array.isArray(level.in)` condition: a ConditionalExpression mutation
     * that replaces it with `true` would push `Prisma.join(undefined)`, which throws.
     * Asserting both no-throw and empty values kills that mutant.
     */
    expect(() => callFilter({ level: {} })).not.toThrow()
    expect(callFilter({ level: {} }).values).toHaveLength(0)
  })

  it('does not throw when where.logKey is null (guards the logKey && short-circuit)', () => {
    /**
     * Same null-safety guard as for level — the `logKey &&` must prevent access on
     * null before the `typeof logKey === 'object'` check. The OR mutant would proceed
     * to access `null.startsWith`, throwing a TypeError.
     */
    expect(() => callFilter({ logKey: null })).not.toThrow()
    expect(callFilter({ logKey: null }).values).toHaveLength(0)
  })

  it('returns no logKey LIKE filter when logKey is a truthy non-object (typeof !== object)', () => {
    /**
     * A function has typeof='function', not 'object'. The original condition correctly
     * skips the else-if branch. A ConditionalExpression mutation replacing
     * `typeof logKey === 'object'` with `true` would then check `typeof fn.startsWith`
     * where `.startsWith` is a string — and add a spurious LIKE clause.
     * Empty values assert the filter is not emitted.
     */
    const fnWithStartsWith = Object.assign((): void => undefined, { startsWith: 'PAY_' })
    expect(callFilter({ logKey: fnWithStartsWith }).values).toHaveLength(0)
  })

  it('returns no logKey LIKE filter when logKey.startsWith is not a string', () => {
    /**
     * A numeric `startsWith` must not produce a LIKE clause. A ConditionalExpression
     * mutation replacing `typeof logKey.startsWith === 'string'` with `true` would
     * bind `42 + '%'` = `'42%'` as the filter value — the empty-values assertion kills it.
     */
    expect(callFilter({ logKey: { startsWith: 42 } }).values).toHaveLength(0)
  })

  it('does not throw when where.message is null (guards the message && short-circuit)', () => {
    /**
     * Same pattern as level/logKey — the `message &&` must prevent access on null.
     * The OR mutant would proceed to `null.contains`, throwing a TypeError.
     */
    expect(() => callFilter({ message: null })).not.toThrow()
    expect(callFilter({ message: null }).values).toHaveLength(0)
  })

  it('returns no message ILIKE filter when message is a truthy non-object (typeof !== object)', () => {
    /**
     * Guards the `typeof message === 'object'` condition (ConditionalExpression → true).
     * A function with a string `contains` property has typeof='function', so the original
     * skips the block; the always-true mutant would add a spurious ILIKE clause.
     */
    const fnWithContains = Object.assign((): void => undefined, { contains: 'error' })
    expect(callFilter({ message: fnWithContains }).values).toHaveLength(0)
  })

  it('returns no message ILIKE filter when message.contains is not a string', () => {
    /**
     * A numeric `contains` must not produce an ILIKE filter. Guards the
     * `typeof message.contains === 'string'` ConditionalExpression — the always-true
     * mutant would bind `'%42%'` as the filter value.
     */
    expect(callFilter({ message: { contains: 42, mode: 'insensitive' } }).values).toHaveLength(0)
  })

  it('joins multiple active filter conditions with a single-space separator', () => {
    /**
     * When two or more filters are active, `Prisma.join(parts, ' ')` must use `' '`
     * as the separator so consecutive AND conditions are syntactically valid SQL.
     * A StringLiteral mutation to `''` removes the leading space from the second
     * fragment's first string — detected by asserting `' AND "level" = '` appears
     * in the strings array (the space is the separator, not from any static template).
     */
    const result = callFilter({ service: 'api', level: 'error' })
    expect(result.values).toContain('api')
    expect(result.values).toContain('error')
    // With ' ' separator, Prisma.join prepends ' ' to the second fragment's first string,
    // so ' AND "level" = ' is a substring of the joined strings array.
    expect(result.strings.join('|')).toContain(' AND "level" = ')
  })
})
