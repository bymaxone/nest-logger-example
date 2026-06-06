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

import { MaintenanceController } from './maintenance.controller.js'
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
  })
})
