/**
 * Unit tests for `AuditController`.
 *
 * Covers the read-only `GET /audit` endpoint: viewers are forbidden, admins get
 * an unfiltered tenant scope, operators are scoped to their tenant (with the
 * no-tenant sentinel fallback), and the optional `actor`/`action` filters plus
 * `limit` are wired into the Prisma `findMany` query.
 */
import { describe, expect, it, jest, beforeEach } from '@jest/globals'
import { ForbiddenException } from '@nestjs/common'

import type { PrismaService } from '../prisma/prisma.service.js'
import { AuditController, auditQuerySchema } from './audit.controller.js'
import { NO_TENANT_SENTINEL } from './rbac.context.js'

/** Typed helper for the mocked Prisma surface. */
type MockFn = ReturnType<typeof jest.fn>

/** Default, fully-parsed audit query (mirrors the schema defaults). */
const baseQuery = { limit: 50 } as { limit: number; actor?: string; action?: string }

describe('AuditController.list', () => {
  let findManyMock: MockFn
  let prisma: PrismaService
  let controller: AuditController

  beforeEach(() => {
    findManyMock = jest.fn<() => Promise<unknown[]>>().mockResolvedValue([{ id: 'a1' }])
    prisma = {
      auditEvent: { findMany: findManyMock },
    } as unknown as PrismaService
    controller = new AuditController(prisma)
  })

  it('forbids viewers from reading the audit trail', async () => {
    /**
     * The audit trail is operator+; a `viewer` role must be rejected with a
     * `ForbiddenException` before any Prisma query runs.
     */
    await expect(controller.list({ 'x-role': 'viewer' }, { ...baseQuery })).rejects.toBeInstanceOf(
      ForbiddenException,
    )
    expect(findManyMock).not.toHaveBeenCalled()
  })

  it('returns all tenants for an admin (empty tenant filter)', async () => {
    /**
     * An admin has no tenant restriction, so the `where` clause must carry no
     * `tenantId` key and the query is ordered newest-first with the limit.
     */
    const result = await controller.list({ 'x-role': 'admin' }, { ...baseQuery })

    expect(result).toEqual([{ id: 'a1' }])
    expect(findManyMock).toHaveBeenCalledWith({
      where: {},
      orderBy: { at: 'desc' },
      take: 50,
    })
  })

  it('scopes an operator to their own tenantId', async () => {
    /**
     * A non-admin caller with `x-tenant-id` must be hard-scoped to that tenant
     * so the audit trail cannot leak cross-tenant rows.
     */
    await controller.list({ 'x-role': 'operator', 'x-tenant-id': 'acme' }, { ...baseQuery })

    expect(findManyMock).toHaveBeenCalledWith({
      where: { tenantId: 'acme' },
      orderBy: { at: 'desc' },
      take: 50,
    })
  })

  it('applies the no-tenant sentinel for a non-admin without a tenantId', async () => {
    /**
     * A non-admin with no `x-tenant-id` must fall back to `NO_TENANT_SENTINEL`,
     * which matches zero rows rather than granting unrestricted access.
     */
    await controller.list({ 'x-role': 'operator' }, { ...baseQuery })

    expect(findManyMock).toHaveBeenCalledWith({
      where: { tenantId: NO_TENANT_SENTINEL },
      orderBy: { at: 'desc' },
      take: 50,
    })
  })

  it('wires the optional actor and action filters and the limit', async () => {
    /**
     * When `actor` and `action` are present they must be merged into the
     * `where` clause alongside the tenant filter, and `limit` becomes `take`.
     */
    await controller.list({ 'x-role': 'admin' }, { limit: 200, actor: 'alice', action: 'export' })

    expect(findManyMock).toHaveBeenCalledWith({
      where: { actor: 'alice', action: 'export' },
      orderBy: { at: 'desc' },
      take: 200,
    })
  })

  it('throws ForbiddenException with the exact viewer-denied message', async () => {
    /**
     * Scenario: viewer accesses the audit trail.
     * Rule: the ForbiddenException message must be exactly
     * `'Viewers cannot access the audit trail'` — kills the StringLiteral mutation.
     */
    let thrown: unknown
    try {
      await controller.list({ 'x-role': 'viewer' }, { ...baseQuery })
    } catch (e) {
      thrown = e
    }
    expect(thrown).toBeInstanceOf(ForbiddenException)
    expect((thrown as ForbiddenException).message).toBe('Viewers cannot access the audit trail')
  })

  it('applies only the actor filter when action is undefined', async () => {
    /**
     * Scenario: only actor filter provided, no action.
     * Rule: only `actor` must appear in the `where` clause — kills the MethodExpression
     * mutation that would unconditionally add `action: undefined` to the query.
     */
    await controller.list({ 'x-role': 'admin' }, { limit: 50, actor: 'bob' })

    const callArg = findManyMock.mock.calls[0]?.[0] as { where: Record<string, unknown> }
    expect(callArg.where['actor']).toBe('bob')
    expect(Object.prototype.hasOwnProperty.call(callArg.where, 'action')).toBe(false)
  })

  it('applies only the action filter when actor is undefined', async () => {
    /**
     * Scenario: only action filter provided, no actor.
     * Rule: only `action` must appear in the `where` clause — kills the MethodExpression
     * mutation that would unconditionally add `actor: undefined` to the query.
     */
    await controller.list({ 'x-role': 'admin' }, { limit: 50, action: 'rule.created' })

    const callArg = findManyMock.mock.calls[0]?.[0] as { where: Record<string, unknown> }
    expect(callArg.where['action']).toBe('rule.created')
    expect(Object.prototype.hasOwnProperty.call(callArg.where, 'actor')).toBe(false)
  })
})

describe('auditQuerySchema — limit boundary validation', () => {
  it('rejects limit 0 — kills z.coerce.number().max(1) mutant', () => {
    /**
     * Scenario: limit below the minimum.
     * Rule: `z.coerce.number().int().min(1)` must reject 0 — kills the
     * MethodExpression mutant that replaces `.min(1)` with `.max(1)`.
     */
    expect(auditQuerySchema.safeParse({ limit: 0 }).success).toBe(false)
  })

  it('accepts limit 1 — kills z.coerce.number().min(1).min(500) mutant', () => {
    /**
     * Scenario: limit at the minimum boundary.
     * Rule: `min(1)` must accept the value 1 — kills the MethodExpression mutant
     * that replaces `.max(500)` with `.min(500)`, which would reject values below 500.
     */
    expect(auditQuerySchema.safeParse({ limit: 1 }).success).toBe(true)
  })

  it('accepts limit 500 — confirms upper boundary', () => {
    /**
     * Scenario: limit at the maximum boundary.
     * Rule: `.max(500)` must accept 500 — paired with the limit-501 test, this
     * proves the boundary is exactly at 500.
     */
    expect(auditQuerySchema.safeParse({ limit: 500 }).success).toBe(true)
  })

  it('rejects limit 501 — kills z.coerce.number().min(1).min(500) mutant', () => {
    /**
     * Scenario: limit above the maximum.
     * Rule: `.max(500)` must reject 501 — kills the MethodExpression mutant that
     * changes `.max(500)` to `.min(500)`, which would accept any value ≥ 500.
     */
    expect(auditQuerySchema.safeParse({ limit: 501 }).success).toBe(false)
  })
})
