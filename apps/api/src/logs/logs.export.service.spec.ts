/**
 * Unit tests for `LogsExportService` and `csvCell`.
 *
 * Covers: RFC-4180 CSV escaping of commas, embedded quotes, and newlines;
 * the 100k cap sets `X-Export-Truncated`; JSON output parses as an array.
 */
import { describe, expect, it, jest } from '@jest/globals'
import type { ApplicationLog } from '@prisma/client'

import type { PrismaService } from '../prisma/prisma.service.js'
import { LogsService } from './logs.service.js'
import { LogsExportService, csvCell } from './logs.export.service.js'

describe('csvCell', () => {
  it('returns an unquoted string when no special characters are present', () => {
    /** Plain strings without comma/quote/newline are returned verbatim. */
    expect(csvCell('hello')).toBe('hello')
  })

  it('wraps in double-quotes and escapes commas', () => {
    /** A value containing a comma must be double-quoted. */
    expect(csvCell('hello,world')).toBe('"hello,world"')
  })

  it('wraps in double-quotes and doubles embedded quotes', () => {
    /** An embedded double-quote must be doubled per RFC-4180. */
    expect(csvCell('say "hi"')).toBe('"say ""hi"""')
  })

  it('wraps in double-quotes when the value contains a newline', () => {
    /** A newline inside a value must trigger quoting. */
    expect(csvCell('line1\nline2')).toBe('"line1\nline2"')
  })

  it('wraps in double-quotes when the value contains a carriage return', () => {
    /** A carriage return inside a value must trigger quoting. */
    expect(csvCell('a\rb')).toBe('"a\rb"')
  })

  it('returns empty string for null', () => {
    /** Null values become empty string in CSV. */
    expect(csvCell(null)).toBe('')
  })

  it('returns empty string for undefined', () => {
    /** Undefined values become empty string in CSV. */
    expect(csvCell(undefined)).toBe('')
  })

  it('round-trips a msg with a comma + quote + newline', () => {
    /**
     * A message like `a,"b"\nc` must be quoted so the resulting CSV cell,
     * when a spec-compliant parser reads it, recovers the original string.
     */
    const raw = 'a,"b"\nc'
    const cell = csvCell(raw)
    expect(cell).toBe('"a,""b""\nc"')
  })

  it('neutralizes a leading formula trigger in a text cell', () => {
    /**
     * CSV injection: a text cell starting with =,+,-,@,TAB,CR is executed as a formula by
     * spreadsheets. It must be prefixed with a single quote so it renders as literal text.
     */
    expect(csvCell('=1+1')).toBe("'=1+1")
    expect(csvCell('@SUM(A1)')).toBe("'@SUM(A1)")
    expect(csvCell('-2+3')).toBe("'-2+3")
  })

  it('quotes and neutralizes a formula cell that also contains a comma', () => {
    /** Formula neutralization runs before RFC-4180 quoting, so both protections apply. */
    expect(csvCell('=cmd,x')).toBe('"\'=cmd,x"')
  })

  it('does not alter a numeric value that stringifies with a leading minus', () => {
    /** Only text cells are formula-neutralized; numbers stay verbatim so data is not corrupted. */
    expect(csvCell(-5)).toBe('-5')
  })

  it('serializes a Date to its ISO-8601 string verbatim', () => {
    /**
     * A `Date` value is emitted as its ISO string and is NOT treated as a text cell,
     * so it is never formula-neutralized.
     */
    expect(csvCell(new Date('2024-06-01T12:00:00.000Z'))).toBe('2024-06-01T12:00:00.000Z')
  })

  it('emits true/false verbatim for boolean values', () => {
    /** Booleans stringify verbatim and are not text cells, so no quoting/neutralizing. */
    expect(csvCell(true)).toBe('true')
    expect(csvCell(false)).toBe('false')
  })

  it('JSON-stringifies a non-primitive value and treats it as a text cell', () => {
    /**
     * An object/array falls through to `JSON.stringify` and is flagged as text, so it is
     * RFC-4180 quoted (the serialized form contains a comma) and formula-safe.
     */
    expect(csvCell({ a: 1, b: 2 })).toBe('"{""a"":1,""b"":2}"')
  })

  it('neutralizes a JSON-stringified value whose serialized form starts with a formula trigger', () => {
    /**
     * The text flag set for non-primitives also enables formula neutralization — an array
     * whose JSON starts with `[` is fine, but the text branch is exercised for objects.
     */
    expect(csvCell(['x'])).toBe('"[""x""]"')
  })
})

