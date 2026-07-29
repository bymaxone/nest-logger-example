/**
 * @fileoverview Unit tests for the pure filter utilities in `lib/filters` —
 * the exported constants, `parseLevelToken`, and `bucketFor`.
 *
 * The `useLogQuery` hook is excluded because it wraps nuqs + React side-effects;
 * only the deterministic helpers are tested here.
 *
 * @module lib/filters.test
 */
import { afterEach, describe, expect, it, vi } from 'vitest'
import { act, cleanup, renderHook } from '@testing-library/react'
import { withNuqsTestingAdapter } from 'nuqs/adapters/testing'

import {
  bucketFor,
  parseLevelToken,
  RANGE_MS,
  RANGE_PRESETS,
  ROLES,
  SOURCES,
  useLogQuery,
} from './filters'

// Unmount any rendered hook between tests so the relative-range ticker interval
// is torn down and never leaks into a following test's timer assertions.
afterEach(cleanup)

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

describe('RANGE_MS — exact products (re-import to apply static mutations)', () => {
  /**
   * Deep-asserting the whole map via a fresh import forces the module-level
   * object literal and every `n * 60_000` product to be evaluated with Stryker's
   * active mutant injected. It kills the ObjectLiteral→{} mutation and every
   * ArithmeticOperator mutation (`*`→`/`) on the six preset products at once —
   * each would yield a different number than the documented millisecond count.
   */
  it('maps every preset token to its exact millisecond product', async () => {
    vi.resetModules()
    const { RANGE_MS: fresh } = await import('./filters')
    expect(fresh).toEqual({
      '5m': 300_000,
      '15m': 900_000,
      '1h': 3_600_000,
      '6h': 21_600_000,
      '24h': 86_400_000,
      '7d': 604_800_000,
    })
    vi.resetModules()
  })
})

describe('logQueryParsers — defaults and enum membership (re-import to apply static mutations)', () => {
  /**
   * The default value of every parser is asserted through a fresh import so the
   * `.withDefault(...)` literals are evaluated under the active mutant. This kills
   * the StringLiteral→"Stryker was here!"/"" mutations on each free-text default,
   * the enum default literals ('loki', 'admin'), and the BooleanLiteral→true
   * mutation on the `live` default.
   */
  it('exposes the documented default value for every field', async () => {
    vi.resetModules()
    const { logQueryParsers: p } = await import('./filters')
    expect(p.range.defaultValue).toBe('')
    expect(p.from.defaultValue).toBe('')
    expect(p.to.defaultValue).toBe('')
    expect(p.source.defaultValue).toBe('loki')
    expect(p.tenantId.defaultValue).toBe('')
    expect(p.role.defaultValue).toBe('admin')
    expect(p.level.defaultValue).toBe('')
    expect(p.logKey.defaultValue).toBe('')
    expect(p.service.defaultValue).toBe('')
    expect(p.q.defaultValue).toBe('')
    expect(p.traceId.defaultValue).toBe('')
    expect(p.requestId.defaultValue).toBe('')
    expect(p.live.defaultValue).toBe(false)
    vi.resetModules()
  })

  /**
   * The enum parsers must be built from the full `[...SOURCES]` / `[...ROLES]`
   * member lists. Parsing a valid non-default member returns that member; an
   * empty member list (the ArrayDeclaration→[] mutation) would reject it and
   * resolve to null, so these assertions kill both array mutations.
   */
  it('accepts every non-default enum member for source and role', async () => {
    vi.resetModules()
    const { logQueryParsers: p } = await import('./filters')
    expect(p.source.parse('postgres')).toBe('postgres')
    expect(p.role.parse('viewer')).toBe('viewer')
    expect(p.role.parse('operator')).toBe('operator')
    vi.resetModules()
  })
})

// Statically-imported `useLogQuery` is exercised directly; these mutants run at
// hook runtime (not module load), so no re-import is needed.
describe('useLogQuery — isRelative flag', () => {
  /**
   * An absolute window (explicit from/to, no range preset) is NOT relative.
   * Asserting `false` kills the ConditionalExpression→true mutation that would
   * force `isRelative` on for every state.
   */
  it('is false for an absolute window with explicit from/to and no range', () => {
    const wrapper = withNuqsTestingAdapter({
      searchParams: '?from=2026-06-01T00:00:00.000Z&to=2026-06-02T00:00:00.000Z',
    })
    const { result } = renderHook(() => useLogQuery(), { wrapper })
    expect(result.current.isRelative).toBe(false)
  })

  /** A relative range preset is reported as relative so live tail is permitted. */
  it('is true for a relative range preset', () => {
    const wrapper = withNuqsTestingAdapter({ searchParams: '?range=5m' })
    const { result } = renderHook(() => useLogQuery(), { wrapper })
    expect(result.current.isRelative).toBe(true)
  })

  /** A window with only an explicit from bound (no range, no to) is absolute. */
  it('is false when only the from bound is set', () => {
    const wrapper = withNuqsTestingAdapter({ searchParams: '?from=2026-06-01T00:00:00.000Z' })
    const { result } = renderHook(() => useLogQuery(), { wrapper })
    expect(result.current.isRelative).toBe(false)
  })

  /** A window with only an explicit to bound (no range, no from) is absolute. */
  it('is false when only the to bound is set', async () => {
    const wrapper = withNuqsTestingAdapter({ searchParams: '?to=2026-06-02T00:00:00.000Z' })
    const { result } = renderHook(() => useLogQuery(), { wrapper })
    await act(async () => {
      await Promise.resolve()
    })
    expect(result.current.isRelative).toBe(false)
  })
})

