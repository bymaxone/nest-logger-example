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

  it('neutralizes a leading + as a formula trigger in a text cell', () => {
    /**
     * + is in CSV_FORMULA_TRIGGER alongside =, -, @.  A string starting with + must
     * be prefixed with a single quote so spreadsheets do not treat it as a formula.
     * Asserts the + branch of the character class is present and not accidentally removed.
     */
    expect(csvCell('+revenue')).toBe("'+revenue")
  })

  it('neutralizes a leading TAB as a formula trigger in a text cell', () => {
    /**
     * A TAB character at the start of a cell can trigger formula evaluation in some
     * spreadsheet parsers.  The cell must be tick-prefixed so it renders as literal text.
     */
    expect(csvCell('\tcell')).toBe("'\tcell")
  })

  it('formula-neutralizes a non-primitive whose toJSON serialization starts with a formula trigger', () => {
    /**
     * In the else (JSON.stringify) branch, isText must be set to true so the
     * formula-trigger guard runs.  If isText were left false for that branch, an object
     * whose JSON.stringify output starts with - (e.g. a toJSON returning -1) would
     * bypass the injection guard and be returned without the protective tick prefix.
     */
    const withToJson = { toJSON: () => -1 } as unknown
    expect(csvCell(withToJson)).toBe("'-1")
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
      .fn<
        (args: { where?: unknown; orderBy?: unknown; take?: number }) => Promise<ApplicationLog[]>
      >()
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
    const secondArg = findMany.mock.calls[1]![0] as unknown as { where: { AND?: unknown[] } }
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

  it('does NOT set X-Export-Truncated when total count is at or below the 100k cap', async () => {
    /**
     * willTruncate must be false when totalCount <= MAX_EXPORT_ROWS.  The header must
     * be absent so consumers never display a spurious truncation warning for complete
     * result sets.  Exercises the false branch of the willTruncate conditional.
     */
    const prisma = {
      applicationLog: {
        count: jest.fn<() => Promise<number>>().mockResolvedValue(100_000),
        findMany: jest.fn<() => Promise<ApplicationLog[]>>().mockResolvedValue([]),
      },
    } as unknown as PrismaService

    const svc = new LogsExportService(prisma, new LogsService())
    let truncatedSet = false
    const res = {
      setHeader: (name: string) => {
        if (name === 'X-Export-Truncated') truncatedSet = true
      },
    } as unknown as import('express').Response

    const file = await svc.stream({ format: 'json', source: 'postgres', limit: 100 }, res)
    await new Promise<void>((resolve, reject) => {
      const stream = file.getStream()
      stream.on('data', () => {})
      stream.on('end', resolve)
      stream.on('error', reject)
    })

    expect(truncatedSet).toBe(false)
  })

  it('sets Content-Type to the exact string text/csv for csv format', async () => {
    /**
     * The CSV Content-Type literal must be exactly 'text/csv'.  If the string were
     * mutated to a different value the browser would not prompt a spreadsheet open.
     */
    const prisma = {
      applicationLog: {
        count: jest.fn<() => Promise<number>>().mockResolvedValue(0),
        findMany: jest.fn<() => Promise<ApplicationLog[]>>().mockResolvedValue([]),
      },
    } as unknown as PrismaService

    const svc = new LogsExportService(prisma, new LogsService())
    const headers: Record<string, unknown> = {}
    const res = {
      setHeader: (name: string, value: unknown) => {
        headers[name] = value
      },
    } as unknown as import('express').Response

    const file = await svc.stream({ format: 'csv', source: 'postgres', limit: 100 }, res)
    await new Promise<void>((resolve, reject) => {
      const stream = file.getStream()
      stream.on('data', () => {})
      stream.on('end', resolve)
      stream.on('error', reject)
    })

    expect(headers['Content-Type']).toBe('text/csv')
  })

  it('sets Content-Type to the exact string application/json for json format', async () => {
    /**
     * The JSON Content-Type literal must be exactly 'application/json'.  A mutation
     * to an empty string or different MIME type would break client-side parsing.
     */
    const prisma = {
      applicationLog: {
        count: jest.fn<() => Promise<number>>().mockResolvedValue(0),
        findMany: jest.fn<() => Promise<ApplicationLog[]>>().mockResolvedValue([]),
      },
    } as unknown as PrismaService

    const svc = new LogsExportService(prisma, new LogsService())
    const headers: Record<string, unknown> = {}
    const res = {
      setHeader: (name: string, value: unknown) => {
        headers[name] = value
      },
    } as unknown as import('express').Response

    const file = await svc.stream({ format: 'json', source: 'postgres', limit: 100 }, res)
    await new Promise<void>((resolve, reject) => {
      const stream = file.getStream()
      stream.on('data', () => {})
      stream.on('end', resolve)
      stream.on('error', reject)
    })

    expect(headers['Content-Type']).toBe('application/json')
  })

  it('sets Content-Disposition with a .csv extension and a dashed timestamp for csv format', async () => {
    /**
     * The filename in Content-Disposition must use the .csv extension and a timestamp
     * where colons and dots have been replaced with dashes (via /[:.]/g → '-').
     * If the regex character class or the replacement string were mutated, raw colons
     * or dots would appear in the filename, potentially breaking HTTP headers.
     */
    const prisma = {
      applicationLog: {
        count: jest.fn<() => Promise<number>>().mockResolvedValue(0),
        findMany: jest.fn<() => Promise<ApplicationLog[]>>().mockResolvedValue([]),
      },
    } as unknown as PrismaService

    const svc = new LogsExportService(prisma, new LogsService())
    const headers: Record<string, unknown> = {}
    const res = {
      setHeader: (name: string, value: unknown) => {
        headers[name] = value
      },
    } as unknown as import('express').Response

    const file = await svc.stream({ format: 'csv', source: 'postgres', limit: 100 }, res)
    await new Promise<void>((resolve, reject) => {
      const stream = file.getStream()
      stream.on('data', () => {})
      stream.on('end', resolve)
      stream.on('error', reject)
    })

    const disposition = headers['Content-Disposition'] as string
    // Must end with .csv, not .json.
    expect(disposition).toMatch(/\.csv"$/)
    // Timestamp portion (between 'logs-export-' and '.csv') must contain no raw colons or dots.
    const timestampPart = disposition
      .replace(/^attachment; filename="logs-export-/, '')
      .replace(/\.csv"$/, '')
    expect(timestampPart).not.toContain(':')
    expect(timestampPart).not.toContain('.')
  })

  it('sets Content-Disposition with a .json extension for json format', async () => {
    /**
     * The filename must use the .json extension when format is 'json'.  If the 'json'
     * string literal were mutated the extension would be wrong, breaking file-type
     * detection on download.
     */
    const prisma = {
      applicationLog: {
        count: jest.fn<() => Promise<number>>().mockResolvedValue(0),
        findMany: jest.fn<() => Promise<ApplicationLog[]>>().mockResolvedValue([]),
      },
    } as unknown as PrismaService

    const svc = new LogsExportService(prisma, new LogsService())
    const headers: Record<string, unknown> = {}
    const res = {
      setHeader: (name: string, value: unknown) => {
        headers[name] = value
      },
    } as unknown as import('express').Response

    const file = await svc.stream({ format: 'json', source: 'postgres', limit: 100 }, res)
    await new Promise<void>((resolve, reject) => {
      const stream = file.getStream()
      stream.on('data', () => {})
      stream.on('end', resolve)
      stream.on('error', reject)
    })

    const disposition = headers['Content-Disposition'] as string
    expect(disposition).toMatch(/\.json"$/)
  })

  it('passes the compiled where clause to the pre-count so the truncation signal reflects the filtered set', async () => {
    /**
     * count() must receive { where: baseWhere } — not an empty object literal.
     * If the where property were omitted, the pre-count would span all rows and
     * willTruncate could fire even when the filtered result is well below 100k.
     */
    const countMock = jest.fn<(args: unknown) => Promise<number>>().mockResolvedValue(0)
    const prisma = {
      applicationLog: {
        count: countMock,
        findMany: jest.fn<() => Promise<ApplicationLog[]>>().mockResolvedValue([]),
      },
    } as unknown as PrismaService

    const svc = new LogsExportService(prisma, new LogsService())
    const res = { setHeader: jest.fn() } as unknown as import('express').Response

    const file = await svc.stream({ format: 'json', source: 'postgres', limit: 100 }, res)
    await new Promise<void>((resolve, reject) => {
      const stream = file.getStream()
      stream.on('data', () => {})
      stream.on('end', resolve)
      stream.on('error', reject)
    })

    expect(countMock).toHaveBeenCalledWith(expect.objectContaining({ where: expect.anything() }))
  })

  it('passes take = PAGE_SIZE on the first batch, never the full MAX_EXPORT_ROWS cap', async () => {
    /**
     * The generator uses `Math.min(PAGE_SIZE, MAX_EXPORT_ROWS - emitted)` so the batch
     * request is capped at PAGE_SIZE (1,000), not MAX_EXPORT_ROWS (100,000).
     * A `Math.min → Math.max` mutation would pass 100,000 as `take` on the first call
     * (Math.max(1000, 100000 - 0) = 100000). This assertion kills that mutant.
     */
    const findMany = jest.fn<(args: unknown) => Promise<ApplicationLog[]>>().mockResolvedValue([])
    const prisma = {
      applicationLog: {
        count: jest.fn<() => Promise<number>>().mockResolvedValue(0),
        findMany,
      },
    } as unknown as PrismaService

    const svc = new LogsExportService(prisma, new LogsService())
    const res = { setHeader: jest.fn() } as unknown as import('express').Response

    const file = await svc.stream({ format: 'json', source: 'postgres', limit: 100 }, res)
    await new Promise<void>((resolve, reject) => {
      const stream = file.getStream()
      stream.on('data', () => {})
      stream.on('end', resolve)
      stream.on('error', reject)
    })

    const firstCallArgs = findMany.mock.calls[0]?.[0] as { take?: unknown }
    expect(firstCallArgs.take).toBe(1_000)
  })

  it('passes baseWhere fields to the first-page findMany, not an empty object', async () => {
    /**
     * `const where = { ...baseWhere }` must spread the pre-computed filter into `where`.
     * A `{ ...baseWhere } → {}` mutation would produce an empty where, leaking cross-tenant
     * rows. This test verifies that tenant and level constraints from baseWhere survive into
     * the first findMany call.
     */
    const findMany = jest.fn<(args: unknown) => Promise<ApplicationLog[]>>().mockResolvedValue([])
    const prisma = {
      applicationLog: {
        count: jest.fn<() => Promise<number>>().mockResolvedValue(0),
        findMany,
      },
    } as unknown as PrismaService

    const specificWhere = { tenantId: 'acme-corp', level: 'error' }
    const logs = {
      buildPrismaWhere: jest.fn(() => specificWhere),
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

    const passedWhere = findMany.mock.calls[0]?.[0] as { where: Record<string, unknown> }
    expect(passedWhere.where.tenantId).toBe('acme-corp')
    expect(passedWhere.where.level).toBe('error')
  })

  it('cursor clause in the second-page where has exact OR shape with lt comparators', async () => {
    /**
     * On the second page the generator appends `{ OR: [{ time: { lt } }, { time, id: { lt } }] }`
     * to `where.AND`. The four object literals inside that clause must have the correct shape;
     * empty `{}` mutations would lose the `lt` predicates or the `id` field, causing data to
     * repeat or skip rows. Exactly one cursor clause must appear in AND (guards the `[]` fallback
     * when no pre-existing AND exists).
     */
    const rows = Array.from({ length: 1_000 }, (_, i) => makeRow(String(i)))
    const findMany = jest
      .fn<(args: unknown) => Promise<ApplicationLog[]>>()
      .mockResolvedValueOnce(rows)
      .mockResolvedValueOnce([])
    const prisma = {
      applicationLog: {
        count: jest.fn<() => Promise<number>>().mockResolvedValue(1_000),
        findMany,
      },
    } as unknown as PrismaService

    const svc = new LogsExportService(prisma, new LogsService())
    const res = { setHeader: jest.fn() } as unknown as import('express').Response

    const file = await svc.stream({ format: 'json', source: 'postgres', limit: 100 }, res)
    await new Promise<void>((resolve, reject) => {
      const stream = file.getStream()
      stream.on('data', () => {})
      stream.on('end', resolve)
      stream.on('error', reject)
    })

    const lastRow = rows.at(-1)!
    const secondArgs = findMany.mock.calls[1]?.[0] as {
      where: { AND?: Array<{ OR: Array<Record<string, unknown>> }> }
    }
    expect(Array.isArray(secondArgs.where.AND)).toBe(true)
    // Exactly one cursor clause when baseWhere has no pre-existing AND.
    expect(secondArgs.where.AND).toHaveLength(1)
    const cursorClause = secondArgs.where.AND?.[0]
    expect(cursorClause?.OR[0]).toEqual({ time: { lt: lastRow.time } })
    expect(cursorClause?.OR[1]).toEqual({ time: lastRow.time, id: { lt: lastRow.id } })
  })

  it('export orderBy is [{ time: desc }, { id: desc }] — matches query layer sort', async () => {
    /**
     * The generator must use the same `orderBy: [{ time: 'desc' }, { id: 'desc' }]` as the
     * list handler so exported rows are in newest-first, stable keyset order. An empty array
     * or swapped sort would produce inconsistent results. Kills ArrayDeclaration and
     * ObjectLiteral mutations on the orderBy line of the generator.
     */
    const findMany = jest.fn<(args: unknown) => Promise<ApplicationLog[]>>().mockResolvedValue([])
    const prisma = {
      applicationLog: {
        count: jest.fn<() => Promise<number>>().mockResolvedValue(0),
        findMany,
      },
    } as unknown as PrismaService

    const svc = new LogsExportService(prisma, new LogsService())
    const res = { setHeader: jest.fn() } as unknown as import('express').Response

    const file = await svc.stream({ format: 'json', source: 'postgres', limit: 100 }, res)
    await new Promise<void>((resolve, reject) => {
      const stream = file.getStream()
      stream.on('data', () => {})
      stream.on('end', resolve)
      stream.on('error', reject)
    })

    const firstCallArgs = findMany.mock.calls[0]?.[0] as { orderBy?: unknown }
    expect(firstCallArgs.orderBy).toEqual([{ time: 'desc' }, { id: 'desc' }])
  })

  it('terminates after a single partial batch without issuing a follow-up findMany call', async () => {
    /**
     * When the first batch is shorter than PAGE_SIZE (1,000), the generator detects a
     * partial page via `batch.length < PAGE_SIZE` and breaks immediately — no second
     * database query should be issued. Kills the ConditionalExpression mutation that
     * replaces `batch.length < PAGE_SIZE` with `false`, which removes the short-batch
     * early-termination and causes the loop to issue an unnecessary follow-up query.
     */
    const partialBatch = Array.from({ length: 3 }, (_, i) => makeRow(`p-${i}`))
    const findMany = jest
      .fn<() => Promise<ApplicationLog[]>>()
      .mockResolvedValueOnce(partialBatch)
      .mockResolvedValue([])
    const prisma = {
      applicationLog: {
        count: jest.fn<() => Promise<number>>().mockResolvedValue(3),
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

    // A partial batch signals end-of-data; exactly one findMany call must be made.
    expect(findMany).toHaveBeenCalledTimes(1)
    const parsed = JSON.parse(parts.join('')) as unknown[]
    expect(parsed).toHaveLength(3)
  })

  it('timestamp in Content-Disposition replaces colons and dots with dashes, not removes them', async () => {
    /**
     * `new Date().toISOString().replace(/[:.]/g, '-')` turns colons and the millisecond dot
     * into dashes so the filename is HTTP-header safe. A `'-' → ''` StringLiteral mutation
     * removes those characters instead of replacing them, producing `T120000000Z` instead of
     * `T12-00-00-000Z`. The regex pattern below matches the dash-replaced form and rejects the
     * removal form.
     */
    const prisma = {
      applicationLog: {
        count: jest.fn<() => Promise<number>>().mockResolvedValue(0),
        findMany: jest.fn<() => Promise<ApplicationLog[]>>().mockResolvedValue([]),
      },
    } as unknown as PrismaService

    const svc = new LogsExportService(prisma, new LogsService())
    const headers: Record<string, unknown> = {}
    const res = {
      setHeader: (name: string, value: unknown) => {
        headers[name] = value
      },
    } as unknown as import('express').Response

    const file = await svc.stream({ format: 'json', source: 'postgres', limit: 100 }, res)
    await new Promise<void>((resolve, reject) => {
      const stream = file.getStream()
      stream.on('data', () => {})
      stream.on('end', resolve)
      stream.on('error', reject)
    })

    const disposition = headers['Content-Disposition'] as string
    // The time portion must contain dashes where colons/dots were, e.g. T12-00-00-000Z.
    expect(disposition).toMatch(/T\d{2}-\d{2}-\d{2}-\d{3}Z/)
  })
})