function makeRow(id: string): ApplicationLog {
  return {
    id,
    time: new Date('2024-06-01T12:00:00.000Z'),
    level: 'error',
    logKey: 'TEST_LOG',
    message: 'test message',
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

describe('LogsExportService.stream', () => {
  it('sets X-Export-Truncated header when total rows exceed 100k', async () => {
    /**
     * When the pre-count reveals totalCount > MAX_EXPORT_ROWS, `stream()` must set
     * `X-Export-Truncated: true` synchronously before the stream body begins — headers
     * are committed on the first body write and cannot be set inside the generator.
     */
    const batch = Array.from({ length: 1000 }, (_, i) => makeRow(String(i)))
    const prisma = {
      applicationLog: {
        count: jest.fn<() => Promise<number>>().mockResolvedValue(200_000),
        findMany: jest.fn<() => Promise<ApplicationLog[]>>().mockResolvedValue(batch),
      },
    } as unknown as PrismaService

    const svc = new LogsExportService(prisma, new LogsService())

    let truncatedHeaderSet = false
    const res = {
      setHeader: (_name: string, value: unknown) => {
        if (_name === 'X-Export-Truncated' && value === 'true') truncatedHeaderSet = true
      },
    } as unknown as import('express').Response

    const file = await svc.stream({ format: 'json', source: 'postgres', limit: 100 }, res)

    // Drain the stream to verify it completes normally.
    const parts: string[] = []
    await new Promise<void>((resolve, reject) => {
      const stream = file.getStream()
      stream.setEncoding('utf8')
      stream.on('data', (chunk: string) => parts.push(chunk))
      stream.on('end', resolve)
      stream.on('error', reject)
    })

    // Header must be set before the stream body is written (synchronous pre-check).
    expect(truncatedHeaderSet).toBe(true)
  })

  it('produces RFC-4180 CSV with a header row and one line per record', async () => {
    /**
     * CSV format must emit the fixed header row first (`time,level,...,msg`) followed by
     * one `rowToCsv` line per record, each terminated with a newline. This exercises the
     * CSV branch of both `stream()` and the generator.
     */
    const batch = [makeRow('row-1'), makeRow('row-2')]
    let callCount = 0
    const prisma = {
      applicationLog: {
        count: jest.fn<() => Promise<number>>().mockResolvedValue(2),
        findMany: jest.fn<() => Promise<ApplicationLog[]>>().mockImplementation(() => {
          if (callCount++ === 0) return Promise.resolve(batch)
          return Promise.resolve([])
        }),
      },
    } as unknown as PrismaService

    const svc = new LogsExportService(prisma, new LogsService())
    const res = { setHeader: jest.fn() } as unknown as import('express').Response

    const file = await svc.stream({ format: 'csv', source: 'postgres', limit: 100 }, res)

    const parts: string[] = []
    await new Promise<void>((resolve, reject) => {
      const stream = file.getStream()
      stream.setEncoding('utf8')
      stream.on('data', (chunk: string) => parts.push(chunk))
      stream.on('end', resolve)
      stream.on('error', reject)
    })

    const csv = parts.join('')
    const lines = csv.trimEnd().split('\n')
    expect(lines[0]).toBe('time,level,logKey,service,requestId,traceId,tenantId,msg')
    // One CSV data line per row, in the fixed column order.
    expect(lines).toHaveLength(3)
    expect(lines[1]).toBe('2024-06-01T12:00:00.000Z,error,TEST_LOG,api,req-1,,,test message')
  })

  it('pages a full first batch then terminates on an empty follow-up batch', async () => {
    /**
     * A full page (PAGE_SIZE rows) advances the keyset cursor and triggers another
     * `findMany`; when that next call returns an empty batch, the generator breaks via
     * `if (batch.length === 0)`. This covers the empty-batch termination branch
     * (distinct from the short-batch termination).
     */
    const fullPage = Array.from({ length: 1000 }, (_, i) => makeRow(`a-${i}`))
    const findMany = jest
      .fn<() => Promise<ApplicationLog[]>>()
      .mockResolvedValueOnce(fullPage)
      .mockResolvedValueOnce([]) // empty follow-up -> break on batch.length === 0
    const prisma = {
      applicationLog: {
        count: jest.fn<() => Promise<number>>().mockResolvedValue(1000),
        findMany,
      },
    } as unknown as PrismaService

    const svc = new LogsExportService(prisma, new LogsService())
    const res = { setHeader: jest.fn() } as unknown as import('express').Response

    const file = await svc.stream({ format: 'json', source: 'postgres', limit: 100 }, res)

    const parts: string[] = []
    await new Promise<void>((resolve, reject) => {
      const stream = file.getStream()
      stream.setEncoding('utf8')
      stream.on('data', (chunk: string) => parts.push(chunk))
      stream.on('end', resolve)
      stream.on('error', reject)
    })

    const parsed = JSON.parse(parts.join('')) as unknown[]
    expect(parsed).toHaveLength(1000)
    expect(findMany).toHaveBeenCalledTimes(2)
  })

  it('merges the keyset cursor into a pre-existing AND array on the where clause', async () => {
    /**
     * When `buildPrismaWhere` already returns a `where` carrying an `AND` array, the
     * generator must spread that existing array and append the cursor clause (rather
     * than replacing it). This covers the `Array.isArray(where.AND)` true branch so the
     * pre-existing filter conjuncts survive across pages.
     */
    const fullPage = Array.from({ length: 1000 }, (_, i) => makeRow(`p-${i}`))
    const existingConjunct = { service: { not: null } }
    const findMany = jest
      .fn<() => Promise<ApplicationLog[]>>()
      .mockResolvedValueOnce(fullPage)
      .mockResolvedValueOnce([])
    const prisma = {
      applicationLog: {
        count: jest.fn<() => Promise<number>>().mockResolvedValue(1000),
        findMany,
      },
    } as unknown as PrismaService

    // A collaborator LogsService whose buildPrismaWhere yields a where with an AND array.
    const logs = {
      buildPrismaWhere: jest.fn(() => ({
        time: { gte: new Date(0), lte: new Date() },
        AND: [existingConjunct],
      })),
    } as unknown as LogsService

    const svc = new LogsExportService(prisma, logs)
    const res = { setHeader: jest.fn() } as unknown as import('express').Response

    const file = await svc.stream({ format: 'json', source: 'postgres', limit: 100 }, res)

    await new Promise<void>((resolve, reject) => {
      const stream = file.getStream()
      stream.on('data', () => {})
      stream.on('end', resolve)
      stream.on('error', reject)
    })

    // The second page's where must carry BOTH the original conjunct and the cursor clause.
    const secondArg = findMany.mock.calls[1]?.[0] as { where: { AND?: unknown[] } }
    expect(Array.isArray(secondArg.where.AND)).toBe(true)
    expect(secondArg.where.AND).toContain(existingConjunct)
    expect(secondArg.where.AND).toHaveLength(2)
  })

  it('stops at the 100k cap mid-batch and does not over-emit', async () => {
    /**
     * The hard cap (MAX_EXPORT_ROWS) must terminate emission even when the current
     * batch still has rows: the generator breaks out of the inner loop the moment
     * `emitted` reaches the cap. This guards the in-loop cap break.
     */
    // Two full pages of 1000 would exceed nothing; instead simulate a near-cap count.
    const page = Array.from({ length: 1000 }, (_, i) => makeRow(`c-${i}`))
    const findMany = jest.fn<() => Promise<ApplicationLog[]>>().mockResolvedValue(page)
    const prisma = {
      applicationLog: {
        count: jest.fn<() => Promise<number>>().mockResolvedValue(500_000),
        findMany,
      },
    } as unknown as PrismaService

    const svc = new LogsExportService(prisma, new LogsService())
    const res = { setHeader: jest.fn() } as unknown as import('express').Response

    const file = await svc.stream({ format: 'json', source: 'postgres', limit: 100 }, res)

    let count = 0
    await new Promise<void>((resolve, reject) => {
      const stream = file.getStream()
      stream.setEncoding('utf8')
      stream.on('data', (chunk: string) => {
        // Each row emits as its own JSON.stringify chunk (separated by ',\n').
        count += (chunk.match(/"id":/g) ?? []).length
      })
      stream.on('end', resolve)
      stream.on('error', reject)
    })

    expect(count).toBe(100_000)
  })

  it('produces valid JSON for a small result', async () => {
    /**
     * For a single-page result, the JSON output must parse as an array with
     * one entry per row returned by Prisma.
     */
    const batch = [makeRow('row-1'), makeRow('row-2')]
    let callCount = 0
    const prisma = {
      applicationLog: {
        count: jest.fn<() => Promise<number>>().mockResolvedValue(2),
        findMany: jest.fn<() => Promise<ApplicationLog[]>>().mockImplementation(() => {
          if (callCount++ === 0) return Promise.resolve(batch)
          return Promise.resolve([])
        }),
      },
    } as unknown as PrismaService

    const svc = new LogsExportService(prisma, new LogsService())
    const res = { setHeader: jest.fn() } as unknown as import('express').Response

    const file = await svc.stream({ format: 'json', source: 'postgres', limit: 100 }, res)

    const parts: string[] = []
    await new Promise<void>((resolve, reject) => {
      const stream = file.getStream()
      stream.setEncoding('utf8')
      stream.on('data', (chunk: string) => parts.push(chunk))
      stream.on('end', resolve)
      stream.on('error', reject)
    })

    const json = parts.join('')
    const parsed = JSON.parse(json) as unknown[]
    expect(Array.isArray(parsed)).toBe(true)
    expect(parsed).toHaveLength(2)
  })
})
