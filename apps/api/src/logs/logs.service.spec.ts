/**
 * Unit tests for `LogsService` — dual query compiler and cursor codec.
 *
 * Covers: Prisma `where` shapes, LogQL strings, cursor round-trip, and
 * `StaleCursorError` on a malformed cursor.
 */
import { describe, expect, it, jest } from '@jest/globals'

import { LogsService, StaleCursorError } from './logs.service.js'

const svc = new LogsService()

describe('LogsService.buildPrismaWhere', () => {
  it('single level produces an equality filter', () => {
    /** A string-level maps to `where.level = "error"`. */
    const where = svc.buildPrismaWhere({ level: 'error', source: 'postgres', limit: 100 })
    expect(where.level).toBe('error')
  })

  it('level>=warn produces an IN filter with all levels at or above warn', () => {
    /** `{ gte: "warn" }` maps to `where.level = { in: ["fatal","error","warn"] }`. */
    const where = svc.buildPrismaWhere({ level: { gte: 'warn' }, source: 'postgres', limit: 100 })
    expect(where.level).toEqual({ in: expect.arrayContaining(['fatal', 'error', 'warn']) })
    const levels = (where.level as { in: string[] }).in
    expect(levels).not.toContain('info')
    expect(levels).not.toContain('debug')
    expect(levels).not.toContain('trace')
  })

  it('exact logKey produces an equality filter', () => {
    /** An exact key maps to `where.logKey = "PAYMENT_REFUND_FAILED"`. */
    const where = svc.buildPrismaWhere({
      logKey: 'PAYMENT_REFUND_FAILED',
      source: 'postgres',
      limit: 100,
    })
    expect(where.logKey).toBe('PAYMENT_REFUND_FAILED')
  })

  it('wildcard logKey produces a startsWith filter', () => {
    /** `PAYMENT_*` maps to `where.logKey = { startsWith: "PAYMENT_" }`. */
    const where = svc.buildPrismaWhere({ logKey: 'PAYMENT_*', source: 'postgres', limit: 100 })
    expect(where.logKey).toEqual({ startsWith: 'PAYMENT_' })
  })

  it('free-text q produces a case-insensitive contains filter', () => {
    /** `q` maps to `where.message = { contains: "refund", mode: "insensitive" }`. */
    const where = svc.buildPrismaWhere({ q: 'refund', source: 'postgres', limit: 100 })
    expect(where.message).toEqual({ contains: 'refund', mode: 'insensitive' })
  })

  it('restriction.tenantId overrides query tenantId', () => {
    /** The restriction wins — RBAC cannot be widened by the incoming query. */
    const where = svc.buildPrismaWhere(
      { tenantId: 'attacker', source: 'postgres', limit: 100 },
      { tenantId: 'acme' },
    )
    expect(where.tenantId).toBe('acme')
  })

  it('restriction.tenantId is applied even when query tenantId is absent', () => {
    /** A restriction without a query tenantId is still enforced. */
    const where = svc.buildPrismaWhere({ source: 'postgres', limit: 100 }, { tenantId: 'globex' })
    expect(where.tenantId).toBe('globex')
  })

  it('service, traceId and requestId map to direct equality filters', () => {
    /**
     * Each of these high-selectivity fields is copied verbatim onto the where
     * clause — guards the three conditional assignments for service/traceId/requestId.
     */
    const where = svc.buildPrismaWhere({
      service: 'api',
      traceId: 'trace-123',
      requestId: 'req-456',
      source: 'postgres',
      limit: 100,
    })
    expect(where.service).toBe('api')
    expect(where.traceId).toBe('trace-123')
    expect(where.requestId).toBe('req-456')
  })

  it('explicit from/to bounds are honoured in the time window', () => {
    /**
     * When `from`/`to` are provided they drive `where.time` instead of the
     * now-1h / now defaults — covers the non-default branch of the time window.
     */
    const where = svc.buildPrismaWhere({
      from: '2024-06-01T00:00:00.000Z',
      to: '2024-06-01T06:00:00.000Z',
      source: 'postgres',
      limit: 100,
    })
    const time = where.time as { gte: Date; lte: Date }
    expect(time.gte.toISOString()).toBe('2024-06-01T00:00:00.000Z')
    expect(time.lte.toISOString()).toBe('2024-06-01T06:00:00.000Z')
  })
})

