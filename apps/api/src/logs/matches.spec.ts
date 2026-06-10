/**
 * Unit tests for the `matches()` predicate exported from `LogEventBus`.
 *
 * Layer: logs. Covers every filter branch — level GTE, exact / wildcard logKey,
 * traceId, requestId, tenantId, service, free-text `q` — plus the boundary and
 * equality positive paths that kill ConditionalExpression, EqualityOperator, and
 * StringLiteral mutations for the predicate specifically.
 */
import { describe, expect, it } from '@jest/globals'

import { matches, type BusLogEntry } from './log-event.bus.js'

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

describe('matches() — boundary and equality positive paths', () => {
  it('passes when the traceId filter exactly matches the entry traceId', () => {
    /**
     * The traceId guard must NOT reject when `filter.traceId === entry.traceId`.
     * Kills the ConditionalExpression mutation that replaces `entry.traceId !==
     * filter.traceId` with `true` (which would always reject whenever the filter
     * is set, even on a matching entry).
     */
    expect(
      matches(makeEntry({ traceId: 'trace-match' }), {
        traceId: 'trace-match',
        source: 'postgres',
        limit: 100,
      }),
    ).toBe(true)
  })

  it('passes when the requestId filter exactly matches the entry requestId', () => {
    /**
     * The requestId guard must NOT reject when `filter.requestId === entry.requestId`.
     * Kills the ConditionalExpression mutation that replaces `entry.requestId !==
     * filter.requestId` with `true` (always reject when the filter is set).
     */
    expect(
      matches(makeEntry({ requestId: 'req-match' }), {
        requestId: 'req-match',
        source: 'postgres',
        limit: 100,
      }),
    ).toBe(true)
  })

  it('passes an entry whose level rank exactly equals the gte threshold (boundary)', () => {
    /**
     * The comparison is strictly `<` so an entry at the exact threshold rank must
     * pass. Kills the EqualityOperator mutation that changes `<` to `<=`, which
     * would incorrectly reject entries at the boundary (rank 30 < 30 is false,
     * but 30 <= 30 is true).
     */
    expect(
      matches(makeEntry({ level: 'info' }), {
        level: { gte: 'info' },
        source: 'postgres',
        limit: 100,
      }),
    ).toBe(true)
  })

  it('does not treat a logKey without the _* suffix as a wildcard even when a prefix would match', () => {
    /**
     * The wildcard check requires exactly the `_*` suffix. A logKey without `_*` must
     * take the exact-match path and reject when the strings differ — even if the entry
     * logKey starts with a prefix of the filter. Kills the ConditionalExpression
     * mutation that replaces `endsWith("_*")` with `true` (always wildcard) and the
     * StringLiteral mutation that changes `"_*"` to `""` (always wildcard).
     */
    expect(
      matches(makeEntry({ logKey: 'ORDER_CREATE_SUCCEED' }), {
        logKey: 'ORDER_CREATE_SUCCESS',
        source: 'postgres',
        limit: 100,
      }),
    ).toBe(false)
  })

  it('rejects a wildcard logKey entry whose logKey shares only the first character of the prefix', () => {
    /**
     * `slice(0, -1)` strips the trailing `*`, giving the full prefix to test
     * against. Kills the UnaryOperator mutation that changes `-1` to `1`, which
     * would use only the first character as the prefix and incorrectly accept entries
     * that merely start with the same letter.
     */
    expect(
      matches(makeEntry({ logKey: 'PAY_UNRELATED' }), {
        logKey: 'PAYMENT_*',
        source: 'postgres',
        limit: 100,
      }),
    ).toBe(false)
  })

  /**
   * A non-wildcard logKey filter must reject entries whose logKey begins with the
   * filter value but has additional characters. Kills the ConditionalExpression→true
   * mutation that always routes to the wildcard startsWith branch, and the
   * StringLiteral→"" mutation that makes endsWith('') always true.
   */
  it('rejects a non-wildcard filter when the entry logKey is a strict extension of the filter value', () => {
    expect(
      matches(makeEntry({ logKey: 'PAYMENT_REFUND_FAILED' }), {
        logKey: 'PAYMENT_REFUND',
        source: 'postgres',
        limit: 100,
      }),
    ).toBe(false)
  })
})
