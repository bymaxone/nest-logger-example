/**
 * @fileoverview Unit tests for the trigger descriptors — guarantees every
 * declared `logKey` matches the library convention and that a malformed literal
 * is rejected by the same guard the module applies at load time.
 *
 * @module components/trigger/trigger-grid.test
 */
import { describe, expect, it } from 'vitest'

import { isValidLogKey } from '@/lib/log-keys'
import { TRIGGERS } from './trigger-grid'

describe('TRIGGERS', () => {
  /** There must be exactly twelve cards, one per DASHBOARD.md §8 row. */
  it('declares twelve trigger cards', () => {
    expect(TRIGGERS).toHaveLength(12)
  })

  /** Every declared logKey literal must satisfy the library convention regex. */
  it('only declares convention-valid logKeys', () => {
    for (const trigger of TRIGGERS) {
      for (const key of trigger.logKeys) {
        expect(isValidLogKey(key), `${trigger.id}: ${key}`).toBe(true)
      }
    }
  })

  /**
   * The wildcard branch probes `PREFIX_*` as `PREFIX_XX` so a prefix search key
   * still satisfies the convention — protects the Explorer's prefix-search guard.
   */
  it('accepts a valid trailing-wildcard prefix and rejects an invalid one', () => {
    // Valid wildcard: `PAYMENT_*` is probed as `PAYMENT_XX`, which matches MODULE_ACTION_RESULT.
    expect(isValidLogKey('PAYMENT_*')).toBe(true)
    // Invalid wildcard: lowercase prefix `payment_*` probes to `payment_XX`, which violates the uppercase convention.
    expect(isValidLogKey('payment_*')).toBe(false)
  })

  /** A literal with no segment separator must fail the guard (protects the regex check). */
  it('rejects a logKey literal with no separator', () => {
    // `badkey` is a single lowercase token with no `_` — never matches MODULE_ACTION_RESULT.
    expect(isValidLogKey('badkey')).toBe(false)
  })

  /** A lowercase literal must fail the guard (the convention requires uppercase segments). */
  it('rejects a logKey literal in the wrong case', () => {
    // `lower_case_key` has the right separators but lowercase segments — violates the uppercase convention.
    expect(isValidLogKey('lower_case_key')).toBe(false)
  })
})