describe('LogsService.buildLogQL', () => {
  it('produces a basic selector with the service label', () => {
    /** Without filters, the LogQL includes the service selector and pipeline. */
    const logql = svc.buildLogQL({ source: 'postgres', limit: 100 })
    expect(logql).toContain('{service="api"}')
    expect(logql).toContain('| json')
    expect(logql).toContain('| __error__=""')
  })

  it('single level produces a level equality pipeline step', () => {
    /** A string-level maps to `| level="error"`. */
    const logql = svc.buildLogQL({ level: 'error', source: 'postgres', limit: 100 })
    expect(logql).toContain('| level="error"')
  })

  it('level>=warn produces a regex pipeline step with all levels at or above warn', () => {
    /** `{ gte: "warn" }` maps to `| level=~"fatal|error|warn"`. */
    const logql = svc.buildLogQL({ level: { gte: 'warn' }, source: 'postgres', limit: 100 })
    expect(logql).toMatch(/\| level=~"[^"]*fatal[^"]*"/)
    expect(logql).toMatch(/\| level=~"[^"]*error[^"]*"/)
    expect(logql).toMatch(/\| level=~"[^"]*warn[^"]*"/)
  })

  it('wildcard logKey produces a regex pipeline step', () => {
    /** `PAYMENT_*` maps to `| logKey=~"PAYMENT_.*"`. */
    const logql = svc.buildLogQL({ logKey: 'PAYMENT_*', source: 'postgres', limit: 100 })
    expect(logql).toContain('| logKey=~"PAYMENT_.*"')
  })

  it('exact logKey produces an equality pipeline step', () => {
    /** An exact key maps to `| logKey="PAYMENT_REFUND_FAILED"`. */
    const logql = svc.buildLogQL({
      logKey: 'PAYMENT_REFUND_FAILED',
      source: 'postgres',
      limit: 100,
    })
    expect(logql).toContain('| logKey="PAYMENT_REFUND_FAILED"')
  })

  it('free-text q produces a line filter', () => {
    /** `q` maps to `|= "refund"`. */
    const logql = svc.buildLogQL({ q: 'refund', source: 'postgres', limit: 100 })
    expect(logql).toContain('|= "refund"')
  })

  it('restriction.tenantId is injected into the LogQL pipeline', () => {
    /** The restriction tenantId appears as `| tenantId="acme"`. */
    const logql = svc.buildLogQL({ source: 'postgres', limit: 100 }, { tenantId: 'acme' })
    expect(logql).toContain('| tenantId="acme"')
  })

  it('traceId and requestId produce dedicated pipeline equality steps', () => {
    /**
     * `traceId`/`requestId` each append an equality pipeline step — guards the
     * two conditional pushes at the tail of the LogQL builder.
     */
    const logql = svc.buildLogQL({
      traceId: 'trace-123',
      requestId: 'req-456',
      source: 'postgres',
      limit: 100,
    })
    expect(logql).toContain('| traceId="trace-123"')
    expect(logql).toContain('| requestId="req-456"')
  })

  it('escapes embedded quotes and backslashes in interpolated values', () => {
    /**
     * `escapeLogQL` must double backslashes and escape double-quotes so a
     * crafted value cannot break out of the selector — the injection guard.
     */
    const logql = svc.buildLogQL({
      service: 'a"b\\c',
      q: 'he said "hi"',
      source: 'postgres',
      limit: 100,
    })
    expect(logql).toContain('service="a\\"b\\\\c"')
    expect(logql).toContain('|= "he said \\"hi\\""')
  })
})

