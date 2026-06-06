/**
 * Unit tests for `ViewsController`.
 *
 * Covers `GET /views` tenant scoping across admin / scoped-non-admin /
 * sentinel-fallback paths, and `POST /views` RBAC gating: viewers are forbidden,
 * non-admins without a tenantId are forbidden, and an allowed caller persists the
 * view with its tenantId (or null for admins) and `createdBy` actor.
 */
import { describe, expect, it, jest, beforeEach } from '@jest/globals'
import { ForbiddenException } from '@nestjs/common'

import type { PrismaService } from '../prisma/prisma.service.js'
import { ViewsController } from './views.controller.js'
import { NO_TENANT_SENTINEL } from './rbac.context.js'
import type { LogQueryDto } from '../logs/dto/log-query.dto.js'

/** Typed helper for the mocked Prisma surface. */
type MockFn = ReturnType<typeof jest.fn>

/** A minimal, already-validated `LogQuery` body for create tests. */
const sampleQuery = { source: 'postgres', limit: 100 } as unknown as LogQueryDto

describe('ViewsController.list', () => {
  let findManyMock: MockFn
  let prisma: PrismaService
  let controller: ViewsController

  beforeEach(() => {
    findManyMock = jest.fn<() => Promise<unknown[]>>().mockResolvedValue([{ id: 'v1' }])
    prisma = {
      savedView: { findMany: findManyMock, create: jest.fn() },
    } as unknown as PrismaService
    controller = new ViewsController(prisma)
  })

  it('returns all views for an admin (empty where)', async () => {
    /**
     * An admin sees every tenant's saved views, so the `where` clause must be
     * empty and the rows are ordered newest-first.
     */
    const result = await controller.list({ 'x-role': 'admin' })

    expect(result).toEqual([{ id: 'v1' }])
    expect(findManyMock).toHaveBeenCalledWith({ where: {}, orderBy: { createdAt: 'desc' } })
  })

  it('scopes a non-admin with a tenantId to that tenant', async () => {
    /**
     * A scoped caller (operator/viewer) with `x-tenant-id` must only see their
     * own tenant's views.
     */
    await controller.list({ 'x-role': 'viewer', 'x-tenant-id': 'acme' })

    expect(findManyMock).toHaveBeenCalledWith({
      where: { tenantId: 'acme' },
      orderBy: { createdAt: 'desc' },
    })
  })

  it('applies the no-tenant sentinel for a non-admin without a tenantId', async () => {
    /**
     * A non-admin lacking `x-tenant-id` must fall back to `NO_TENANT_SENTINEL`
     * so the list matches zero rows rather than leaking other tenants.
     */
    await controller.list({ 'x-role': 'operator' })

    expect(findManyMock).toHaveBeenCalledWith({
      where: { tenantId: NO_TENANT_SENTINEL },
      orderBy: { createdAt: 'desc' },
    })
  })
})

describe('ViewsController.create', () => {
  let createMock: MockFn
  let prisma: PrismaService
  let controller: ViewsController

  beforeEach(() => {
    createMock = jest.fn<() => Promise<unknown>>().mockResolvedValue({ id: 'v-new' })
    prisma = {
      savedView: { create: createMock, findMany: jest.fn() },
    } as unknown as PrismaService
    controller = new ViewsController(prisma)
  })

  it('forbids viewers from creating a view', async () => {
    /**
     * Saved-view creation is operator+; a `viewer` must be rejected with a
     * `ForbiddenException` before any write.
     */
    await expect(
      controller.create(
        { 'x-role': 'viewer', 'x-tenant-id': 'acme' },
        {
          name: 'errors',
          query: sampleQuery,
        },
      ),
    ).rejects.toBeInstanceOf(ForbiddenException)
    expect(createMock).not.toHaveBeenCalled()
  })

  it('forbids a non-admin without a tenantId from creating a view', async () => {
    /**
     * A non-admin caller must supply `x-tenant-id`; without it the create is
     * rejected so a view cannot be persisted with an ambiguous tenant.
     */
    await expect(
      controller.create({ 'x-role': 'operator' }, { name: 'errors', query: sampleQuery }),
    ).rejects.toBeInstanceOf(ForbiddenException)
    expect(createMock).not.toHaveBeenCalled()
  })

  it('persists a view for a scoped operator with its tenantId and actor', async () => {
    /**
     * An operator with a tenantId must persist the view scoped to that tenant,
     * recording the actor in `createdBy`.
     */
    const result = await controller.create(
      { 'x-role': 'operator', 'x-tenant-id': 'acme', 'x-actor': 'alice' },
      { name: 'errors', query: sampleQuery },
    )

    expect(result).toEqual({ id: 'v-new' })
    expect(createMock).toHaveBeenCalledWith({
      data: {
        name: 'errors',
        query: sampleQuery,
        tenantId: 'acme',
        createdBy: 'alice',
      },
    })
  })

  it('persists a tenant-less view (null tenantId) for an admin', async () => {
    /**
     * An admin bypasses the tenant requirement; with no `x-tenant-id` the
     * stored `tenantId` must be `null` (the `?? null` fallback).
     */
    await controller.create(
      { 'x-role': 'admin', 'x-actor': 'root' },
      {
        name: 'global-view',
        query: sampleQuery,
      },
    )

    expect(createMock).toHaveBeenCalledWith({
      data: {
        name: 'global-view',
        query: sampleQuery,
        tenantId: null,
        createdBy: 'root',
      },
    })
  })
})
