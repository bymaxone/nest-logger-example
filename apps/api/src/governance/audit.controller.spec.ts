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
import { AuditController } from './audit.controller.js'
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
})