describe('LogsService cursor codec', () => {
  it('encodes and decodes a cursor round-trip', () => {
    /** `encodeCursor` then `decodeCursor` must recover the same time and id. */
    const time = new Date('2024-06-01T12:00:00.000Z')
    const id = 'clxxx123abc'
    const encoded = svc.encodeCursor({ time, id })
    const decoded = svc.decodeCursor(encoded)
    expect(decoded.time.toISOString()).toBe(time.toISOString())
    expect(decoded.id).toBe(id)
  })

  it('throws StaleCursorError for a garbage string', () => {
    /** A non-base64 string must throw `StaleCursorError`, not a raw Error. */
    expect(() => svc.decodeCursor('!!!')).toThrow(StaleCursorError)
  })

  it('throws StaleCursorError for a valid base64 but wrong JSON structure', () => {
    /** Valid base64 with an invalid JSON payload must throw `StaleCursorError`. */
    const bad = Buffer.from('{"x":1}').toString('base64url')
    expect(() => svc.decodeCursor(bad)).toThrow(StaleCursorError)
  })
})

// ─── Additional mutation-killing tests ────────────────────────────────────────

describe('LogsService — StaleCursorError identity strings', () => {
  it('StaleCursorError carries the exact default message string', () => {
    /**
     * The default parameter `'cursor is stale or malformed'` is a string literal.
     * If Stryker mutates it to '', the thrown error has an empty message and this
     * assertion fails.
     */
    const err = new StaleCursorError()
    expect(err.message).toBe('cursor is stale or malformed')
  })

  it('StaleCursorError has the exact name string StaleCursorError', () => {
    /**
     * `this.name = 'StaleCursorError'` — if mutated to '', `err.name` is empty and
     * the name-based `.rejects.toMatchObject({ name: 'StaleCursorError' })` assertions
     * in other tests (and this one) would fail.
     */
    const err = new StaleCursorError()
    expect(err.name).toBe('StaleCursorError')
  })
})

describe('LogsService — default time-window arithmetic', () => {
  it('default from is exactly 3_600_000 ms before now (1 hour = 60*60*1000)', () => {
    /**
     * `Date.now() - 60 * 60 * 1000` must equal 3_600_000 ms in the past.
     * Mutations of the arithmetic operators or numeric literals (`60` → `0`,
     * `*` → `+`, `-` → `+`) would produce a wrong window and fail this assertion.
     * Both `defaultFrom` (uses `Date.now()`) and `defaultTo` (uses `new Date()`)
     * are controlled via fake timers so both ends of the window are asserted.
     */
    const fixedNow = new Date('2024-06-01T12:00:00.000Z').getTime()
    jest.useFakeTimers()
    jest.setSystemTime(fixedNow)

    try {
      const where = svc.buildPrismaWhere({ source: 'postgres', limit: 100 })
      const time = where.time as { gte: Date; lte: Date }

      expect(time.gte.getTime()).toBe(fixedNow - 3_600_000)
      expect(time.lte.getTime()).toBe(fixedNow)
    } finally {
      jest.useRealTimers()
    }
  })
})

describe('LogsService — levelsAtOrAbove exact ordering', () => {
  it('levelsAtOrAbove info returns exactly [fatal, error, warn, info] in insertion order', () => {
    /**
     * The LEVEL_RANK keys are iterated in insertion order: fatal, error, warn, info,
     * debug, trace. `levelsAtOrAbove('info')` filters those ≥ rank 30, yielding
     * ['fatal','error','warn','info']. The LogQL output must join them with '|' in
     * that exact order. Mutations that change a level key (e.g. 'warn' → '') or the
     * separator ('|' → '') produce a wrong string and fail.
     */
    const logql = svc.buildLogQL({ level: { gte: 'info' }, source: 'postgres', limit: 100 })
    expect(logql).toContain('| level=~"fatal|error|warn|info"')
  })

  it('levelsAtOrAbove warn returns exactly [fatal, error, warn]', () => {
    /**
     * Guards the specific level strings 'fatal', 'error', 'warn' and their
     * numeric ranks in LEVEL_RANK. A mutation of 'warn' rank from 40 to 0 would
     * exclude it; a mutation of 'fatal' to '' would break the string.
     */
    const where = svc.buildPrismaWhere({
      level: { gte: 'warn' },
      source: 'postgres',
      limit: 100,
    })
    const levels = (where.level as { in: string[] }).in
    expect(levels).toEqual(expect.arrayContaining(['fatal', 'error', 'warn']))
    expect(levels).toHaveLength(3)
    // Exact set — no extra levels should be included.
    expect(levels).not.toContain('info')
    expect(levels).not.toContain('debug')
    expect(levels).not.toContain('trace')
  })

  it('buildLogQL default service name falls back to api when service is omitted', () => {
    /**
     * `q.service ?? 'api'` — the fallback string 'api' is a literal. If mutated
     * to '', the selector becomes `{service=""}` instead of `{service="api"}`.
     */
    const logql = svc.buildLogQL({ source: 'postgres', limit: 100 })
    expect(logql).toContain('{service="api"}')
  })
})

