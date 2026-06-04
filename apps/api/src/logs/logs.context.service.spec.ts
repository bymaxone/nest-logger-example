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
