/**
 * Unit tests for `PrismaLogDestination` — the durable Postgres `warn`+ log tier.
 *
 * Covers: the `minLevel` default and override; the periodic flush timer (`onInit`) and its
 * teardown plus final drain (`onShutdown`); buffering in `write()` with the batch-size early
 * flush; the serialized flush chain; the empty-buffer and all-rows-dropped no-ops; the
 * `createMany` happy path and the fail-soft `catch` that writes `LOGGER_DESTINATION_WRITE_FAILED`
 * to stderr; and every `toRow()` mapping branch — oversized guard, JSON-parse guard, the
 * `service` object→name vs bare-string vs fallback projection, the `OTEL_SERVICE_NAME` env
 * fallback, the `time` valid/NaN/missing handling, the `status`/`durationMs` field fallbacks via
 * `pickNumber` (including the non-finite/`null` guard), and the string-vs-null trace-field guards.
 */
import { describe, expect, it, jest, beforeEach, afterEach } from '@jest/globals'

import { PrismaLogDestination, type ApplicationLogClient } from './prisma-log.destination.js'

/** Build a mock client whose `createMany` is a controllable jest.fn. */
function makeClient(): {
  client: ApplicationLogClient
  createMany: jest.Mock<(args: unknown) => Promise<{ count: number }>>
} {
  const createMany = jest.fn<(args: unknown) => Promise<{ count: number }>>(async () => ({
    count: 0,
  }))
  const client = { applicationLog: { createMany } } as unknown as ApplicationLogClient
  return { client, createMany }
}

/** Serialize a single log entry the way the library pipeline would (with trailing newline). */
function line(entry: Record<string, unknown>): string {
  return `${JSON.stringify(entry)}\n`
}