describe('LogsService.buildLogQL — pipe separator and line filter string', () => {
  it('joins levels with the pipe character | as separator in the regex', () => {
    /**
     * `levels.join('|')` — if the separator is mutated to '' or ' ', the resulting
     * LogQL `level=~"fatalerrorwarn"` would be syntactically wrong. The assertion
     * requires the EXACT separator between each level name.
     */
    const logql = svc.buildLogQL({ level: { gte: 'warn' }, source: 'postgres', limit: 100 })
    // The regex value must separate each level with exactly one '|'.
    expect(logql).toMatch(/level=~"fatal\|error\|warn"/)
  })

  it('buildLogQL output has no leading or trailing whitespace', () => {
    /**
     * The final `.trim()` call removes surrounding whitespace. If the BlockStatement
     * / MethodExpression mutation removes `.trim()`, the result would have a trailing
     * space (from the pipeline join). An exact equality to the trimmed version fails
     * if `.trim()` is absent.
     */
    const logql = svc.buildLogQL({ source: 'postgres', limit: 100 })
    expect(logql).toBe(logql.trim())
    expect(logql).not.toMatch(/^\s/)
    expect(logql).not.toMatch(/\s$/)
  })

  it('includes the line filter |= "..." when q is provided', () => {
    /**
     * The line filter ` |= "${escapeLogQL(q.q)}"` is a string literal. If mutated
     * to '' the line filter disappears from the output. Guards the template literal
     * by asserting the EXACT prefix `|= "`.
     */
    const logql = svc.buildLogQL({ q: 'some text', source: 'postgres', limit: 100 })
    expect(logql).toContain('|= "some text"')
  })

  it('line filter has a single leading space before |= separating it from the selector', () => {
    /**
     * The lineFilter template starts with a literal space: ` |= "..."`. If that space
     * is mutated (e.g. replaced with another string), the line filter is no longer
     * separated from the stream selector, producing invalid LogQL syntax such as
     * `{service="api"}Stryker was here!|= "hello"`. Asserting `' |= "hello"'` (with
     * the leading space) kills the StringLiteral mutation on the space node at L176.
     */
    const logql = svc.buildLogQL({ q: 'hello', source: 'postgres', limit: 100 })
    expect(logql).toContain(' |= "hello"')
  })

  it('selector and first pipeline step are separated by a single space when no line filter is present', () => {
    /**
     * The return template is `{...}${lineFilter} ${pipeline.join(' ')}`. The literal
     * space between `${lineFilter}` and `${pipeline}` is required. When lineFilter is
     * empty (no q), removing that space produces `{service="api"}| json ...` (selector
     * glued to the pipeline). Asserting the combined sequence `'{service="api"} | json'`
     * kills the StringLiteral mutation that removes that space.
     */
    const logql = svc.buildLogQL({ source: 'postgres', limit: 100 })
    expect(logql).toContain('{service="api"} | json')
  })

  it('consecutive pipeline items are separated by a single space', () => {
    /**
     * `pipeline.join(' ')` concatenates pipeline steps with a single space. If the
     * separator is mutated to '' the items merge (e.g. `| json| __error__=""`). The
     * assertion on the exact sequence `'| json | __error__=""'` requires the space
     * between those two always-present pipeline steps and kills the StringLiteral
     * mutation on the join separator.
     */
    const logql = svc.buildLogQL({ source: 'postgres', limit: 100 })
    expect(logql).toContain('| json | __error__=""')
  })
})
