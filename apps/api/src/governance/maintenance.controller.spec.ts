/**
 * Unit tests for `MaintenanceController`.
 *
 * Covers `GET /maintenance/retention` (viewers forbidden, operator+ reads
 * status) and `PATCH /maintenance/retention` (non-admins forbidden, admins
 * update the window, write an audit event, and return refreshed status). Both
 * tenantId-present and tenantId-absent audit branches are exercised.
 */
import { describe, expect, it, jest, beforeEach } from '@jest/globals'
import { ForbiddenException } from '@nestjs/common'

import { MaintenanceController, updateRetentionSchema } from './maintenance.controller.js'
import type { AuditService } from './audit.service.js'
import type { RetentionStatus, RetentionSweepService } from './retention.sweep.service.js'

/** Typed helper for the mocked service surfaces. */
type MockFn = ReturnType<typeof jest.fn>

/** Canned status returned by the sweep mock. */
const status: RetentionStatus = {
  retentionDays: 30,
  nextSweep: '2026-06-06T00:00:00.000Z',
  pendingRows: 5,
}

describe('MaintenanceController', () => {
  let getStatusMock: MockFn
  let setRetentionDaysMock: MockFn
  let recordMock: MockFn
  let sweep: RetentionSweepService
  let audit: AuditService
  let controller: MaintenanceController

  beforeEach(() => {
    getStatusMock = jest.fn<() => Promise<RetentionStatus>>().mockResolvedValue(status)
    setRetentionDaysMock = jest.fn<(d: number) => number>((d) => d)
    recordMock = jest.fn<() => Promise<void>>().mockResolvedValue(undefined)
    sweep = {
      getStatus: getStatusMock,
      setRetentionDays: setRetentionDaysMock,
    } as unknown as RetentionSweepService
    audit = { record: recordMock } as unknown as AuditService
    controller = new MaintenanceController(sweep, audit)
  })

  describe('getStatus', () => {
    it('forbids viewers from reading retention status', async () => {
      /**
       * Maintenance settings are operator+; a `viewer` must be rejected with a
       * `ForbiddenException` before the sweep service is consulted.
       */
      await expect(controller.getStatus({ 'x-role': 'viewer' })).rejects.toBeInstanceOf(
        ForbiddenException,
      )
      expect(getStatusMock).not.toHaveBeenCalled()
    })

    it('returns the sweep status for an operator', async () => {
      /**
       * An operator (non-viewer) must receive the current retention status from
       * the sweep service untouched.
       */
      const result = await controller.getStatus({ 'x-role': 'operator' })

      expect(result).toBe(status)
      expect(getStatusMock).toHaveBeenCalledTimes(1)
    })
  })

  describe('updateRetention', () => {
    it('forbids a non-admin from updating the retention window', async () => {
      /**
       * Only admins may change retention; an operator must be rejected with a
       * `ForbiddenException` and neither the setter nor the audit log runs.
       */
      await expect(
        controller.updateRetention({ 'x-role': 'operator' }, { retentionDays: 7 }),
      ).rejects.toBeInstanceOf(ForbiddenException)
      expect(setRetentionDaysMock).not.toHaveBeenCalled()
      expect(recordMock).not.toHaveBeenCalled()
    })

    it('updates the window and records an audit event with the tenantId', async () => {
      /**
       * An admin with a tenantId must apply the new window, persist an audit
       * event carrying that tenantId, and return refreshed status.
       */
      const result = await controller.updateRetention(
        { 'x-role': 'admin', 'x-tenant-id': 'acme', 'x-actor': 'root' },
        { retentionDays: 14 },
      )

      expect(setRetentionDaysMock).toHaveBeenCalledWith(14)
      expect(recordMock).toHaveBeenCalledWith({
        actor: 'root',
        action: 'retention.changed',
        target: 'retentionDays=14',
        tenantId: 'acme',
      })
      expect(result).toBe(status)
    })

    it('records an audit event without a tenantId when the header is absent', async () => {
      /**
       * An admin without `x-tenant-id` must still update and audit the change,
       * but the audit payload must omit the `tenantId` key (the spread guard).
       */
      await controller.updateRetention(
        { 'x-role': 'admin', 'x-actor': 'root' },
        {
          retentionDays: 90,
        },
      )

      expect(setRetentionDaysMock).toHaveBeenCalledWith(90)
      expect(recordMock).toHaveBeenCalledWith({
        actor: 'root',
        action: 'retention.changed',
        target: 'retentionDays=90',
      })
      expect(recordMock.mock.calls[0]?.[0]).not.toHaveProperty('tenantId')
    })

    it('throws ForbiddenException with the exact non-admin message on updateRetention', async () => {
      /**
       * Scenario: operator tries to change the retention window.
       * Rule: the ForbiddenException message must be exactly `'Only admins can
       * update the retention window'` — kills the StringLiteral mutation.
       */
      let thrown: unknown
      try {
        await controller.updateRetention({ 'x-role': 'operator' }, { retentionDays: 7 })
      } catch (e) {
        thrown = e
      }
      expect(thrown).toBeInstanceOf(ForbiddenException)
      expect((thrown as ForbiddenException).message).toBe(
        'Only admins can update the retention window',
      )
    })
  })

  describe('getStatus — forbidden message', () => {
    it('throws ForbiddenException with the exact viewer-denied message', async () => {
      /**
       * Scenario: viewer reads retention status.
       * Rule: the ForbiddenException message must be exactly
       * `'Viewers cannot access maintenance settings'` — kills the StringLiteral mutation.
       */
      let thrown: unknown
      try {
        await controller.getStatus({ 'x-role': 'viewer' })
      } catch (e) {
        thrown = e
      }
      expect(thrown).toBeInstanceOf(ForbiddenException)
      expect((thrown as ForbiddenException).message).toBe(
        'Viewers cannot access maintenance settings',
      )
    })
  })
})

describe('updateRetentionSchema — retentionDays boundary validation', () => {
  it('rejects retentionDays 0 — kills z.number().int().max(1) mutant', () => {
    /**
     * Scenario: retentionDays below the minimum.
     * Rule: `z.number().int().min(1)` must reject 0 — kills the MethodExpression
     * mutant that replaces `.min(1)` with `.max(1)`.
     */
    expect(updateRetentionSchema.safeParse({ retentionDays: 0 }).success).toBe(false)
  })

  it('accepts retentionDays 1 — kills z.number().int().min(1).min(365) mutant', () => {
    /**
     * Scenario: retentionDays at the minimum boundary.
     * Rule: `.min(1)` must accept 1 — kills the MethodExpression mutant that
     * replaces `.max(365)` with `.min(365)`, which would reject values below 365.
     */
    expect(updateRetentionSchema.safeParse({ retentionDays: 1 }).success).toBe(true)
  })

  it('accepts retentionDays 365 — confirms upper boundary', () => {
    /**
     * Scenario: retentionDays at the maximum boundary.
     * Rule: `.max(365)` must accept 365 — paired with the 366 test, this proves
     * the boundary is exactly at 365.
     */
    expect(updateRetentionSchema.safeParse({ retentionDays: 365 }).success).toBe(true)
  })

  it('rejects retentionDays 366 — kills z.number().int().min(1).min(365) mutant', () => {
    /**
     * Scenario: retentionDays above the maximum.
     * Rule: `.max(365)` must reject 366 — kills the MethodExpression mutant that
     * changes `.max(365)` to `.min(365)`, which would accept any value ≥ 365.
     */
    expect(updateRetentionSchema.safeParse({ retentionDays: 366 }).success).toBe(false)
  })
})
