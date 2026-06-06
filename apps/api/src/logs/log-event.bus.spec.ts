/**
 * Unit tests for `LogEventBus` and the `matches()` helper.
 *
 * Covers: `publish()` parsing and synthetic-cursor emission across every branch
 * (malformed line swallowed, `LOGGER_DESTINATION*` meta-log skipped, missing /
 * invalid timestamp fallback, `service` as object / string / env default, the
 * `messageFromParsed` coercion variants, and the level/key/id field fallbacks);
 * `replaySince()` (EMPTY on empty string, replay of matching rows, filtering of
 * non-matching rows, the `from$` happy path); `emit()` fan-out; `toEvent()`; and
 * the `matches()` predicate branches not exercised by the SSE controller spec.
 */
import { describe, expect, it, jest, beforeEach } from '@jest/globals'
import { firstValueFrom, toArray } from 'rxjs'
import type { ApplicationLog } from '@prisma/client'

import type { PrismaService } from '../prisma/prisma.service.js'
import { LogsService } from './logs.service.js'
import { LogEventBus, matches, type BusLogEntry, type SseMessageEvent } from './log-event.bus.js'

/** Build a bus over a real (pure) `LogsService` and a controllable Prisma mock. */
function buildBus(rows: ApplicationLog[] = []) {
  const findMany = jest.fn<(args: unknown) => Promise<ApplicationLog[]>>().mockResolvedValue(rows)
  const prisma = {
    applicationLog: { findMany },
  } as unknown as PrismaService
  const logs = new LogsService()
  const bus = new LogEventBus(logs, prisma)
  return { bus, logs, findMany }
}

/** Build a DB row matching the Prisma `ApplicationLog` shape used by `fetchSince`. */
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

/** Build a `BusLogEntry` for `matches()` predicate tests. */
function makeEntry(overrides: Partial<BusLogEntry> = {}): BusLogEntry {
  return {
    id: 'row-1',
    time: new Date('2024-06-01T12:00:00Z'),
    level: 'info',
    logKey: 'ORDER_CREATE_SUCCESS',
    message: 'order created',
    service: 'api',
    tenantId: 'acme',
    requestId: 'req-1',
    traceId: 'trace-1',
    cursor: 'c',
    ...overrides,
  }
}

describe('LogEventBus.emit', () => {
  it('fans the entry out to listeners on the internal emitter', () => {
    /**
     * `emit()` must broadcast the entry on the `'log'` event so `fromEvent()` in
     * the SSE controller receives live lines.
     */
    const { bus } = buildBus()
    const received: BusLogEntry[] = []
    bus.emitter.on('log', (e) => received.push(e as BusLogEntry))

    const entry = makeEntry()
    bus.emit(entry)

    expect(received).toEqual([entry])
  })
})

