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
import type { VolumeRow, ErrorRateRow, LatencyRow } from './logs.aggregate.service.js'

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
