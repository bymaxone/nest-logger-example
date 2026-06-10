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

  it('uses a valid positive RETENTION_DAYS env var over the default', () => {
    /**
     * When `RETENTION_DAYS` parses to a finite, positive integer, the constructor
     * must honor it instead of falling back to 30 — covering the true side of the
     * `Number.isFinite(parsed) && parsed > 0` guard.
     */
    process.env['RETENTION_DAYS'] = '7'
    const local = new RetentionSweepService(prisma)
    expect(local.setRetentionDays).toBeDefined()
    return local.getStatus().then((status) => {
      expect(status.retentionDays).toBe(7)
    })
  })

  it('ignores a non-positive RETENTION_DAYS env var and falls back to the default', async () => {
    /**
     * A zero / negative / non-numeric `RETENTION_DAYS` must be rejected by the
     * guard, leaving the default 30-day window — covering the false side of the
     * constructor guard.
     */
    process.env['RETENTION_DAYS'] = '0'
    const local = new RetentionSweepService(prisma)
    const status = await local.getStatus()
    expect(status.retentionDays).toBe(30)
  })

  it('logs and swallows errors when deleteMany rejects (fail-soft)', async () => {
    /**
     * The nightly sweep is fail-soft: a failing `deleteMany` must be caught and
     * logged via `logger.error`, never re-thrown — covering the catch branch.
     */
    const boom = new Error('db down')
    deleteMock.mockRejectedValueOnce(boom)
    const errorSpy = jest.spyOn(svc['logger'], 'error').mockImplementation(() => undefined)

    await expect(svc.sweep()).resolves.toBeUndefined()
    expect(errorSpy).toHaveBeenCalledWith('Retention sweep failed', 'db down')
  })

  it('stringifies non-Error rejection values in the failure log', async () => {
    /**
     * When `deleteMany` rejects with a non-Error value, the catch must coerce it
     * with `String(err)` — covering the `err instanceof Error ? ... : String(err)`
     * false branch.
     */
    deleteMock.mockRejectedValueOnce('plain string failure')
    const errorSpy = jest.spyOn(svc['logger'], 'error').mockImplementation(() => undefined)

    await expect(svc.sweep()).resolves.toBeUndefined()
    expect(errorSpy).toHaveBeenCalledWith('Retention sweep failed', 'plain string failure')
  })

  it('getStatus passes a lt-operator predicate with the correct arithmetic cutoff to count', async () => {
    /**
     * Scenario: getStatus queries pending rows.
     * Rule: the Prisma `count` call must use `{ where: { time: { lt: cutoff } } }`
     * where `cutoff` is `now - 30 * 24 * 60 * 60 * 1000` ms — kills both the
     * ObjectLiteral mutation (wrong operator key) and the five ArithmeticOperator
     * mutations on the formula at line 68 of the source.
     */
    const countMock = prisma.applicationLog.count as ReturnType<typeof jest.fn>
    const before = Date.now()
    await svc.getStatus()
    const after = Date.now()

    expect(countMock).toHaveBeenCalledTimes(1)
    const countArg = countMock.mock.calls[0] as [{ where: { time: { lt: Date } } }]
    const cutoff = countArg[0].where.time.lt
    expect(cutoff).toBeInstanceOf(Date)
    // Must use `lt`, never any other operator key.
    expect(Object.keys(countArg[0].where.time)).toEqual(['lt'])
    // Cutoff must be ~30 days in the past (within a 1-minute tolerance window).
    const thirtyDaysMs = 30 * 24 * 60 * 60 * 1000
    expect(Math.abs(cutoff.getTime() - (before - thirtyDaysMs))).toBeLessThan(60_000)
    expect(Math.abs(cutoff.getTime() - (after - thirtyDaysMs))).toBeLessThan(60_000)
  })

  it('default retentionDays is exactly 30, not any neighbour value', async () => {
    /**
     * Scenario: no RETENTION_DAYS env var set.
     * Rule: `retentionDays` must be exactly `30` — kills the StringLiteral mutation
     * on the default `30` literal in the constructor guard.
     */
    const status = await svc.getStatus()
    expect(status.retentionDays).toBe(30)
    // Explicitly confirm it is not a neighbour value.
    expect(status.retentionDays).not.toBe(29)
    expect(status.retentionDays).not.toBe(31)
  })

  it('sweep uses identical arithmetic constant as getStatus for the cutoff', async () => {
    /**
     * Scenario: both sweep() and getStatus() compute a cutoff from the same
     * formula `retentionDays * 24 * 60 * 60 * 1000`.
     * Rule: after calling sweep, the deleteMany cutoff and the count cutoff from
     * a subsequent getStatus call must both be ~30 days in the past — confirms the
     * per-day milliseconds constant (86_400_000) is correct in both call sites.
     */
    const countMock = prisma.applicationLog.count as ReturnType<typeof jest.fn>

    const before = Date.now()
    await svc.sweep()
    await svc.getStatus()
    const after = Date.now()

    const sweepArg = deleteMock.mock.calls[0] as [{ where: { time: { lt: Date } } }]
    const countArg = countMock.mock.calls[0] as [{ where: { time: { lt: Date } } }]

    const perDayMs = 24 * 60 * 60 * 1000
    const expectedMin = before - 30 * perDayMs
    const expectedMax = after - 30 * perDayMs

    expect(sweepArg[0].where.time.lt.getTime()).toBeGreaterThanOrEqual(expectedMin)
    expect(sweepArg[0].where.time.lt.getTime()).toBeLessThanOrEqual(expectedMax)
    expect(countArg[0].where.time.lt.getTime()).toBeGreaterThanOrEqual(expectedMin)
    expect(countArg[0].where.time.lt.getTime()).toBeLessThanOrEqual(expectedMax)
  })

  it('logs the exact success message template including count and cutoff — kills StringLiteral mutant on L56', async () => {
    /**
     * Scenario: sweep completes successfully.
     * Rule: `logger.log` must be called with a message matching the template
     * `"Retention sweep: deleted N rows older than <iso>"` — kills the
     * StringLiteral mutant that replaces the template literal with `''` (which would
     * produce an empty log message, failing the content assertions below).
     */
    const logSpy = jest
      .spyOn(
        svc['logger' as keyof typeof svc] as unknown as { log: (...args: unknown[]) => void },
        'log',
      )
      .mockImplementation(() => undefined)

    await svc.sweep()

    expect(logSpy).toHaveBeenCalledTimes(1)
    const message = String(logSpy.mock.calls[0]?.[0])
    expect(message).toContain('Retention sweep: deleted')
    expect(message).toContain('42') // count returned by the deleteMock
    expect(message).toContain('rows older than')
  })
})
