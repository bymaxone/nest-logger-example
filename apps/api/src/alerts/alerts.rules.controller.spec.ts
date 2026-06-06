/**
 * Unit tests for `AlertsRulesController`.
 *
 * Covers `GET /alerts/rules` (open read), `POST /alerts/rules` (viewer forbidden
 * vs operator/admin create with audit + optional tenantId), and
 * `PATCH /alerts/rules/:id` (viewer forbidden, undefined-field filtering, and
 * audit record with/without tenantId). Prisma and `AuditService` are mocked.
 */
import { describe, expect, it, jest, beforeEach } from '@jest/globals'
import { ForbiddenException } from '@nestjs/common'

import type { PrismaService } from '../prisma/prisma.service.js'
import type { AuditService } from '../governance/audit.service.js'
import { AlertsRulesController } from './alerts.rules.controller.js'

/** Typed alias for the mocked Prisma / audit surfaces. */
type MockFn = ReturnType<typeof jest.fn>

/** A valid create body matching `createRuleSchema`. */
const createBody = {
  name: 'Error spike',
  expr: 'count(level ∈ {error,fatal}) by logKey over 5m > 0',
  threshold: 0,
  forDuration: '5m',
  severity: 'critical' as const,
  channels: [],
}

describe('AlertsRulesController.list', () => {
  it('returns all rules ordered newest-first', async () => {
    /**
     * Listing is open to all roles and must read every rule ordered by
     * `createdAt desc`.
     */
    const findManyMock: MockFn = jest
      .fn<() => Promise<unknown[]>>()
      .mockResolvedValue([{ id: 'r1' }])
    const prisma = {
      alertRule: { findMany: findManyMock, create: jest.fn(), update: jest.fn() },
    } as unknown as PrismaService
    const audit = { record: jest.fn() } as unknown as AuditService
    const controller = new AlertsRulesController(prisma, audit)

    const result = await controller.list()

    expect(result).toEqual([{ id: 'r1' }])
    expect(findManyMock).toHaveBeenCalledWith({ orderBy: { createdAt: 'desc' } })
  })
})

describe('AlertsRulesController.create', () => {
  let createMock: MockFn
  let recordMock: MockFn
  let prisma: PrismaService
  let audit: AuditService
  let controller: AlertsRulesController

  beforeEach(() => {
    createMock = jest.fn<() => Promise<unknown>>().mockResolvedValue({ id: 'rule-new' })
    recordMock = jest.fn<() => Promise<void>>().mockResolvedValue()
    prisma = {
      alertRule: { create: createMock, findMany: jest.fn(), update: jest.fn() },
    } as unknown as PrismaService
    audit = { record: recordMock } as unknown as AuditService
    controller = new AlertsRulesController(prisma, audit)
  })

  it('forbids viewers from creating a rule', async () => {
    /**
     * Rule creation is operator+; a `viewer` must be rejected with a
     * `ForbiddenException` and nothing is written or audited.
     */
    await expect(controller.create({ 'x-role': 'viewer' }, createBody)).rejects.toBeInstanceOf(
      ForbiddenException,
    )
    expect(createMock).not.toHaveBeenCalled()
    expect(recordMock).not.toHaveBeenCalled()
  })

  it('creates a rule and records an audit event with tenantId for an operator', async () => {
    /**
     * An operator with `x-tenant-id` must persist the rule and write an audit
     * record carrying the `tenantId` (the populated-spread branch).
     */
    const result = await controller.create(
      { 'x-role': 'operator', 'x-tenant-id': 'acme', 'x-actor': 'alice' },
      createBody,
    )

    expect(result).toEqual({ id: 'rule-new' })
    expect(createMock).toHaveBeenCalledWith({ data: createBody })
    expect(recordMock).toHaveBeenCalledWith({
      actor: 'alice',
      action: 'rule.created',
      target: 'AlertRule:rule-new',
      tenantId: 'acme',
    })
  })

  it('omits tenantId from the audit record when none is supplied', async () => {
    /**
     * An admin without `x-tenant-id` must still create the rule, but the audit
     * record must NOT carry a `tenantId` key (the empty-spread branch).
     */
    await controller.create({ 'x-role': 'admin', 'x-actor': 'root' }, createBody)

    expect(recordMock).toHaveBeenCalledWith({
      actor: 'root',
      action: 'rule.created',
      target: 'AlertRule:rule-new',
    })
  })
})

describe('AlertsRulesController.update', () => {
  let updateMock: MockFn
  let recordMock: MockFn
  let prisma: PrismaService
  let audit: AuditService
  let controller: AlertsRulesController

  beforeEach(() => {
    updateMock = jest.fn<() => Promise<unknown>>().mockResolvedValue({ id: 'rule-1' })
    recordMock = jest.fn<() => Promise<void>>().mockResolvedValue()
    prisma = {
      alertRule: { update: updateMock, findMany: jest.fn(), create: jest.fn() },
    } as unknown as PrismaService
    audit = { record: recordMock } as unknown as AuditService
    controller = new AlertsRulesController(prisma, audit)
  })

  it('forbids viewers from updating a rule', async () => {
    /**
     * Rule updates are operator+; a `viewer` must be rejected with a
     * `ForbiddenException` and nothing is written or audited.
     */
    await expect(
      controller.update('rule-1', { 'x-role': 'viewer' }, { name: 'renamed' }),
    ).rejects.toBeInstanceOf(ForbiddenException)
    expect(updateMock).not.toHaveBeenCalled()
    expect(recordMock).not.toHaveBeenCalled()
  })

  it('strips undefined fields and records the update with tenantId for an operator', async () => {
    /**
     * The partial body may carry `undefined` values; those must be filtered out
     * of the Prisma `data` payload, and the audit record must include the
     * `tenantId` (the populated-spread branch).
     */
    const result = await controller.update(
      'rule-1',
      { 'x-role': 'operator', 'x-tenant-id': 'acme', 'x-actor': 'alice' },
      { name: 'renamed', threshold: undefined, isEnabled: false },
    )

    expect(result).toEqual({ id: 'rule-1' })
    expect(updateMock).toHaveBeenCalledWith({
      where: { id: 'rule-1' },
      data: { name: 'renamed', isEnabled: false },
    })
    expect(recordMock).toHaveBeenCalledWith({
      actor: 'alice',
      action: 'rule.updated',
      target: 'AlertRule:rule-1',
      tenantId: 'acme',
    })
  })

  it('omits tenantId from the audit record when none is supplied', async () => {
    /**
     * An admin without `x-tenant-id` must still apply the update, but the audit
     * record must NOT carry a `tenantId` key (the empty-spread branch).
     */
    await controller.update('rule-1', { 'x-role': 'admin', 'x-actor': 'root' }, { name: 'renamed' })

    expect(recordMock).toHaveBeenCalledWith({
      actor: 'root',
      action: 'rule.updated',
      target: 'AlertRule:rule-1',
    })
  })
})
