/**
 * @fileoverview Unit tests for `isValidLogKey` — validates both exact log keys and
 * `PREFIX_*` wildcards against the library convention regex.
 *
 * The wildcard probe replaces the trailing `*` with `XX` before testing the regex,
 * so the prefix shape (2-char minimum per segment) is validated correctly.
 *
 * @module lib/log-keys.test
 */
import { describe, expect, it } from 'vitest'

import { isValidLogKey, LOG_KEYS_CONVENTION_REGEX } from './log-keys'

describe('isValidLogKey — exact keys', () => {
  /** Standard two-word key. */
  it('accepts a two-word key like USER_CREATED', () => {
    expect(isValidLogKey('USER_CREATED')).toBe(true)
  })

  /** Standard three-word key. */
  it('accepts a three-word key like AUTH_LOGIN_SUCCESS', () => {
    expect(isValidLogKey('AUTH_LOGIN_SUCCESS')).toBe(true)
  })

  /** Four-word key (reserved log keys use four words). */
  it('accepts a four-word key like HTTP_REQUEST_CLIENT_ERROR', () => {
    expect(isValidLogKey('HTTP_REQUEST_CLIENT_ERROR')).toBe(true)
  })

  /** Exact key used in the trigger-api (two words). */
  it('accepts PAYMENT_CHARGE_FAILED', () => {
    expect(isValidLogKey('PAYMENT_CHARGE_FAILED')).toBe(true)
  })

  /** A single-word key is rejected (the regex requires two or more words). */
  it('rejects a single-word key', () => {
    expect(isValidLogKey('LOGIN')).toBe(false)
  })

  /** Lowercase is rejected (the convention is all-uppercase). */
  it('rejects a lowercase key', () => {
    expect(isValidLogKey('login_success')).toBe(false)
  })

  /** An empty string is rejected. */
  it('rejects an empty string', () => {
    expect(isValidLogKey('')).toBe(false)
  })
})

describe('isValidLogKey — wildcard PREFIX_* keys', () => {
  /**
   * A `PREFIX_*` wildcard is probed as `PREFIX_XX` so the regex validates the
   * prefix shape. `PAYMENT_XX` satisfies the two-segment rule → true.
   */
  it('accepts a valid PREFIX_* wildcard (PAYMENT_*)', () => {
    expect(isValidLogKey('PAYMENT_*')).toBe(true)
  })

  /** An AUTH_* wildcard probed as AUTH_XX → valid two-segment shape. */
  it('accepts AUTH_*', () => {
    expect(isValidLogKey('AUTH_*')).toBe(true)
  })

  /** An HTTP_REQUEST_* wildcard probed as HTTP_REQUEST_XX → valid three-segment shape. */
  it('accepts a three-segment wildcard like HTTP_REQUEST_*', () => {
    expect(isValidLogKey('HTTP_REQUEST_*')).toBe(true)
  })

  /**
   * A single-char first segment fails even as a wildcard.
   * `P_*` → probe `P_XX`: the first segment `P` has only one char but the regex
   * needs `[A-Z][A-Z0-9_]+` (minimum two chars per segment), so it is rejected.
   */
  it('rejects a wildcard whose prefix segment is too short (P_*)', () => {
    expect(isValidLogKey('P_*')).toBe(false)
  })

  /**
   * Directly guards the two-char `XX` probe suffix. The prefix `AB_` is invalid on
   * its own (trailing-underscore segment) but valid as `AB_XX`; so a `AB_*` wildcard
   * must be accepted. An empty probe suffix would test `AB_` and reject it, killing
   * the `'XX' -> ""` string-literal mutant.
   */
  it('accepts AB_* whose prefix is only valid once the XX probe suffix is appended', () => {
    expect(isValidLogKey('AB_*')).toBe(true)
  })

  /**
   * Guards the `endsWith('*')` wildcard check itself. `AB_X` is not a wildcard, so it
   * is validated verbatim and rejected (its last segment is a single char). If the
   * wildcard test always matched (e.g. `endsWith("")`), `AB_X` would be rewritten to
   * the valid probe `AB_XX` and wrongly accepted — so a non-wildcard key must never be
   * probed.
   */
  it('rejects the non-wildcard AB_X without applying the wildcard probe', () => {
    expect(isValidLogKey('AB_X')).toBe(false)
  })

  /**
   * Calling `isValidLogKey` multiple times with the same wildcard returns the
   * same result — guards the `LOG_KEYS_CONVENTION_REGEX.lastIndex = 0` reset that
   * prevents a global-flag regex from toggling between calls.
   */
  it('returns a consistent result on repeated calls for the same wildcard', () => {
    expect(isValidLogKey('PAYMENT_*')).toBe(true)
    expect(isValidLogKey('PAYMENT_*')).toBe(true)
    expect(isValidLogKey('PAYMENT_*')).toBe(true)
  })
})

describe('LOG_KEYS_CONVENTION_REGEX (re-exported)', () => {
  /** The re-exported constant is the same object the library ships. */
  it('matches a canonical two-word key', () => {
    expect(LOG_KEYS_CONVENTION_REGEX.test('ORDER_CREATE')).toBe(true)
  })

  /** It rejects lowercase keys. */
  it('rejects a lowercase key', () => {
    expect(LOG_KEYS_CONVENTION_REGEX.test('order_create')).toBe(false)
  })
})
