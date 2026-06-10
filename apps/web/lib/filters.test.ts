/**
 * @fileoverview Unit tests for the pure filter utilities in `lib/filters` —
 * the exported constants, `parseLevelToken`, and `bucketFor`.
 *
 * The `useLogQuery` hook is excluded because it wraps nuqs + React side-effects;
 * only the deterministic helpers are tested here.
 *
 * @module lib/filters.test
 */
import { describe, expect, it } from 'vitest'

import { bucketFor, parseLevelToken, RANGE_MS, RANGE_PRESETS, ROLES, SOURCES } from './filters'

describe('SOURCES', () => {
  /** The two selectable backends are exactly the documented identifiers. */
  it('contains exactly loki and postgres in order', () => {
    expect(SOURCES).toEqual(['loki', 'postgres'])
  })
})

describe('ROLES', () => {
  /** The three RBAC roles are exactly the documented values in order. */
  it('contains exactly the three RBAC roles in ascending privilege order', () => {
    expect(ROLES).toEqual(['viewer', 'operator', 'admin'])
  })
})

describe('RANGE_PRESETS', () => {
  /** The six preset tokens are in the documented short-to-long order. */
  it('contains exactly the six preset tokens in short-to-long order', () => {
    expect(RANGE_PRESETS).toEqual(['5m', '15m', '1h', '6h', '24h', '7d'])
  })
})

describe('RANGE_MS', () => {
  /** Each preset token maps to the correct millisecond count. */
  it('maps 5m to 300_000 ms', () => {
    expect(RANGE_MS['5m']).toBe(300_000)
  })

  /** 15 minutes is 900 seconds, not 900 000. */
  it('maps 15m to 900_000 ms', () => {
    expect(RANGE_MS['15m']).toBe(900_000)
  })

  /** One hour is exactly 3_600_000 ms. */
  it('maps 1h to 3_600_000 ms', () => {
    expect(RANGE_MS['1h']).toBe(3_600_000)
  })

  /** Six hours is 6 × 3_600_000 ms. */
  it('maps 6h to 21_600_000 ms', () => {
    expect(RANGE_MS['6h']).toBe(21_600_000)
  })

  /** 24 hours is 86_400_000 ms. */
  it('maps 24h to 86_400_000 ms', () => {
    expect(RANGE_MS['24h']).toBe(86_400_000)
  })

  /** Seven days is 604_800_000 ms. */
  it('maps 7d to 604_800_000 ms', () => {
    expect(RANGE_MS['7d']).toBe(604_800_000)
  })
})

describe('parseLevelToken', () => {
  /** An empty string signals "no filter" and resolves to undefined. */
  it('returns undefined for an empty string', () => {
    expect(parseLevelToken('')).toBeUndefined()
  })

  /** A bare valid level resolves to the exact level string. */
  it('returns the exact level string for a known bare level', () => {
    expect(parseLevelToken('error')).toBe('error')
    expect(parseLevelToken('fatal')).toBe('fatal')
    expect(parseLevelToken('warn')).toBe('warn')
    expect(parseLevelToken('info')).toBe('info')
    expect(parseLevelToken('debug')).toBe('debug')
    expect(parseLevelToken('trace')).toBe('trace')
  })

  /** An unrecognized bare token resolves to undefined. */
  it('returns undefined for an unknown bare token', () => {
    expect(parseLevelToken('verbose')).toBeUndefined()
    expect(parseLevelToken('WARN')).toBeUndefined()
  })

  /** A `>=level` token resolves to the at-or-above comparison object. */
  it('parses a >=level token to a gte comparison object', () => {
    expect(parseLevelToken('>=warn')).toEqual({ gte: 'warn' })
    expect(parseLevelToken('>=error')).toEqual({ gte: 'error' })
    expect(parseLevelToken('>=fatal')).toEqual({ gte: 'fatal' })
  })

  /** A `>=unknown` token (valid prefix, invalid level) resolves to undefined. */
  it('returns undefined for a >= prefix with an unknown level', () => {
    expect(parseLevelToken('>=verbose')).toBeUndefined()
    expect(parseLevelToken('>=WARN')).toBeUndefined()
  })

  /** A bare `>=` with no level after is invalid and resolves to undefined. */
  it('returns undefined for a bare >= with no trailing level', () => {
    expect(parseLevelToken('>=')).toBeUndefined()
  })
})

describe('bucketFor', () => {
  /**
   * A window of 6 hours or less uses the 1-minute bucket (finest resolution).
   * The `<= 6` boundary means exactly 6 hours still returns '1m'.
   */
  it('returns 1m for a window of exactly 6 hours', () => {
    const from = '2026-06-05T00:00:00.000Z'
    const to = '2026-06-05T06:00:00.000Z'
    expect(bucketFor(from, to)).toBe('1m')
  })

  /** One second inside the 6-hour window returns 1m. */
  it('returns 1m for a window shorter than 6 hours', () => {
    const from = '2026-06-05T00:00:00.000Z'
    const to = '2026-06-05T01:00:00.000Z'
    expect(bucketFor(from, to)).toBe('1m')
  })

  /**
   * Just above 6 hours falls in the 5-minute bucket range (> 6h and ≤ 24h).
   * This exercises the `> 6` branch (the false of the first `<= 6` condition).
   */
  it('returns 5m for a window slightly above 6 hours', () => {
    const from = '2026-06-05T00:00:00.000Z'
    // 6 hours + 1 ms
    const to = new Date(Date.parse('2026-06-05T00:00:00.000Z') + 6 * 3_600_000 + 1).toISOString()
    expect(bucketFor(from, to)).toBe('5m')
  })

  /** A 12-hour window falls in the 5-minute bucket range. */
  it('returns 5m for a 12-hour window', () => {
    const from = '2026-06-05T00:00:00.000Z'
    const to = '2026-06-05T12:00:00.000Z'
    expect(bucketFor(from, to)).toBe('5m')
  })

  /**
   * A window of exactly 24 hours is still in the 5-minute range
   * (`<= 24` boundary included).
   */
  it('returns 5m for a window of exactly 24 hours', () => {
    const from = '2026-06-05T00:00:00.000Z'
    const to = '2026-06-06T00:00:00.000Z'
    expect(bucketFor(from, to)).toBe('5m')
  })

  /**
   * Anything beyond 24 hours falls back to the coarser 1-hour bucket.
   * This exercises the final `return '1h'` path.
   */
  it('returns 1h for a window longer than 24 hours', () => {
    const from = '2026-06-05T00:00:00.000Z'
    // 24 hours + 1 ms
    const to = new Date(Date.parse('2026-06-05T00:00:00.000Z') + 24 * 3_600_000 + 1).toISOString()
    expect(bucketFor(from, to)).toBe('1h')
  })

  /** A 7-day window uses the 1-hour bucket. */
  it('returns 1h for a 7-day window', () => {
    const from = '2026-06-01T00:00:00.000Z'
    const to = '2026-06-08T00:00:00.000Z'
    expect(bucketFor(from, to)).toBe('1h')
  })
})