describe('LogEventBus.publish', () => {
  beforeEach(() => {
    jest.clearAllMocks()
  })

  it('parses a well-formed JSON line and emits a BusLogEntry with a synthetic live cursor', () => {
    /**
     * The happy path: a redacted JSON line is parsed, the `service` object is
     * projected to its `name`, and a `live-<ms>-<seq>` cursor is synthesized and
     * encoded so a fresh live-tail client sees the entry immediately.
     */
    const { bus, logs } = buildBus()
    const emitted: BusLogEntry[] = []
    bus.emitter.on('log', (e) => emitted.push(e as BusLogEntry))

    const line = JSON.stringify({
      time: '2024-06-01T12:00:00.000Z',
      level: 'error',
      logKey: 'PAYMENT_REFUND_FAILED',
      message: 'gateway declined',
      service: { name: 'billing', version: '1.0.0' },
      tenantId: 'acme',
      requestId: 'req-9',
      traceId: 'trace-9',
      status: 502,
    })
    bus.publish(line)

    expect(emitted).toHaveLength(1)
    const entry = emitted[0]
    expect(entry.service).toBe('billing')
    expect(entry.level).toBe('error')
    expect(entry.logKey).toBe('PAYMENT_REFUND_FAILED')
    expect(entry.message).toBe('gateway declined')
    expect(entry.tenantId).toBe('acme')
    expect(entry.requestId).toBe('req-9')
    expect(entry.traceId).toBe('trace-9')
    // Raw fields are preserved for the detail drawer.
    expect(entry.status).toBe(502)
    // The cursor decodes to the same synthetic id the entry carries.
    const decoded = logs.decodeCursor(entry.cursor)
    expect(decoded.id).toBe(entry.id)
    expect(entry.id.startsWith('live-')).toBe(true)
  })

  it('swallows a malformed (non-JSON) line without throwing or emitting', () => {
    /**
     * `publish` runs inside the logger write path — a parse failure must be
     * swallowed (never re-throw) to avoid a destination-failure feedback loop.
     */
    const { bus } = buildBus()
    const emitted: BusLogEntry[] = []
    bus.emitter.on('log', (e) => emitted.push(e as BusLogEntry))

    expect(() => bus.publish('not-json{')).not.toThrow()
    expect(emitted).toHaveLength(0)
  })

  it('skips the library destination-failure meta-log to avoid a feedback loop', () => {
    /**
     * A `LOGGER_DESTINATION*` logKey is the library's own write-failure meta-log;
     * re-broadcasting it would loop. It must be dropped (no emit).
     */
    const { bus } = buildBus()
    const emitted: BusLogEntry[] = []
    bus.emitter.on('log', (e) => emitted.push(e as BusLogEntry))

    bus.publish(JSON.stringify({ logKey: 'LOGGER_DESTINATION_WRITE_FAILED', message: 'boom' }))

    expect(emitted).toHaveLength(0)
  })

  it('falls back to now() when the line has no time field', () => {
    /**
     * A line with no `time` must default to the current time so the entry still
     * carries a usable cursor (the `parsed.time != null` false branch).
     */
    const { bus } = buildBus()
    const emitted: BusLogEntry[] = []
    bus.emitter.on('log', (e) => emitted.push(e as BusLogEntry))

    const before = Date.now()
    bus.publish(JSON.stringify({ level: 'info', message: 'hi', service: 'api' }))
    const after = Date.now()

    expect(emitted).toHaveLength(1)
    const t = emitted[0].time.getTime()
    expect(t).toBeGreaterThanOrEqual(before)
    expect(t).toBeLessThanOrEqual(after)
  })

  it('falls back to now() when the line time is unparseable (NaN)', () => {
    /**
     * An invalid date string yields `NaN` from `getTime()`; the `isNaN` guard must
     * substitute the current time rather than emit an entry with an invalid date.
     */
    const { bus } = buildBus()
    const emitted: BusLogEntry[] = []
    bus.emitter.on('log', (e) => emitted.push(e as BusLogEntry))

    bus.publish(JSON.stringify({ time: 'totally-not-a-date', message: 'x', service: 'api' }))

    expect(emitted).toHaveLength(1)
    expect(Number.isNaN(emitted[0].time.getTime())).toBe(false)
  })

  it('keeps service when it is already a plain string', () => {
    /**
     * When the library emits `service` as a string (not the `{ name }` object),
     * it must be used verbatim — covers the `typeof svc === "string"` branch.
     */
    const { bus } = buildBus()
    const emitted: BusLogEntry[] = []
    bus.emitter.on('log', (e) => emitted.push(e as BusLogEntry))

    bus.publish(JSON.stringify({ message: 'x', service: 'worker' }))

    expect(emitted[0].service).toBe('worker')
  })

  it('projects an empty service name when the service object lacks a name', () => {
    /**
     * A `service` object without a `name` must project to an empty string
     * (the `?? ''` fallback in the object branch), never `undefined`.
     */
    const { bus } = buildBus()
    const emitted: BusLogEntry[] = []
    bus.emitter.on('log', (e) => emitted.push(e as BusLogEntry))

    bus.publish(JSON.stringify({ message: 'x', service: { version: '1.0.0' } }))

    expect(emitted[0].service).toBe('')
  })

  it('uses OTEL_SERVICE_NAME when no service field is present', () => {
    /**
     * With no `service` field, the entry's service falls back to
     * `OTEL_SERVICE_NAME` — covers the env-var branch of the service resolver.
     */
    const prev = process.env.OTEL_SERVICE_NAME
    process.env.OTEL_SERVICE_NAME = 'env-service'
    try {
      const { bus } = buildBus()
      const emitted: BusLogEntry[] = []
      bus.emitter.on('log', (e) => emitted.push(e as BusLogEntry))

      bus.publish(JSON.stringify({ message: 'x' }))

      expect(emitted[0].service).toBe('env-service')
    } finally {
      if (prev === undefined) delete process.env.OTEL_SERVICE_NAME
      else process.env.OTEL_SERVICE_NAME = prev
    }
  })

  it('falls back to the default service name when neither service nor OTEL_SERVICE_NAME is set', () => {
    /**
     * Without a service field and without `OTEL_SERVICE_NAME`, the final literal
     * default (`nest-logger-example-api`) must apply — the last `??` arm.
     */
    const prev = process.env.OTEL_SERVICE_NAME
    delete process.env.OTEL_SERVICE_NAME
    try {
      const { bus } = buildBus()
      const emitted: BusLogEntry[] = []
      bus.emitter.on('log', (e) => emitted.push(e as BusLogEntry))

      bus.publish(JSON.stringify({ message: 'x' }))

      expect(emitted[0].service).toBe('nest-logger-example-api')
    } finally {
      if (prev !== undefined) process.env.OTEL_SERVICE_NAME = prev
    }
  })

  it('applies UNKNOWN/info/null defaults when level, logKey and ids are absent or non-string', () => {
    /**
     * Non-string `level`/`logKey` and absent `tenantId`/`requestId`/`traceId` must
     * fall back to `info` / `UNKNOWN` / `null` so the entry is always well-typed.
     */
    const { bus } = buildBus()
    const emitted: BusLogEntry[] = []
    bus.emitter.on('log', (e) => emitted.push(e as BusLogEntry))

    bus.publish(JSON.stringify({ level: 42, logKey: 99, message: 'x', service: 'api' }))

    const entry = emitted[0]
    expect(entry.level).toBe('info')
    expect(entry.logKey).toBe('UNKNOWN')
    expect(entry.tenantId).toBeNull()
    expect(entry.requestId).toBeNull()
    expect(entry.traceId).toBeNull()
  })

  it('coerces a numeric message via messageFromParsed', () => {
    /**
     * A numeric `message` must be stringified (the number/boolean/bigint arm of
     * `messageFromParsed`) so free-text `q` matching has a string to scan.
     */
    const { bus } = buildBus()
    const emitted: BusLogEntry[] = []
    bus.emitter.on('log', (e) => emitted.push(e as BusLogEntry))

    bus.publish(JSON.stringify({ message: 12345, service: 'api' }))

    expect(emitted[0].message).toBe('12345')
  })

  it('uses the msg field and yields empty string when message/msg are null', () => {
    /**
     * `messageFromParsed` prefers `message` then `msg`; when both are absent the
     * result is an empty string (the `raw == null` arm), never `undefined`.
     */
    const { bus } = buildBus()
    const emitted: BusLogEntry[] = []
    bus.emitter.on('log', (e) => emitted.push(e as BusLogEntry))

    bus.publish(JSON.stringify({ msg: 'from-msg', service: 'api' }))
    bus.publish(JSON.stringify({ service: 'api' }))

    expect(emitted[0].message).toBe('from-msg')
    expect(emitted[1].message).toBe('')
  })

  it('JSON-stringifies an object message', () => {
    /**
     * A non-primitive, non-null `message` must be JSON-stringified (the object arm
     * of `messageFromParsed`).
     */
    const { bus } = buildBus()
    const emitted: BusLogEntry[] = []
    bus.emitter.on('log', (e) => emitted.push(e as BusLogEntry))

    bus.publish(JSON.stringify({ message: { nested: true }, service: 'api' }))

    expect(emitted[0].message).toBe('{"nested":true}')
  })

  it('rolls the monotonic sequence over at 1,000,000 to keep cursors unique within a millisecond', () => {
    /**
     * The synthetic cursor uses a `% 1_000_000` sequence so two live lines in the
     * same millisecond get distinct ids. After the modulus boundary the counter
     * wraps back to 0 — drive it past the boundary and assert the seq resets.
     */
    const { bus } = buildBus()
    // Reach the wrap boundary deterministically: set the private counter just below it.
    ;(bus as unknown as { seq: number }).seq = 999_999
    const emitted: BusLogEntry[] = []
    bus.emitter.on('log', (e) => emitted.push(e as BusLogEntry))

    bus.publish(JSON.stringify({ time: '2024-06-01T12:00:00.000Z', message: 'a', service: 'api' }))
    expect((bus as unknown as { seq: number }).seq).toBe(0)
    // The id carries the post-wrap sequence suffix.
    expect(emitted[0].id.endsWith('-0')).toBe(true)
  })
})

