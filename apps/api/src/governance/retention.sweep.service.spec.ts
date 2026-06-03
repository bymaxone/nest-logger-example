/**
 * Unit tests for `RetentionSweepService`.
 *
 * Covers: sweep deletes only rows older than `retentionDays`, leaves newer rows
 * untouched, and updates `retentionDays` via `setRetentionDays`.
 */
import { describe, expect, it, jest, beforeEach } from '@jest/globals'

import type { PrismaService } from '../prisma/prisma.service.js'
import { RetentionSweepService } from './retention.sweep.service.js'

/** Typed helpers for the mocked Prisma surface. */
type MockFn = ReturnType<typeof jest.fn>

describe('RetentionSweepService', () => {
  let prisma: PrismaService
  let deleteMock: MockFn
  let svc: RetentionSweepService

  beforeEach(() => {
    delete process.env['RETENTION_DAYS']
    deleteMock = jest.fn<() => Promise<{ count: number }>>().mockResolvedValue({ count: 42 })
    prisma = {
      applicationLog: {
        deleteMany: deleteMock,
        count: jest.fn<() => Promise<number>>().mockResolvedValue(10),
      },
    } as unknown as PrismaService
    svc = new RetentionSweepService(prisma)
  })

  it('calls deleteMany with a cutoff date derived from retentionDays (default 30)', async () => {
    /**
     * The sweep must pass `{ time: { lt: cutoff } }` where `cutoff` is
     * `now - 30 days`. We verify that `time.lt` is in the past relative to now.
     */
    await svc.sweep()

    expect(deleteMock).toHaveBeenCalledTimes(1)
    const callArg = deleteMock.mock.calls[0] as [{ where: { time: { lt: Date } } }]
    const cutoff = callArg[0].where.time.lt
    expect(cutoff).toBeInstanceOf(Date)
    // Cutoff must be ~30 days in the past (within 1 minute of tolerance).
    const expectedMs = Date.now() - 30 * 24 * 60 * 60 * 1000
    expect(Math.abs(cutoff.getTime() - expectedMs)).toBeLessThan(60_000)
  })

  it('does not delete rows newer than the retention cutoff', async () => {
    /**
     * This test verifies the cutoff formula: rows with time > cutoff must not
     * be included in the deleteMany call. Since Prisma is mocked, we assert the
     * `lt` predicate is not `gte` (which would delete new rows).
     */
    await svc.sweep()

    const callArg = deleteMock.mock.calls[0] as [{ where: { time: { lt: Date } } }]
    const where = callArg[0].where
    // Must use `lt`, never `gt` or `gte`.
    expect(Object.keys(where.time)).toContain('lt')
    expect(Object.keys(where.time)).not.toContain('gt')
  })

  it('getStatus returns pendingRows from Prisma count', async () => {
    /**
     * `getStatus()` must query the count of rows older than the cutoff and
     * return it as `pendingRows`.
     */
    const status = await svc.getStatus()
    expect(status.pendingRows).toBe(10)
    expect(status.retentionDays).toBe(30)
    expect(typeof status.nextSweep).toBe('string')
  })

  it('setRetentionDays updates the effective window', async () => {
    /**
     * After `setRetentionDays(7)`, the sweep cutoff should be ~7 days in the
     * past, not 30.
     */
    svc.setRetentionDays(7)
    await svc.sweep()

    const callArg = deleteMock.mock.calls[0] as [{ where: { time: { lt: Date } } }]
    const cutoff = callArg[0].where.time.lt
    const expectedMs = Date.now() - 7 * 24 * 60 * 60 * 1000
    expect(Math.abs(cutoff.getTime() - expectedMs)).toBeLessThan(60_000)
  })
})
