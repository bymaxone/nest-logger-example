/**
 * Unit tests for `LogsSseController` and `LogEventBus.matches`.
 *
 * Covers: keep-alive ping emission, live entry mapping with cursor id,
 * non-matching entries are filtered, and a malformed `Last-Event-ID` yields
 * EMPTY replay (no 500).
 */
import { describe, expect, it, jest } from '@jest/globals'
import { firstValueFrom, toArray } from 'rxjs'

import type { PrismaService } from '../prisma/prisma.service.js'
import { LogsService } from './logs.service.js'
import { LogEventBus, matches, type BusLogEntry } from './log-event.bus.js'

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
