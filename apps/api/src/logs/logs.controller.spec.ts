/**
 * Unit tests for `LogsController`.
 *
 * Covers every read endpoint: keyset list (`/logs`), `/aggregate`, `/facets`,
 * `/context`, and `/export`. Asserts that each handler resolves the RBAC
 * restriction from headers, compiles the query through the shared `LogsService`
 * codec, and delegates to the correct downstream service. Also covers the
 * cursor branches of `list()` (no cursor, valid cursor, stale cursor → 410,
 * unexpected decode error re-thrown) and the export RBAC gate (viewer → 403).
 */
import { describe, expect, it, jest, beforeEach } from '@jest/globals'
import { ForbiddenException, GoneException } from '@nestjs/common'
import type { Response } from 'express'
import type { ApplicationLog } from '@prisma/client'

import type { PrismaService } from '../prisma/prisma.service.js'
import { LogsService } from './logs.service.js'
import type { LogsAggregateService } from './logs.aggregate.service.js'
import type { LogsFacetsService } from './logs.facets.service.js'
import type { LogsContextService } from './logs.context.service.js'
import type { LogsExportService } from './logs.export.service.js'
import { LogsController } from './logs.controller.js'

/** Build a row matching the Prisma `ApplicationLog` shape for `findMany` mocks. */
function makeRow(overrides: Partial<ApplicationLog> = {}): ApplicationLog {
  return {
    id: 'row-1',
    time: new Date('2024-06-01T12:00:00Z'),
    level: 'error',
    logKey: 'PAYMENT_REFUND_FAILED',
    message: 'gateway declined',
    service: 'api',
    tenantId: 'acme',
    requestId: 'req-1',
    traceId: 'trace-1',
    ...overrides,
  } as ApplicationLog
}

/** Assemble the controller with a real `LogsService` (pure codec) plus mocked services. */
function buildController() {
  const findMany = jest.fn<(args: unknown) => Promise<ApplicationLog[]>>().mockResolvedValue([])
  const prisma = {
    applicationLog: { findMany },
  } as unknown as PrismaService

  const logsService = new LogsService()

  const aggregate = {
    query: jest.fn<() => Promise<unknown>>().mockResolvedValue([{ bucket: 't', value: 1 }]),
  } as unknown as LogsAggregateService
  const facets = {
    query: jest.fn<() => Promise<unknown>>().mockResolvedValue({ level: [] }),
  } as unknown as LogsFacetsService
  const ctx = {
    query: jest
      .fn<() => Promise<unknown>>()
      .mockResolvedValue({ before: [], match: [], after: [] }),
  } as unknown as LogsContextService
  const exporter = {
    stream: jest.fn<() => Promise<unknown>>().mockResolvedValue({ kind: 'streamable' }),
  } as unknown as LogsExportService

  const controller = new LogsController(prisma, logsService, aggregate, facets, ctx, exporter)
  return { controller, findMany, logsService, aggregate, facets, ctx, exporter }
}