describe('useLogQuery — optional level key', () => {
  /**
   * With no `level` filter the compiled query must omit the `level` key entirely
   * (not carry `level: undefined`). `'level' in query` being false kills the
   * ConditionalExpression→true mutation on the `level !== undefined` spread guard.
   */
  it('omits the level key when no level filter is set', () => {
    const wrapper = withNuqsTestingAdapter({ searchParams: '?range=5m' })
    const { result } = renderHook(() => useLogQuery(), { wrapper })
    expect('level' in result.current.query).toBe(false)
  })

  /** A valid level token is parsed and included on the compiled query. */
  it('includes the parsed level when a level filter is set', () => {
    const wrapper = withNuqsTestingAdapter({ searchParams: '?range=5m&level=warn' })
    const { result } = renderHook(() => useLogQuery(), { wrapper })
    expect(result.current.query.level).toBe('warn')
  })
})

describe('useLogQuery — relative-range ticker effect', () => {
  /**
   * An absolute window must not start the "now" ticker. Asserting setInterval is
   * never called kills both the ConditionalExpression→true mutation on
   * `usesRelativePreset` and the ConditionalExpression→false mutation on the
   * `if (!usesRelativePreset) return` early-exit guard.
   */
  it('does not start an interval for an absolute window', () => {
    const setSpy = vi.spyOn(globalThis, 'setInterval')
    const wrapper = withNuqsTestingAdapter({
      searchParams: '?from=2026-06-01T00:00:00.000Z&to=2026-06-02T00:00:00.000Z',
    })
    renderHook(() => useLogQuery(), { wrapper })
    expect(setSpy).not.toHaveBeenCalled()
    setSpy.mockRestore()
  })

  /** A relative range preset starts exactly one ticker interval on mount. */
  it('starts a single interval for a relative range preset', () => {
    const setSpy = vi.spyOn(globalThis, 'setInterval')
    const wrapper = withNuqsTestingAdapter({ searchParams: '?range=5m' })
    renderHook(() => useLogQuery(), { wrapper })
    expect(setSpy).toHaveBeenCalledTimes(1)
    setSpy.mockRestore()
  })

  /**
   * On unmount the effect cleanup must clear the very interval it created.
   * Capturing the id from setInterval and asserting clearInterval is called with
   * it kills the ArrowFunction→`() => undefined` mutation on the cleanup return.
   */
  it('clears its own interval on unmount', () => {
    const setSpy = vi.spyOn(globalThis, 'setInterval')
    const clearSpy = vi.spyOn(globalThis, 'clearInterval')
    const wrapper = withNuqsTestingAdapter({ searchParams: '?range=5m' })
    const { unmount } = renderHook(() => useLogQuery(), { wrapper })
    const id = setSpy.mock.results[0]?.value
    unmount()
    expect(clearSpy).toHaveBeenCalledWith(id)
    setSpy.mockRestore()
    clearSpy.mockRestore()
  })

  /**
   * The effect depends on `usesRelativePreset`: switching from an absolute to a
   * relative range must re-run it and start the ticker. With the dependency array
   * mutated to `[]` the effect would only ever run on mount (absolute, no ticker),
   * so asserting setInterval fires after the switch kills the ArrayDeclaration→[]
   * mutation on the dependency list.
   */
  it('re-runs and starts the ticker when the range switches absolute->relative', async () => {
    const setSpy = vi.spyOn(globalThis, 'setInterval')
    const wrapper = withNuqsTestingAdapter({ searchParams: '', hasMemory: true })
    const { result } = renderHook(() => useLogQuery(), { wrapper })
    expect(setSpy).not.toHaveBeenCalled()
    await act(async () => {
      await result.current.setQuery({ range: '5m' })
    })
    expect(setSpy).toHaveBeenCalled()
    setSpy.mockRestore()
  })

  /**
   * The ticker must keep advancing the window on EVERY tick, which requires the
   * `setNowTick((t) => t + 1)` updater to return a fresh, ever-changing value.
   * Asserting the window moves on both the first AND the second quantum tick kills
   * the ArrowFunction→`() => undefined` mutation on the updater: that mutation sets
   * `nowTick` to `undefined`, which changes it once (so the first tick still
   * recomputes) but never again (React bails on `undefined`→`undefined`), so the
   * window would freeze after the first tick.
   */
  it('keeps advancing the resolved window on each successive quantum tick', () => {
    vi.useFakeTimers()
    try {
      vi.setSystemTime(new Date('2026-06-18T00:00:00.000Z'))
      const wrapper = withNuqsTestingAdapter({ searchParams: '?range=5m' })
      const { result } = renderHook(() => useLogQuery(), { wrapper })
      const t0 = result.current.query.to
      act(() => {
        vi.advanceTimersByTime(30_000)
      })
      const t1 = result.current.query.to
      act(() => {
        vi.advanceTimersByTime(30_000)
      })
      const t2 = result.current.query.to
      expect(t1).not.toBe(t0)
      expect(t2).not.toBe(t1)
    } finally {
      vi.useRealTimers()
    }
  })
})
