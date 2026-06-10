/**
 * Unit tests for `LogsContextService`.
 *
 * Covers: before/match/after window ordering, missing anchor (returns empty result),
 * and the one-correlation-id requirement (validated at the DTO level, tested here
 * via the schema).
 */
import { describe, expect, it, jest } from '@jest/globals'
import type { ApplicationLog } from '@prisma/client'

import type { PrismaService } from '../prisma/prisma.service.js'
import { LogsContextService } from './logs.context.service.js'
import { contextQuerySchema } from './dto/context-query.dto.js'

function makeRow(id: string, time: Date): ApplicationLog {
  return {
    id,
    time,
    level: 'info',
    logKey: 'TEST_LOG',
    message: `log ${id}`,
    service: 'api',
    tenantId: null,
    requestId: 'req-1',
    traceId: null,
    spanId: null,
    status: null,
    durationMs: null,
    payload: {},
  }
}

describe('LogsContextService.query', () => {
  it('returns before+match+after ordered chronologically', async () => {
    /**
     * The context window must return `before` in ascending order (oldest→newest)
     * so the drawer reads top→bottom. `after` is also ascending.
     */
    const anchor = makeRow('c', new Date('2024-06-01T12:00:00.000Z'))
    const older1 = makeRow('a', new Date('2024-06-01T11:58:00.000Z'))
    const older2 = makeRow('b', new Date('2024-06-01T11:59:00.000Z'))
    const newer = makeRow('d', new Date('2024-06-01T12:01:00.000Z'))

    const prisma = {
      applicationLog: {
        findFirst: jest.fn<() => Promise<ApplicationLog | null>>().mockResolvedValueOnce(anchor),
        findMany: jest
          .fn<() => Promise<ApplicationLog[]>>()
          .mockResolvedValueOnce([older2, older1]) // before (desc from DB, reversed in service)
          .mockResolvedValueOnce([newer]), // after (asc)
      },
    } as unknown as PrismaService

    const svc = new LogsContextService(prisma)
    const result = await svc.query({
      requestId: 'req-1',
      before: 2,
      after: 1,
      source: 'postgres',
      limit: 100,
    })

    expect(result.match?.id).toBe('c')
    // before is reversed to ascending order.
    expect(result.before.map((r) => r.id)).toEqual(['a', 'b'])
    expect(result.after.map((r) => r.id)).toEqual(['d'])
  })

  it('uses the keyset anchor lookup when anchorTime and anchorId are provided', async () => {
    /**
     * When the caller supplies both `anchorTime` and `anchorId`, the service must
     * resolve the anchor via the exact-match `findFirst` (with the parsed Date and
     * id) instead of the most-recent fallback — this is the keyset-windowing path.
     */
    const anchor = makeRow('c', new Date('2024-06-01T12:00:00.000Z'))
    const findFirst = jest
      .fn<(args: unknown) => Promise<ApplicationLog | null>>()
      .mockResolvedValueOnce(anchor)
    const prisma = {
      applicationLog: {
        findFirst,
        findMany: jest.fn<() => Promise<ApplicationLog[]>>().mockResolvedValue([]),
      },
    } as unknown as PrismaService

    const svc = new LogsContextService(prisma)
    const result = await svc.query({
      traceId: 'trace-1',
      anchorTime: '2024-06-01T12:00:00.000Z',
      anchorId: 'c',
      before: 0,
      after: 0,
      source: 'postgres',
      limit: 100,
    })

    expect(result.match?.id).toBe('c')
    // Exact-match anchor lookup runs once; the fallback findFirst is not invoked.
    expect(findFirst).toHaveBeenCalledTimes(1)
    const firstArg = findFirst.mock.calls[0]?.[0] as unknown as {
      where: { traceId?: string; id?: string }
    }
    expect(firstArg.where.traceId).toBe('trace-1')
    expect(firstArg.where.id).toBe('c')
  })

  it('falls back to the most-recent match when the keyset anchor is not found', async () => {
    /**
     * If `anchorTime`/`anchorId` are provided but match no row, the service must fall
     * back to the most-recent matching row (second `findFirst`) rather than returning
     * an empty result prematurely.
     */
    const fallback = makeRow('z', new Date('2024-06-01T10:00:00.000Z'))
    const findFirst = jest
      .fn<() => Promise<ApplicationLog | null>>()
      .mockResolvedValueOnce(null) // exact-match anchor miss
      .mockResolvedValueOnce(fallback) // most-recent fallback
    const prisma = {
      applicationLog: {
        findFirst,
        findMany: jest.fn<() => Promise<ApplicationLog[]>>().mockResolvedValue([]),
      },
    } as unknown as PrismaService

    const svc = new LogsContextService(prisma)
    const result = await svc.query({
      requestId: 'req-1',
      anchorTime: '2024-06-01T12:00:00.000Z',
      anchorId: 'missing',
      before: 0,
      after: 0,
      source: 'postgres',
      limit: 100,
    })

    expect(result.match?.id).toBe('z')
    expect(findFirst).toHaveBeenCalledTimes(2)
  })

  it('builds an empty correlation filter when neither id is present', async () => {
    /**
     * `correlationWhere` returns `{}` when both correlation ids are absent. The DTO
     * normally forbids this, but the service is called with already-validated DTOs;
     * driving it directly exercises the defensive empty-filter branch.
     */
    const findFirst = jest
      .fn<(args: unknown) => Promise<ApplicationLog | null>>()
      .mockResolvedValue(null)
    const prisma = {
      applicationLog: {
        findFirst,
        findMany: jest.fn<() => Promise<ApplicationLog[]>>().mockResolvedValue([]),
      },
    } as unknown as PrismaService

    const svc = new LogsContextService(prisma)
    const result = await svc.query({
      before: 0,
      after: 0,
      source: 'postgres',
      limit: 100,
    } as unknown as Parameters<LogsContextService['query']>[0])

    expect(result.match).toBeNull()
    // The fallback findFirst is called with an empty correlation `where`.
    const fallbackArg = findFirst.mock.calls[0]?.[0] as unknown as {
      where: Record<string, unknown>
    }
    expect(fallbackArg.where).toEqual({})
  })

  it('returns empty result when no anchor row is found', async () => {
    /**
     * When the correlation id matches no rows, the service returns an empty
     * `{ before: [], match: null, after: [] }` without throwing.
     */
    const prisma = {
      applicationLog: {
        findFirst: jest.fn<() => Promise<ApplicationLog | null>>().mockResolvedValue(null),
        findMany: jest.fn<() => Promise<ApplicationLog[]>>().mockResolvedValue([]),
      },
    } as unknown as PrismaService

    const svc = new LogsContextService(prisma)
    const result = await svc.query({
      requestId: 'nonexistent',
      before: 5,
      after: 5,
      source: 'postgres',
      limit: 100,
    })

    expect(result.match).toBeNull()
    expect(result.before).toHaveLength(0)
    expect(result.after).toHaveLength(0)
  })

  it('passes the exact requestId correlation where to the fallback anchor findFirst', async () => {
    /**
     * `correlationWhere` returns `{ requestId: q.requestId }` when requestId is
     * provided. Asserting the full `where` object passed to `findFirst` kills the
     * ObjectLiteral mutation that replaces the return value with `{}`, which would
     * silently drop the correlation filter.
     */
    const findFirst = jest
      .fn<(args: unknown) => Promise<ApplicationLog | null>>()
      .mockResolvedValue(null)
    const prisma = {
      applicationLog: {
        findFirst,
        findMany: jest.fn<() => Promise<ApplicationLog[]>>().mockResolvedValue([]),
      },
    } as unknown as PrismaService

    const svc = new LogsContextService(prisma)
    await svc.query({ requestId: 'req-42', before: 0, after: 0, source: 'postgres', limit: 100 })

    const args = findFirst.mock.calls[0]?.[0] as unknown as {
      where: Record<string, unknown>
      orderBy: unknown[]
    }
    expect(args.where).toEqual({ requestId: 'req-42' })
    expect(args.orderBy).toEqual([{ time: 'desc' }, { id: 'desc' }])
  })

  it('passes the exact traceId correlation where to the fallback anchor findFirst', async () => {
    /**
     * `correlationWhere` returns `{ traceId: q.traceId }` when traceId is provided.
     * Asserting the `where` object kills the ObjectLiteral mutation that replaces
     * `{ traceId: q.traceId }` with `{}`, losing the traceId scoping.
     */
    const findFirst = jest
      .fn<(args: unknown) => Promise<ApplicationLog | null>>()
      .mockResolvedValue(null)
    const prisma = {
      applicationLog: {
        findFirst,
        findMany: jest.fn<() => Promise<ApplicationLog[]>>().mockResolvedValue([]),
      },
    } as unknown as PrismaService

    const svc = new LogsContextService(prisma)
    await svc.query({ traceId: 'trace-99', before: 0, after: 0, source: 'postgres', limit: 100 })

    const args = findFirst.mock.calls[0]?.[0] as unknown as {
      where: Record<string, unknown>
    }
    expect(args.where).toEqual({ traceId: 'trace-99' })
  })

  it('passes the exact keyset lt/gt OR clause, orderBy, and take to both findMany calls', async () => {
    /**
     * Asserts the full `where`, `orderBy`, and `take` for both the before (`lt` /
     * `desc`) and after (`gt` / `asc`) Prisma queries. Kills ObjectLiteral mutations
     * on `{ lt: anchorTime }`, `{ gt: anchorId }`, etc., ArrayDeclaration mutations
     * on the OR tuple, and StringLiteral mutations on `"asc"` / `"desc"`.
     */
    const anchorTime = new Date('2024-06-01T12:00:00.000Z')
    const anchor = makeRow('c', anchorTime)

    const findMany = jest.fn<(args: unknown) => Promise<ApplicationLog[]>>().mockResolvedValue([])
    const prisma = {
      applicationLog: {
        findFirst: jest.fn<() => Promise<ApplicationLog | null>>().mockResolvedValueOnce(anchor),
        findMany,
      },
    } as unknown as PrismaService

    const svc = new LogsContextService(prisma)
    await svc.query({ requestId: 'req-1', before: 3, after: 5, source: 'postgres', limit: 100 })

    const beforeArgs = findMany.mock.calls[0]?.[0] as unknown as {
      where: Record<string, unknown>
      orderBy: unknown[]
      take: number
    }
    expect(beforeArgs.where).toEqual({
      requestId: 'req-1',
      OR: [{ time: { lt: anchorTime } }, { time: anchorTime, id: { lt: 'c' } }],
    })
    expect(beforeArgs.orderBy).toEqual([{ time: 'desc' }, { id: 'desc' }])
    expect(beforeArgs.take).toBe(3)

    const afterArgs = findMany.mock.calls[1]?.[0] as unknown as {
      where: Record<string, unknown>
      orderBy: unknown[]
      take: number
    }
    expect(afterArgs.where).toEqual({
      requestId: 'req-1',
      OR: [{ time: { gt: anchorTime } }, { time: anchorTime, id: { gt: 'c' } }],
    })
    expect(afterArgs.orderBy).toEqual([{ time: 'asc' }, { id: 'asc' }])
    expect(afterArgs.take).toBe(5)
  })
})

describe('contextQuerySchema validation', () => {
  it('rejects when neither requestId nor traceId is provided', () => {
    /**
     * The schema requires exactly one correlation id; both absent is invalid.
     */
    const result = contextQuerySchema.safeParse({ source: 'postgres', limit: 100 })
    expect(result.success).toBe(false)
  })

  it('rejects when both requestId and traceId are provided', () => {
    /**
     * Providing both correlation ids is ambiguous and must be rejected.
     */
    const result = contextQuerySchema.safeParse({
      requestId: 'r1',
      traceId: 't1',
      source: 'postgres',
      limit: 100,
    })
    expect(result.success).toBe(false)
  })

  it('accepts requestId alone', () => {
    /**
     * A query with only requestId must pass validation.
     */
    const result = contextQuerySchema.safeParse({ requestId: 'r1', source: 'postgres', limit: 100 })
    expect(result.success).toBe(true)
  })

  it('accepts traceId alone', () => {
    /**
     * A query with only traceId must pass validation.
     */
    const result = contextQuerySchema.safeParse({ traceId: 't1', source: 'postgres', limit: 100 })
    expect(result.success).toBe(true)
  })
})