describe('LogsController.list', () => {
  beforeEach(() => {
    jest.clearAllMocks()
  })

  it('returns a page with nextCursor=null and hasMore=false when no cursor and fewer rows than limit', async () => {
    /**
     * With no `cursor` param and a result set smaller than `limit`, there is no
     * next page: `hasMore` must be false and `nextCursor` must be null.
     */
    const { controller, findMany } = buildController()
    findMany.mockResolvedValue([makeRow()])

    const result = await controller.list({}, { source: 'postgres', limit: 100 })

    expect(result.hasMore).toBe(false)
    expect(result.nextCursor).toBeNull()
    expect(result.data).toHaveLength(1)
    // No cursor clause was added — the where has no AND keyset predicate.
    const passedWhere = findMany.mock.calls[0]?.[0] as unknown as { where: { AND?: unknown } }
    expect(passedWhere.where.AND).toBeUndefined()
    expect(findMany).toHaveBeenCalledTimes(1)
  })

  it('emits a nextCursor and hasMore=true when the page fills to the limit', async () => {
    /**
     * When `rows.length === limit`, there may be more pages: `hasMore` is true and
     * a `nextCursor` is encoded from the last row's `(time, id)`.
     */
    const { controller, findMany, logsService } = buildController()
    const last = makeRow({ id: 'row-2', time: new Date('2024-06-01T11:00:00Z') })
    findMany.mockResolvedValue([makeRow(), last])

    const result = await controller.list({}, { source: 'postgres', limit: 2 })

    expect(result.hasMore).toBe(true)
    expect(result.nextCursor).toBe(logsService.encodeCursor({ time: last.time, id: last.id }))
  })

  it('appends a keyset clause to an existing where.AND array when a valid cursor is supplied', async () => {
    /**
     * A valid cursor must add the tuple keyset predicate
     * `(time < cursorTime) OR (time = cursorTime AND id < cursorId)` to `where.AND`,
     * preserving any pre-existing AND entries — guarding the `Array.isArray` branch.
     */
    const { controller, findMany, logsService } = buildController()
    const cursor = logsService.encodeCursor({
      time: new Date('2024-06-01T10:00:00Z'),
      id: 'cur-id',
    })

    await controller.list({}, { source: 'postgres', limit: 100, cursor })

    const passedWhere = findMany.mock.calls[0]?.[0] as unknown as { where: { AND?: unknown[] } }
    expect(Array.isArray(passedWhere.where.AND)).toBe(true)
    expect(passedWhere.where.AND).toHaveLength(1)
    const clause = passedWhere.where.AND?.[0] as unknown as { OR: unknown[] }
    expect(clause.OR).toHaveLength(2)
  })

  it('preserves a pre-existing where.AND array when appending the cursor keyset clause', async () => {
    /**
     * When the compiled where already carries an `AND` array, the cursor keyset
     * clause must be appended rather than replacing it — covers the
     * `Array.isArray(where.AND) ? where.AND : []` true branch. The query compiler
     * is stubbed to return a where that already has an AND entry.
     */
    const { controller, findMany, logsService } = buildController()
    const preExisting = { service: 'api' }
    jest
      .spyOn(logsService, 'buildPrismaWhere')
      .mockReturnValue({ time: {}, AND: [preExisting] } as never)
    const cursor = logsService.encodeCursor({
      time: new Date('2024-06-01T10:00:00Z'),
      id: 'cur-id',
    })

    await controller.list({}, { source: 'postgres', limit: 100, cursor })

    const passedWhere = findMany.mock.calls[0]?.[0] as unknown as { where: { AND?: unknown[] } }
    expect(passedWhere.where.AND).toHaveLength(2)
    expect(passedWhere.where.AND?.[0]).toBe(preExisting)
  })

  it('maps a stale cursor to HTTP 410 GoneException', async () => {
    /**
     * A malformed/stale cursor surfaces as `StaleCursorError` from `decodeCursor`;
     * the controller must translate it to a 410 so the client restarts pagination.
     */
    const { controller } = buildController()

    await expect(
      controller.list({}, { source: 'postgres', limit: 100, cursor: '!!!not-base64!!!' }),
    ).rejects.toBeInstanceOf(GoneException)
  })

  it('re-throws a non-StaleCursorError thrown while decoding the cursor', async () => {
    /**
     * Only `StaleCursorError` maps to 410; any other error from `decodeCursor`
     * must propagate unchanged so it is not silently swallowed as a stale cursor.
     */
    const { controller, logsService } = buildController()
    const boom = new Error('unexpected decode failure')
    jest.spyOn(logsService, 'decodeCursor').mockImplementation(() => {
      throw boom
    })

    await expect(
      controller.list({}, { source: 'postgres', limit: 100, cursor: 'whatever' }),
    ).rejects.toBe(boom)
  })

  it('resolves the RBAC restriction from headers and threads tenantId into the query', async () => {
    /**
     * A non-admin caller with `x-tenant-id` must have that tenant ANDed into the
     * compiled where clause so cross-tenant rows cannot leak — RBAC is enforced
     * in the query layer, not by trusting the query params.
     */
    const { controller, findMany } = buildController()

    await controller.list(
      { 'x-role': 'operator', 'x-tenant-id': 'acme' },
      { source: 'postgres', limit: 100 },
    )

    const passedWhere = findMany.mock.calls[0]?.[0] as unknown as { where: { tenantId?: string } }
    expect(passedWhere.where.tenantId).toBe('acme')
  })
})

describe('LogsController.aggregateLogs', () => {
  beforeEach(() => {
    jest.clearAllMocks()
  })

  it('delegates to the aggregate service merging the RBAC restriction into the query', async () => {
    /**
     * `/aggregate` must merge the resolved restriction (`tenantId`) on top of the
     * validated DTO and return the service result verbatim.
     */
    const { controller, aggregate } = buildController()

    const result = await controller.aggregateLogs(
      { 'x-role': 'operator', 'x-tenant-id': 'acme' },
      { source: 'postgres', limit: 100, metric: 'volume', bucket: 'auto' },
    )

    expect(aggregate.query).toHaveBeenCalledWith(
      expect.objectContaining({ metric: 'volume', tenantId: 'acme' }),
    )
    expect(result).toEqual([{ bucket: 't', value: 1 }])
  })
})

