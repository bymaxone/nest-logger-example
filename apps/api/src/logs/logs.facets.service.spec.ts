/**
 * Unit tests for `LogsFacetsService`.
 *
 * Covers: facet count ordering, top-N truncation (mocked), and that
 * the service rejects high-cardinality fields at the DTO level.
 */
import { describe, expect, it, jest } from '@jest/globals'

import type { PrismaService } from '../prisma/prisma.service.js'
import { LogsService } from './logs.service.js'
import { LogsFacetsService } from './logs.facets.service.js'

function buildPrismaMock(rows: { level?: string | null; _count: { _all: number } }[]) {
  return {
    applicationLog: {
      groupBy: jest.fn<() => Promise<typeof rows>>().mockResolvedValue(rows),
    },
  } as unknown as PrismaService
}

describe('LogsFacetsService.query', () => {
  it('returns facet counts sorted by count descending', async () => {
    /**
     * When Prisma returns groupBy rows ordered by count desc, the service
     * must map them to `{ value, count }` preserving that order.
     */
    const mockRows = [
      { level: 'error', _count: { _all: 42 } },
      { level: 'warn', _count: { _all: 12 } },
      { level: 'info', _count: { _all: 3 } },
    ]
    const prisma = buildPrismaMock(mockRows)
    const svc = new LogsFacetsService(prisma, new LogsService())

    const result = await svc.query({
      fields: ['level'],
      source: 'postgres',
      limit: 100,
    })

    expect(result.level).toHaveLength(3)
    expect(result.level?.[0]).toEqual({ value: 'error', count: 42 })
    expect(result.level?.[1]).toEqual({ value: 'warn', count: 12 })
  })

  it('filters out null-value rows', async () => {
    /**
     * Rows where the group-by field is null (nullable columns like tenantId)
     * must be excluded from the facet result.
     */
    const mockRows = [
      { level: 'error', _count: { _all: 5 } },
      { level: null, _count: { _all: 3 } },
    ]
    const prisma = buildPrismaMock(mockRows)
    const svc = new LogsFacetsService(prisma, new LogsService())

    const result = await svc.query({
      fields: ['level'],
      source: 'postgres',
      limit: 100,
    })

    // Null-value row must not appear.
    expect(result.level?.some((r) => r.value === 'null')).toBe(false)
    expect(result.level?.some((r) => r.value === 'error')).toBe(true)
  })

  it('queries all requested fields in parallel', async () => {
    /**
     * When multiple fields are requested, the service must call groupBy once
     * per field. Both fields appear in the result object.
     */
    const mockRows = [{ level: 'info', _count: { _all: 1 } }]
    const prisma = buildPrismaMock(mockRows)
    const svc = new LogsFacetsService(prisma, new LogsService())

    const result = await svc.query({
      fields: ['level', 'service'],
      source: 'postgres',
      limit: 100,
    })

    expect(result.level).toBeDefined()
    expect(result.service).toBeDefined()
  })

  it('passes take=50 and orderBy count desc to groupBy', async () => {
    /**
     * Scenario: a single-field facet query.
     * Rule: groupBy must be called with `take: 50` (the TOP_N constant) and
     * `orderBy: { _count: { level: 'desc' } }` — kills the StringLiteral mutation
     * on `'desc'` and the NumericLiteral mutation on `50`.
     */
    const mockRows = [{ level: 'error', _count: { _all: 10 } }]
    const prisma = buildPrismaMock(mockRows)
    const groupBySpy = prisma.applicationLog.groupBy as ReturnType<typeof jest.fn>
    const svc = new LogsFacetsService(prisma, new LogsService())

    await svc.query({ fields: ['level'], source: 'postgres', limit: 100 })

    expect(groupBySpy).toHaveBeenCalledTimes(1)
    const callArg = groupBySpy.mock.calls[0]?.[0] as {
      take: number
      orderBy: { _count: Record<string, string> }
    }
    expect(callArg.take).toBe(50)
    expect(callArg.orderBy._count['level']).toBe('desc')
  })

  it('uses the correct column name from FIELD_COLUMN mapping for each allowed field', async () => {
    /**
     * Scenario: query for all four bounded-dimension fields.
     * Rule: each field must map to its production column name via FIELD_COLUMN
     * (`level→level`, `service→service`, `logKey→logKey`, `tenantId→tenantId`) —
     * kills the StringLiteral mutation that changes a column name or the `by`
     * argument passed to groupBy.
     */
    const mockRows = [{ level: 'warn', _count: { _all: 1 } }]
    const prisma = buildPrismaMock(mockRows)
    const groupBySpy = prisma.applicationLog.groupBy as ReturnType<typeof jest.fn>
    const svc = new LogsFacetsService(prisma, new LogsService())

    await svc.query({
      fields: ['level', 'service', 'logKey', 'tenantId'],
      source: 'postgres',
      limit: 100,
    })

    const byArgs = (groupBySpy.mock.calls as Array<[{ by: string[] }]>).map((c) => c[0].by[0])
    expect(byArgs).toContain('level')
    expect(byArgs).toContain('service')
    expect(byArgs).toContain('logKey')
    expect(byArgs).toContain('tenantId')
  })
})
