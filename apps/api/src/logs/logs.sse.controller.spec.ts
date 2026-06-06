/**
 * Unit tests for `LogsSseController` and `LogEventBus.matches`.
 *
 * Covers: the controller's merged `stream()` observable (live entries forwarded,
 * non-matching and cross-tenant entries dropped server-side, keep-alive ping
 * emitted on the timer), keep-alive ping emission, live entry mapping with
 * cursor id, non-matching entries are filtered, and a malformed `Last-Event-ID`
 * yields EMPTY replay (no 500).
 */
import { describe, expect, it, jest, afterEach } from '@jest/globals'
import { firstValueFrom, take, toArray, type Subscription } from 'rxjs'

import type { PrismaService } from '../prisma/prisma.service.js'
import { LogsService } from './logs.service.js'
import { LogsSseController } from './logs.sse.controller.js'
import { LogEventBus, matches, type BusLogEntry, type SseMessageEvent } from './log-event.bus.js'

function buildBus() {
  const prisma = {
    applicationLog: {
      findMany: jest.fn<() => Promise<[]>>().mockResolvedValue([]),
    },
  } as unknown as PrismaService
  return new LogEventBus(new LogsService(), prisma)
}

function makeEntry(overrides: Partial<BusLogEntry> = {}): BusLogEntry {
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
    cursor: 'abc',
    ...overrides,
  }
}

describe('matches()', () => {
  it('returns true when all filter predicates are satisfied', () => {
    /**
     * An entry that satisfies every field in the filter (level, logKey, tenantId,
     * q, service) must return true.
     */
    const entry = makeEntry()
    expect(
      matches(entry, {
        level: 'error',
        logKey: 'PAYMENT_REFUND_FAILED',
        tenantId: 'acme',
        q: 'gateway',
        service: 'api',
        source: 'postgres',
        limit: 100,
      }),
    ).toBe(true)
  })

  it('returns false when level does not match', () => {
    /** A filter of `level=warn` must reject an `error`-level entry. */
    const entry = makeEntry({ level: 'error' })
    expect(matches(entry, { level: 'warn', source: 'postgres', limit: 100 })).toBe(false)
  })

  it('returns false when logKey prefix wildcard does not match', () => {
    /** `ORDER_*` must not match a `PAYMENT_*` logKey. */
    const entry = makeEntry({ logKey: 'PAYMENT_REFUND_FAILED' })
    expect(matches(entry, { logKey: 'ORDER_*', source: 'postgres', limit: 100 })).toBe(false)
  })

  it('returns true for level>=warn when entry level is error', () => {
    /** `{ gte: "warn" }` matches `error` (higher severity). */
    const entry = makeEntry({ level: 'error' })
    expect(matches(entry, { level: { gte: 'warn' }, source: 'postgres', limit: 100 })).toBe(true)
  })

  it('returns false for level>=warn when entry level is debug', () => {
    /** `{ gte: "warn" }` does not match `debug` (lower severity). */
    const entry = makeEntry({ level: 'debug' })
    expect(matches(entry, { level: { gte: 'warn' }, source: 'postgres', limit: 100 })).toBe(false)
  })

  it('returns false when free-text q does not appear in message', () => {
    /** A `q` filter must fail if the message does not contain the substring. */
    const entry = makeEntry({ message: 'success' })
    expect(matches(entry, { q: 'declined', source: 'postgres', limit: 100 })).toBe(false)
  })
})

describe('LogEventBus.replaySince', () => {
  it('returns EMPTY when lastId is undefined', async () => {
    /**
     * An undefined `Last-Event-ID` means the client has no prior position;
     * replay must be skipped and the observable must complete immediately.
     */
    const bus = buildBus()
    const result = await firstValueFrom(
      bus.replaySince(undefined, { source: 'postgres', limit: 100 }).pipe(toArray()),
    )
    expect(result).toHaveLength(0)
  })

  it('returns EMPTY when lastId is a malformed cursor', async () => {
    /**
     * A malformed cursor must not throw HTTP 500 — it degrades to EMPTY
     * (live-only mode) per the SSE spec.
     */
    const bus = buildBus()
    const result = await firstValueFrom(
      bus.replaySince('!!!malformed!!!', { source: 'postgres', limit: 100 }).pipe(toArray()),
    )
    expect(result).toHaveLength(0)
  })
})

describe('LogEventBus.toEvent', () => {
  it('maps a BusLogEntry to an SSE event with id=cursor', () => {
    /**
     * The keyset cursor must be the SSE `id` so reconnect resumes from the
     * exact row — the browser re-sends `Last-Event-ID` with this value.
     */
    const bus = buildBus()
    const entry = makeEntry({ cursor: 'cursor-abc' })
    const event = bus.toEvent(entry)
    expect(event.id).toBe('cursor-abc')
    const data = JSON.parse(event.data) as BusLogEntry
    expect(data.level).toBe('error')
  })
})