describe('PrismaLogDestination', () => {
  let stderrSpy: ReturnType<typeof jest.spyOn>

  beforeEach(() => {
    stderrSpy = jest.spyOn(process.stderr, 'write').mockReturnValue(true)
  })

  afterEach(() => {
    stderrSpy.mockRestore()
    jest.useRealTimers()
    delete process.env.OTEL_SERVICE_NAME
  })

  it('defaults minLevel to warn and exposes a stable name', () => {
    /** With no options, the durable tier captures `warn`+ only; name is fixed for diagnostics. */
    const { client } = makeClient()
    const dest = new PrismaLogDestination(client)
    expect(dest.name).toBe('prisma-log')
    expect(dest.minLevel).toBe('warn')
  })

  it('honors an explicit minLevel option', () => {
    /** An explicit `minLevel` must override the `warn` default (the truthy `??` branch). */
    const { client } = makeClient()
    const dest = new PrismaLogDestination(client, { minLevel: 'error' })
    expect(dest.minLevel).toBe('error')
  })

  it('onInit schedules a periodic flush and onShutdown clears it', async () => {
    /**
     * `onInit()` installs a `setInterval`; once the buffer holds an entry, a timer tick must
     * trigger a flush (`createMany`). `onShutdown()` must `clearInterval` so no further ticks
     * fire after teardown.
     */
    jest.useFakeTimers()
    const { client, createMany } = makeClient()
    const dest = new PrismaLogDestination(client, { flushIntervalMs: 1_000, batchSize: 999 })

    dest.onInit()
    dest.write(line({ level: 'warn', logKey: 'X', msg: 'm' }))

    jest.advanceTimersByTime(1_000)
    // Let the chained flush promise settle.
    await Promise.resolve()
    await Promise.resolve()
    expect(createMany).toHaveBeenCalledTimes(1)

    await dest.onShutdown()
    createMany.mockClear()
    jest.advanceTimersByTime(5_000)
    await Promise.resolve()
    expect(createMany).not.toHaveBeenCalled()
  })

  it('uses the default 2s interval and 50-entry batch size when unspecified', async () => {
    /**
     * With no `flushIntervalMs`/`batchSize`, the destination must fall back to 2_000 ms and a
     * batch size of 50 — exercising both `?? <default>` branches. Pushing 50 entries triggers
     * an early flush via the size threshold (no timer needed).
     */
    const { client, createMany } = makeClient()
    const dest = new PrismaLogDestination(client)
    dest.onInit() // installs the default-interval timer (covers the `?? 2_000` fallback)

    for (let i = 0; i < 50; i += 1) {
      dest.write(line({ level: 'warn', logKey: 'X', msg: `m${i}` }))
    }
    await Promise.resolve()
    await Promise.resolve()
    expect(createMany).toHaveBeenCalledTimes(1)
    const arg = createMany.mock.calls[0]?.[0] as { data: unknown[]; skipDuplicates: boolean }
    expect(arg.data).toHaveLength(50)
    expect(arg.skipDuplicates).toBe(true)

    await dest.onShutdown()
  })

  it('does not flush early below the batch-size threshold', async () => {
    /**
     * `write()` only schedules an early flush at/over the batch size; a single entry under the
     * threshold must remain buffered until shutdown drains it.
     */
    const { client, createMany } = makeClient()
    const dest = new PrismaLogDestination(client, { batchSize: 5 })

    dest.write(line({ level: 'warn', logKey: 'X', msg: 'm' }))
    await Promise.resolve()
    expect(createMany).not.toHaveBeenCalled()

    await dest.onShutdown()
    expect(createMany).toHaveBeenCalledTimes(1)
  })

  it('onShutdown is a no-op for createMany when the buffer is empty', async () => {
    /**
     * The empty-buffer guard in `flush()` must short-circuit — shutting down with nothing
     * buffered (and no timer installed) must not call `createMany`.
     */
    const { client, createMany } = makeClient()
    const dest = new PrismaLogDestination(client)
    await dest.onShutdown()
    expect(createMany).not.toHaveBeenCalled()
  })

  it('drops a line below the dropped-rows guard and skips createMany when all rows are invalid', async () => {
    /**
     * When every buffered line is unmappable (here: malformed JSON), `flush()` produces an
     * empty `data` array and must NOT call `createMany` (the `data.length === 0` guard), while
     * still reporting the parse failure to stderr.
     */
    const { client, createMany } = makeClient()
    const dest = new PrismaLogDestination(client, { batchSize: 1 })

    dest.write('not-json\n')
    await Promise.resolve()
    await Promise.resolve()

    expect(createMany).not.toHaveBeenCalled()
    expect(stderrSpy).toHaveBeenCalled()
    expect(String(stderrSpy.mock.calls[0]?.[0])).toContain('LOGGER_DESTINATION_WRITE_FAILED')
    expect(String(stderrSpy.mock.calls[0]?.[0])).toContain('parse')
  })

  it('reports an oversized line to stderr and drops it', async () => {
    /**
     * A line longer than `MAX_LINE_BYTES` (131_072) must be dropped with an `oversized`
     * stderr report and never reach `createMany`.
     */
    const { client, createMany } = makeClient()
    const dest = new PrismaLogDestination(client, { batchSize: 1 })

    const huge = `${'x'.repeat(131_073)}\n`
    dest.write(huge)
    await Promise.resolve()
    await Promise.resolve()

    expect(createMany).not.toHaveBeenCalled()
    expect(String(stderrSpy.mock.calls[0]?.[0])).toContain('oversized')
  })

  it('maps a well-formed entry to an ApplicationLog row and bulk-inserts it', async () => {
    /**
     * The happy path: a complete entry with a `{ name, version }` service object, string trace
     * fields, and numeric `status`/`durationMs` must map to the expected columns, store the
     * parsed entry in `payload`, and be inserted via `createMany({ skipDuplicates: true })`.
     */
    const { client, createMany } = makeClient()
    const dest = new PrismaLogDestination(client, { batchSize: 1 })

    const entry = {
      time: '2026-06-05T00:00:00.000Z',
      level: 'error',
      logKey: 'ORDER_FAILED',
      message: 'boom',
      service: { name: 'orders-api', version: '1.2.3' },
      tenantId: 'tenant-1',
      requestId: 'req-1',
      traceId: 'trace-1',
      spanId: 'span-1',
      status: 500,
      durationMs: 42,
    }
    dest.write(line(entry))
    await Promise.resolve()
    await Promise.resolve()

    expect(createMany).toHaveBeenCalledTimes(1)
    const { data } = createMany.mock.calls[0]?.[0] as { data: Record<string, unknown>[] }
    const row = data[0]!
    expect(row.level).toBe('error')
    expect(row.logKey).toBe('ORDER_FAILED')
    expect(row.message).toBe('boom')
    expect(row.service).toBe('orders-api')
    expect(row.tenantId).toBe('tenant-1')
    expect(row.requestId).toBe('req-1')
    expect(row.traceId).toBe('trace-1')
    expect(row.spanId).toBe('span-1')
    expect(row.status).toBe(500)
    expect(row.durationMs).toBe(42)
    expect((row.time as Date).toISOString()).toBe('2026-06-05T00:00:00.000Z')
    expect(row.payload).toMatchObject({ logKey: 'ORDER_FAILED' })
  })

  it('applies column defaults and field fallbacks for a minimal entry', async () => {
    /**
     * A minimal entry exercises the `??` defaults: missing `level`→'info', missing
     * `logKey`→'UNKNOWN', `message` falling back to `msg`, a bare-string `service` kept as-is,
     * and `status`/`durationMs` taken from the `statusCode`/`duration` aliases.
     */
    const { client, createMany } = makeClient()
    const dest = new PrismaLogDestination(client, { batchSize: 1 })

    dest.write(line({ msg: 'from-msg', service: 'bare-svc', statusCode: 404, duration: 7 }))
    await Promise.resolve()
    await Promise.resolve()

    const { data } = createMany.mock.calls[0]?.[0] as { data: Record<string, unknown>[] }
    const row = data[0]!
    expect(row.level).toBe('info')
    expect(row.logKey).toBe('UNKNOWN')
    expect(row.message).toBe('from-msg')
    expect(row.service).toBe('bare-svc')
    expect(row.status).toBe(404)
    expect(row.durationMs).toBe(7)
  })

  it('defaults message to empty string when neither message nor msg is present', async () => {
    /**
     * With both `message` and `msg` absent, the `entry.message ?? entry.msg ?? ''` chain must
     * fall through to the empty-string literal — the final `??` branch of the message mapping.
     */
    const { client, createMany } = makeClient()
    const dest = new PrismaLogDestination(client, { batchSize: 1 })

    dest.write(line({ level: 'warn', logKey: 'X' }))
    await Promise.resolve()
    await Promise.resolve()

    const { data } = createMany.mock.calls[0]?.[0] as { data: Record<string, unknown>[] }
    expect(data[0]!.message).toBe('')
  })

  it('falls back to OTEL_SERVICE_NAME when the entry carries no service', async () => {
    /**
     * When `service` is absent, the mapper must fall back to `process.env.OTEL_SERVICE_NAME`
     * (the middle `??` branch) before the hard-coded default.
     */
    process.env.OTEL_SERVICE_NAME = 'env-service'
    const { client, createMany } = makeClient()
    const dest = new PrismaLogDestination(client, { batchSize: 1 })

    dest.write(line({ level: 'warn', logKey: 'X', message: 'm' }))
    await Promise.resolve()
    await Promise.resolve()

    const { data } = createMany.mock.calls[0]?.[0] as { data: Record<string, unknown>[] }
    expect(data[0]!.service).toBe('env-service')
  })

  it('falls back to the hard-coded service name when nothing else is available', async () => {
    /**
     * With no `service`, no `OTEL_SERVICE_NAME`, the final literal default
     * `nest-logger-example-api` must be used — the last `??` branch.
     */
    const { client, createMany } = makeClient()
    const dest = new PrismaLogDestination(client, { batchSize: 1 })

    dest.write(line({ level: 'warn', logKey: 'X', message: 'm', message2: undefined }))
    await Promise.resolve()
    await Promise.resolve()

    const { data } = createMany.mock.calls[0]?.[0] as { data: Record<string, unknown>[] }
    expect(data[0]!.service).toBe('nest-logger-example-api')
  })

  it('treats a null service object as absent and falls back', async () => {
    /**
     * A `service: null` value must take the `entry.service` (null) side of the object check and
     * then fall through the `??` chain to the default — the `entry.service !== null` guard
     * protects against `null.name` access.
     */
    const { client, createMany } = makeClient()
    const dest = new PrismaLogDestination(client, { batchSize: 1 })

    dest.write(line({ level: 'warn', logKey: 'X', message: 'm', service: null }))
    await Promise.resolve()
    await Promise.resolve()

    const { data } = createMany.mock.calls[0]?.[0] as { data: Record<string, unknown>[] }
    expect(data[0]!.service).toBe('nest-logger-example-api')
  })

  it('defaults the timestamp to now when time is absent', async () => {
    /**
     * With no `time` field, the mapper must default to `new Date()` (the `entry.time != null`
     * false branch) — the resulting row carries a valid Date.
     */
    const { client, createMany } = makeClient()
    const dest = new PrismaLogDestination(client, { batchSize: 1 })

    dest.write(line({ level: 'warn', logKey: 'X', message: 'm' }))
    await Promise.resolve()
    await Promise.resolve()

    const { data } = createMany.mock.calls[0]?.[0] as { data: Record<string, unknown>[] }
    expect(data[0]!.time).toBeInstanceOf(Date)
    expect(isNaN((data[0]!.time as Date).getTime())).toBe(false)
  })

  it('falls back to now when the time value is unparseable (NaN guard)', async () => {
    /**
     * A non-date `time` (here a garbage string) yields `NaN` from `Date`; the `isNaN` guard must
     * substitute a fresh valid `new Date()` to protect the BRIN index on `time`.
     */
    const { client, createMany } = makeClient()
    const dest = new PrismaLogDestination(client, { batchSize: 1 })

    dest.write(line({ level: 'warn', logKey: 'X', message: 'm', time: 'not-a-date' }))
    await Promise.resolve()
    await Promise.resolve()

    const { data } = createMany.mock.calls[0]?.[0] as { data: Record<string, unknown>[] }
    expect(data[0]!.time).toBeInstanceOf(Date)
    expect(isNaN((data[0]!.time as Date).getTime())).toBe(false)
  })

  it('nulls non-string trace fields and non-finite numbers via the guards', async () => {
    /**
     * Non-string `tenantId`/`requestId`/`traceId`/`spanId` must map to `null` (the false side of
     * each `typeof === 'string'` guard), and non-finite/absent numeric fields must map to `null`
     * via `pickNumber` (the loop falling through to its final `return null`).
     */
    const { client, createMany } = makeClient()
    const dest = new PrismaLogDestination(client, { batchSize: 1 })

    dest.write(
      line({
        level: 'warn',
        logKey: 'X',
        message: 'm',
        tenantId: 123,
        requestId: { nested: true },
        traceId: 0,
        spanId: false,
        status: 'oops',
        durationMs: NaN,
      }),
    )
    await Promise.resolve()
    await Promise.resolve()

    const { data } = createMany.mock.calls[0]?.[0] as { data: Record<string, unknown>[] }
    const row = data[0]!
    expect(row.tenantId).toBeNull()
    expect(row.requestId).toBeNull()
    expect(row.traceId).toBeNull()
    expect(row.spanId).toBeNull()
    expect(row.status).toBeNull()
    expect(row.durationMs).toBeNull()
  })

  it('fails soft to stderr when createMany rejects, never rethrowing', async () => {
    /**
     * A DB error in `createMany` must be swallowed: the `catch` writes
     * `LOGGER_DESTINATION_WRITE_FAILED` to stderr and the flush still resolves — the
     * application is never disrupted by a log-sink failure.
     */
    const { client, createMany } = makeClient()
    createMany.mockRejectedValueOnce(new Error('connection refused'))
    const dest = new PrismaLogDestination(client, { batchSize: 1 })

    dest.write(line({ level: 'warn', logKey: 'X', message: 'm' }))
    // Drain the chain explicitly via shutdown so we can await the soft failure.
    await dest.onShutdown()

    const reported = stderrSpy.mock.calls.map((c) => String(c[0]))
    expect(reported.some((s) => s.includes('LOGGER_DESTINATION_WRITE_FAILED'))).toBe(true)
  })

  it('batch size defaults to exactly 50 — 49 entries must NOT trigger an early flush', async () => {
    /**
     * Scenario: 49 synchronous writes with no explicit batchSize option.
     * Rule: the default threshold is exactly 50; pushing 49 entries must leave the
     * buffer un-flushed — kills an ArithmeticOperator mutation that changes 50→49
     * (which would trigger an early flush at entry 49).
     */
    const { client, createMany } = makeClient()
    const dest = new PrismaLogDestination(client) // batchSize defaults to 50

    for (let i = 0; i < 49; i += 1) {
      dest.write(line({ level: 'warn', logKey: 'X', msg: `m${i}` }))
    }
    await Promise.resolve()
    await Promise.resolve()

    expect(createMany).not.toHaveBeenCalled()
    await dest.onShutdown()
    // After shutdown the 49 buffered entries must be flushed.
    expect(createMany).toHaveBeenCalledTimes(1)
  })

  it('default flush interval is exactly 2_000 ms — a 1_999 ms advance must not flush', async () => {
    /**
     * Scenario: default interval (no flushIntervalMs option), fake timers, one buffered entry.
     * Rule: the periodic flush fires at 2_000 ms, NOT earlier — kills any mutation
     * that reduces the default interval (e.g. 2_000→1_000).
     */
    jest.useFakeTimers()
    const { client, createMany } = makeClient()
    const dest = new PrismaLogDestination(client, { batchSize: 999 }) // size won't trigger flush
    dest.onInit()
    dest.write(line({ level: 'warn', logKey: 'X', msg: 'm' }))

    jest.advanceTimersByTime(1_999)
    await Promise.resolve()
    await Promise.resolve()
    expect(createMany).not.toHaveBeenCalled()

    jest.advanceTimersByTime(1) // total 2_000 ms → interval fires
    await Promise.resolve()
    await Promise.resolve()
    expect(createMany).toHaveBeenCalledTimes(1)

    await dest.onShutdown()
  })

  it('accepts a line at exactly MAX_LINE_BYTES (131_072) without the oversized stderr report', async () => {
    /**
     * Scenario: a line whose byte length equals the guard boundary exactly.
     * Rule: the guard condition is `> MAX_LINE_BYTES`; a line of exactly 131_072
     * bytes must NOT trigger the oversized report — kills the mutation that changes
     * `131_072` to any smaller value (e.g. 131_071), which would reject this line
     * as oversized.  The line is invalid JSON so it falls through to the parse-error
     * path, not the oversized path.
     */
    const { client, createMany } = makeClient()
    const dest = new PrismaLogDestination(client, { batchSize: 1 })

    const exactLine = 'x'.repeat(131_072)
    dest.write(exactLine)
    await Promise.resolve()
    await Promise.resolve()

    // Should NOT be oversized (no oversized message on stderr).
    const stderrCalls = stderrSpy.mock.calls as Array<ReadonlyArray<unknown>>
    const reported = stderrCalls.map((c) => String(c[0]))
    expect(reported.some((s) => s.includes('oversized'))).toBe(false)
    // It will fail JSON parse instead (not valid JSON) — still no createMany call.
    expect(createMany).not.toHaveBeenCalled()
    expect(reported.some((s) => s.includes('parse'))).toBe(true)
  })
})