describe('LogEventBus.replaySince', () => {
  beforeEach(() => {
    jest.clearAllMocks()
  })

  it('returns EMPTY for an empty-string Last-Event-ID', async () => {
    /**
     * An empty `Last-Event-ID` is treated like "no prior position": replay is
     * skipped and the observable completes immediately.
     */
    const { bus } = buildBus()
    const out = await firstValueFrom(
      bus.replaySince('', { source: 'postgres', limit: 100 }).pipe(toArray()),
    )
    expect(out).toHaveLength(0)
  })

  it('replays DB rows newer than the cursor that match the filter, as SSE events', async () => {
    /**
     * A valid `Last-Event-ID` triggers a keyset fetch of newer rows; each matching
     * row is mapped to an SSE event whose `id` is the row's own keyset cursor.
     */
    const newer = makeRow({ id: 'row-2', time: new Date('2024-06-01T13:00:00Z') })
    const { bus, logs, findMany } = buildBus([newer])
    const lastId = logs.encodeCursor({ time: new Date('2024-06-01T12:00:00Z'), id: 'row-1' })

    const out = await firstValueFrom(
      bus.replaySince(lastId, { source: 'postgres', limit: 100 }).pipe(toArray()),
    )

    expect(findMany).toHaveBeenCalledTimes(1)
    expect(out).toHaveLength(1)
    const event = out[0] as SseMessageEvent
    expect(event.id).toBe(logs.encodeCursor({ time: newer.time, id: newer.id }))
    const data = JSON.parse(event.data) as BusLogEntry
    expect(data.id).toBe('row-2')
  })

  it('filters out replayed rows that do not match the client filter', async () => {
    /**
     * `fetchSince` re-applies `matches()` per row so the keyset query (which scopes
     * by tenant/time) plus the in-memory predicate stay consistent. A row failing
     * the filter must NOT be yielded — covers the `matches() === false` branch.
     */
    const nonMatching = makeRow({
      id: 'row-2',
      time: new Date('2024-06-01T13:00:00Z'),
      level: 'info',
    })
    const { bus, logs } = buildBus([nonMatching])
    const lastId = logs.encodeCursor({ time: new Date('2024-06-01T12:00:00Z'), id: 'row-1' })

    const out = await firstValueFrom(
      bus.replaySince(lastId, { source: 'postgres', limit: 100, level: 'error' }).pipe(toArray()),
    )

    expect(out).toHaveLength(0)
  })

  it('creates the keyset AND clause when the compiled where has none', async () => {
    /**
     * The real compiler never emits an `AND`, so `fetchSince` must seed it from an
     * empty array (`Array.isArray(where.AND)` false branch) and push the
     * strictly-newer keyset clause.
     */
    const { bus, logs, findMany } = buildBus([])
    const lastId = logs.encodeCursor({ time: new Date('2024-06-01T12:00:00Z'), id: 'row-1' })

    await firstValueFrom(
      bus.replaySince(lastId, { source: 'postgres', limit: 100 }).pipe(toArray()),
    )

    const passed = findMany.mock.calls[0]?.[0] as unknown as { where: { AND?: unknown[] } }
    expect(Array.isArray(passed.where.AND)).toBe(true)
    expect(passed.where.AND).toHaveLength(1)
  })

  it('preserves a pre-existing where.AND array when appending the keyset fromClause', async () => {
    /**
     * When the compiled where already carries an `AND` array, `fetchSince` must
     * append the strictly-newer keyset clause and keep the prior entry — covers
     * the `Array.isArray(where.AND)` true branch. The compiler is stubbed to
     * return a where that already has an AND entry.
     */
    const { bus, logs, findMany } = buildBus([])
    const preExisting = { service: 'api' }
    jest.spyOn(logs, 'buildPrismaWhere').mockReturnValue({ time: {}, AND: [preExisting] } as never)
    const lastId = logs.encodeCursor({ time: new Date('2024-06-01T12:00:00Z'), id: 'row-1' })

    await firstValueFrom(
      bus.replaySince(lastId, { source: 'postgres', limit: 100 }).pipe(toArray()),
    )

    const passed = findMany.mock.calls[0]?.[0] as unknown as { where: { AND?: unknown[] } }
    expect(passed.where.AND).toHaveLength(2)
    expect(passed.where.AND?.[0]).toBe(preExisting)
  })
})