describe('LogsSseController.stream', () => {
  const subs: Subscription[] = []

  afterEach(() => {
    // Tear down any open subscription so the keep-alive interval cannot leak.
    while (subs.length > 0) subs.pop()?.unsubscribe()
    jest.useRealTimers()
  })

  it('forwards a live entry that matches the filter and survives the tenant guard', async () => {
    /**
     * A live `'log'` event whose tenant matches the caller's RBAC tenant and
     * satisfies the client filter must be mapped through `toEvent` and surfaced
     * on the merged stream — this is the core live-tail contract. Subscribing
     * first then emitting proves the `fromEvent` live source is wired.
     */
    const bus = buildBus()
    const controller = new LogsSseController(bus)
    const stream$ = controller.stream(
      { 'x-role': 'operator', 'x-tenant-id': 'acme' },
      { source: 'postgres', limit: 100, level: 'error' },
    )

    const firstEvent = firstValueFrom(stream$.pipe(take(1)))
    // Emit after subscription is established by firstValueFrom.
    bus.emit(makeEntry({ tenantId: 'acme', level: 'error', cursor: 'cur-live-1' }))

    const event = (await firstEvent) as SseMessageEvent
    expect(event.id).toBe('cur-live-1')
    const data = JSON.parse(event.data) as BusLogEntry
    expect(data.level).toBe('error')
  })

  it('drops a live entry from a different tenant before the client filter runs', async () => {
    /**
     * The server-side tenant guard (`restriction.tenantId !== undefined &&
     * entry.tenantId !== restriction.tenantId`) must reject a cross-tenant entry
     * so a scoped operator can never see another tenant's lines, even if the
     * client filter would otherwise match. The matching entry that follows proves
     * the stream is still live (the cross-tenant one was simply skipped).
     */
    const bus = buildBus()
    const controller = new LogsSseController(bus)
    const stream$ = controller.stream(
      { 'x-role': 'operator', 'x-tenant-id': 'acme' },
      { source: 'postgres', limit: 100 },
    )

    const firstEvent = firstValueFrom(stream$.pipe(take(1)))
    bus.emit(makeEntry({ tenantId: 'other', cursor: 'cur-other' }))
    bus.emit(makeEntry({ tenantId: 'acme', cursor: 'cur-acme' }))

    const event = (await firstEvent) as SseMessageEvent
    expect(event.id).toBe('cur-acme')
  })

  it('drops a live entry that passes the tenant guard but fails the client filter', async () => {
    /**
     * With an admin caller (no tenant restriction) the tenant guard short-circuits
     * to the client `matches()` filter. An entry failing that filter must not be
     * forwarded; the following matching entry confirms the stream stays open —
     * covers the `restriction.tenantId === undefined` branch plus `matches=false`.
     */
    const bus = buildBus()
    const controller = new LogsSseController(bus)
    const stream$ = controller.stream(
      { 'x-role': 'admin' },
      { source: 'postgres', limit: 100, level: 'error' },
    )

    const firstEvent = firstValueFrom(stream$.pipe(take(1)))
    bus.emit(makeEntry({ level: 'info', cursor: 'cur-info' }))
    bus.emit(makeEntry({ level: 'error', cursor: 'cur-error' }))

    const event = (await firstEvent) as SseMessageEvent
    expect(event.id).toBe('cur-error')
  })

  it('emits a keep-alive ping on the 15s timer', () => {
    /**
     * The merged stream includes a 15-second keep-alive `{ data: "", type: "ping" }`
     * that defeats idle-timeout proxies. Fake timers prove the interval source is
     * wired without waiting in real time.
     */
    jest.useFakeTimers()
    const bus = buildBus()
    const controller = new LogsSseController(bus)
    const stream$ = controller.stream({ 'x-role': 'admin' }, { source: 'postgres', limit: 100 })

    const received: SseMessageEvent[] = []
    const sub = stream$.subscribe((e) => received.push(e))
    subs.push(sub)

    jest.advanceTimersByTime(15_000)

    expect(received).toContainEqual({ data: '', type: 'ping' })
  })

  it('includes a replay observable for a valid Last-Event-ID header', async () => {
    /**
     * When the browser reconnects with a valid `Last-Event-ID`, the merged stream
     * must begin with the replay of missed rows. With a single replay row and no
     * live traffic, the first emitted event is that replayed row — proving
     * `replaySince` is wired into the merge with the header value.
     */
    const replayRow = {
      id: 'row-9',
      time: new Date('2024-06-01T13:00:00Z'),
      level: 'error',
      logKey: 'PAYMENT_REFUND_FAILED',
      message: 'gateway declined',
      service: 'api',
      tenantId: 'acme',
      requestId: 'req-1',
      traceId: 'trace-1',
    }
    const prisma = {
      applicationLog: {
        findMany: jest.fn<() => Promise<unknown[]>>().mockResolvedValue([replayRow]),
      },
    } as unknown as PrismaService
    const logs = new LogsService()
    const bus = new LogEventBus(logs, prisma)
    const controller = new LogsSseController(bus)

    const lastId = logs.encodeCursor({ time: new Date('2024-06-01T12:00:00Z'), id: 'row-1' })
    const stream$ = controller.stream(
      { 'x-role': 'operator', 'x-tenant-id': 'acme', 'last-event-id': lastId },
      { source: 'postgres', limit: 100 },
    )

    const first = (await firstValueFrom(stream$.pipe(take(1)))) as SseMessageEvent
    const data = JSON.parse(first.data) as BusLogEntry
    expect(data.id).toBe('row-9')
  })
})