describe('LogsController.getFacets', () => {
  beforeEach(() => {
    jest.clearAllMocks()
  })

  it('delegates to the facets service using the restriction tenantId over the query tenantId', async () => {
    /**
     * `restriction.tenantId ?? q.tenantId` means an admin (no restriction) falls
     * back to the query's tenantId. Verify the admin path keeps the query tenantId.
     */
    const { controller, facets } = buildController()

    const result = await controller.getFacets(
      { 'x-role': 'admin' },
      { source: 'postgres', limit: 100, tenantId: 'beta', fields: ['level'] },
    )

    expect(facets.query).toHaveBeenCalledWith(expect.objectContaining({ tenantId: 'beta' }))
    expect(result).toEqual({ level: [] })
  })
})

describe('LogsController.getContext', () => {
  beforeEach(() => {
    jest.clearAllMocks()
  })

  it('delegates to the context service threading the restriction tenantId', async () => {
    /**
     * `/context` must scope to the RBAC tenant; the restriction tenantId overrides
     * any query tenantId for a non-admin caller.
     */
    const { controller, ctx } = buildController()

    const result = await controller.getContext(
      { 'x-role': 'operator', 'x-tenant-id': 'acme' },
      { source: 'postgres', limit: 100, requestId: 'req-1', before: 10, after: 10, tenantId: 'x' },
    )

    expect(ctx.query).toHaveBeenCalledWith(expect.objectContaining({ tenantId: 'acme' }))
    expect(result).toEqual({ before: [], match: [], after: [] })
  })

  it('falls back to the query tenantId for an admin caller (no restriction)', async () => {
    /**
     * An admin has no tenant restriction, so `restriction.tenantId ?? q.tenantId`
     * must resolve to the query's tenantId — covers the right side of the `??`.
     */
    const { controller, ctx } = buildController()

    await controller.getContext(
      { 'x-role': 'admin' },
      {
        source: 'postgres',
        limit: 100,
        traceId: 'trace-1',
        before: 10,
        after: 10,
        tenantId: 'beta',
      },
    )

    expect(ctx.query).toHaveBeenCalledWith(expect.objectContaining({ tenantId: 'beta' }))
  })
})

describe('LogsController.exportLogs', () => {
  beforeEach(() => {
    jest.clearAllMocks()
  })

  it('streams the export for an operator and threads the restriction tenantId', async () => {
    /**
     * Operators may export. The handler must delegate to `exporter.stream` with the
     * RBAC tenant merged in and the Express response object for streaming.
     */
    const { controller, exporter } = buildController()
    const res = {} as Response

    const result = await controller.exportLogs(
      { 'x-role': 'operator', 'x-tenant-id': 'acme' },
      { source: 'postgres', limit: 100, format: 'json' },
      res,
    )

    expect(exporter.stream).toHaveBeenCalledWith(
      expect.objectContaining({ tenantId: 'acme', format: 'json' }),
      res,
    )
    expect(result).toEqual({ kind: 'streamable' })
  })

  it('streams the export for an admin using the query tenantId (no restriction)', async () => {
    /**
     * Admins may export and have no tenant restriction, so the export query keeps
     * the caller-supplied `q.tenantId` — covers the right side of
     * `restriction.tenantId ?? q.tenantId` in the export handler.
     */
    const { controller, exporter } = buildController()
    const res = {} as Response

    await controller.exportLogs(
      { 'x-role': 'admin' },
      { source: 'postgres', limit: 100, format: 'csv', tenantId: 'beta' },
      res,
    )

    expect(exporter.stream).toHaveBeenCalledWith(
      expect.objectContaining({ tenantId: 'beta', format: 'csv' }),
      res,
    )
  })

  it('rejects a viewer with HTTP 403 ForbiddenException before touching the exporter', async () => {
    /**
     * Viewers are read-only — export must be denied with 403 and the export
     * service must never be invoked for them.
     */
    const { controller, exporter } = buildController()
    const res = {} as Response

    await expect(
      controller.exportLogs(
        { 'x-role': 'viewer', 'x-tenant-id': 'acme' },
        { source: 'postgres', limit: 100, format: 'json' },
        res,
      ),
    ).rejects.toBeInstanceOf(ForbiddenException)
    expect(exporter.stream).not.toHaveBeenCalled()
  })
})