describe('matches() — predicate branches', () => {
  it('rejects when traceId does not match', () => {
    /** A `traceId` filter must reject an entry with a different traceId. */
    expect(
      matches(makeEntry({ traceId: 'a' }), { traceId: 'b', source: 'postgres', limit: 100 }),
    ).toBe(false)
  })

  it('rejects when requestId does not match', () => {
    /** A `requestId` filter must reject an entry with a different requestId. */
    expect(
      matches(makeEntry({ requestId: 'a' }), { requestId: 'b', source: 'postgres', limit: 100 }),
    ).toBe(false)
  })

  it('rejects when tenantId does not match', () => {
    /** A `tenantId` filter must reject an entry from another tenant. */
    expect(
      matches(makeEntry({ tenantId: 'a' }), { tenantId: 'b', source: 'postgres', limit: 100 }),
    ).toBe(false)
  })

  it('rejects when an exact (non-wildcard) logKey does not match', () => {
    /** A non-wildcard `logKey` filter must require an exact match. */
    expect(
      matches(makeEntry({ logKey: 'ORDER_CREATE_SUCCESS' }), {
        logKey: 'PAYMENT_REFUND_FAILED',
        source: 'postgres',
        limit: 100,
      }),
    ).toBe(false)
  })

  it('accepts when a prefix-wildcard logKey matches', () => {
    /**
     * `PAYMENT_*` must match a `PAYMENT_REFUND_FAILED` entry — the wildcard branch
     * where `entry.logKey.startsWith(prefix)` is true and the predicate falls
     * through without rejecting (covers the wildcard match-success path).
     */
    expect(
      matches(makeEntry({ logKey: 'PAYMENT_REFUND_FAILED' }), {
        logKey: 'PAYMENT_*',
        source: 'postgres',
        limit: 100,
      }),
    ).toBe(true)
  })

  it('accepts when an exact logKey matches and a string level equals', () => {
    /**
     * Positive path for the exact-logKey and string-level branches: equal values
     * pass without falling through to the wildcard / gte arms.
     */
    expect(
      matches(makeEntry({ logKey: 'ORDER_CREATE_SUCCESS', level: 'info' }), {
        logKey: 'ORDER_CREATE_SUCCESS',
        level: 'info',
        source: 'postgres',
        limit: 100,
      }),
    ).toBe(true)
  })

  it('treats an unknown entry level as rank 0 under a gte filter', () => {
    /**
     * An entry with a level not in the RANK table falls back to rank 0, so any
     * `gte` threshold above trace rejects it — guards the `?? 0` fallback for the
     * entry's level inside the gte branch.
     */
    expect(
      matches(makeEntry({ level: 'verbose' }), {
        level: { gte: 'info' },
        source: 'postgres',
        limit: 100,
      }),
    ).toBe(false)
  })

  it('treats an unknown gte threshold as rank 0 so any entry level passes', () => {
    /**
     * A `gte` threshold not in the RANK table falls back to rank 0 (the
     * `RANK[filter.level.gte] ?? 0` right side), so even a `trace` entry — rank 10
     * — clears the zero threshold. This guards the filter-side `?? 0` fallback.
     */
    expect(
      matches(makeEntry({ level: 'trace' }), {
        level: { gte: 'bogus' } as unknown as { gte: 'info' },
        source: 'postgres',
        limit: 100,
      }),
    ).toBe(true)
  })

  it('rejects when the service filter does not match the entry service', () => {
    /**
     * A `service` filter must reject an entry from a different service — guards the
     * first short-circuit in `matches` (`filter.service !== undefined && ...`).
     */
    expect(
      matches(makeEntry({ service: 'api' }), { service: 'worker', source: 'postgres', limit: 100 }),
    ).toBe(false)
  })

  it('rejects when a free-text q filter is not contained in the entry message', () => {
    /**
     * A `q` free-text filter present whose lowercased value is NOT a substring of the
     * entry message must reject the entry — covers the true side of the
     * `filter.q !== undefined && !message.includes(q)` conjunction (the reject path).
     */
    expect(
      matches(makeEntry({ message: 'order created' }), {
        q: 'gateway',
        source: 'postgres',
        limit: 100,
      }),
    ).toBe(false)
  })

  it('accepts when a free-text q filter is contained in the entry message (case-insensitive)', () => {
    /**
     * The complementary positive path: a `q` that matches case-insensitively keeps the
     * entry — exercises the `!message.includes(q)` false side so the conjunction does
     * not reject.
     */
    expect(
      matches(makeEntry({ message: 'Order CREATED' }), {
        q: 'order',
        source: 'postgres',
        limit: 100,
      }),
    ).toBe(true)
  })

  it('rejects when a prefix-wildcard logKey does not match the entry logKey', () => {
    /**
     * A `PAYMENT_*` wildcard whose prefix is NOT a prefix of the entry's logKey must
     * reject — covers the `!entry.logKey.startsWith(prefix)` true branch (the wildcard
     * rejection path distinct from the wildcard match-success path).
     */
    expect(
      matches(makeEntry({ logKey: 'ORDER_CREATE_SUCCESS' }), {
        logKey: 'PAYMENT_*',
        source: 'postgres',
        limit: 100,
      }),
    ).toBe(false)
  })
})

describe('messageFromParsed via publish — non-serializable message', () => {
  it('yields an empty string when the message object cannot be JSON-stringified', () => {
    /**
     * `messageFromParsed` falls into its `try { JSON.stringify(raw) }` arm for a
     * non-primitive, non-null message. A BigInt nested inside that object makes the
     * native `JSON.stringify` throw a `TypeError`, so the `catch` must swallow it and
     * return an empty string — covers the catch branch of the message coercion.
     *
     * A real JSON line can never deserialize to a BigInt-bearing object, so the parsed
     * record is supplied by stubbing `JSON.parse` for a single sentinel line; the real
     * `JSON.stringify` then throws naturally on the nested BigInt (stringify is untouched).
     */
    const { bus } = buildBus()
    const emitted: BusLogEntry[] = []
    bus.emitter.on('log', (e) => emitted.push(e as BusLogEntry))

    const originalParse = JSON.parse
    const patchedParse = ((text: string): unknown => {
      if (text === '__BIGINT_MESSAGE__') {
        // `10n` is a BigInt nested in an object; JSON.stringify rejects it with a TypeError.
        return { message: { amount: 10n }, service: 'api' }
      }
      return (originalParse as (t: string) => unknown)(text)
    }) as typeof JSON.parse
    JSON.parse = patchedParse
    try {
      bus.publish('__BIGINT_MESSAGE__')
    } finally {
      JSON.parse = originalParse
    }

    expect(emitted).toHaveLength(1)
    expect(emitted[0].message).toBe('')
  })
})

describe('LogEventBus.replaySince — malformed cursor', () => {
  it('returns EMPTY when the Last-Event-ID is a malformed cursor', async () => {
    /**
     * A non-empty but undecodable `Last-Event-ID` must make `decodeCursor` throw; the
     * catch degrades gracefully to `EMPTY` (live-only, no 500) — covers the malformed
     * cursor catch branch.
     */
    const { bus } = buildBus()
    const out = await firstValueFrom(
      bus.replaySince('not-a-valid-cursor!!!', { source: 'postgres', limit: 100 }).pipe(toArray()),
    )
    expect(out).toHaveLength(0)
  })
})

describe('LogEventBus.toEvent', () => {
  it('maps a BusLogEntry to an SSE event using its cursor as the id', () => {
    /**
     * `toEvent` serializes the entry as `data` and uses the entry's own keyset cursor
     * as the SSE `id` so reconnects resume from the correct position — covers the
     * standalone mapping function.
     */
    const { bus } = buildBus()
    const entry = makeEntry({ cursor: 'cursor-xyz' })
    const event = bus.toEvent(entry)
    expect(event.id).toBe('cursor-xyz')
    expect(JSON.parse(event.data)).toMatchObject({ id: entry.id, message: entry.message })
  })
})
