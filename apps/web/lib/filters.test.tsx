/**
 * @fileoverview Tests for the nuqs filter layer in {@link module:lib/filters}.
 *
 * Covers the pure helpers ({@link parseLevelToken}, {@link bucketFor}) directly
 * and exercises {@link useLogQuery} through a tiny probe component wrapped in
 * `NuqsTestingAdapter`, seeding the URL search params per test to drive the
 * relative-range, absolute-window, and field-compilation branches. Fake timers
 * cover the relative-preset ticker so the memoized window stays deterministic.
 *
 * @module lib/filters.test
 */
import { afterEach, describe, expect, it, vi } from 'vitest'
import { act, cleanup, render, screen } from '@testing-library/react'
import { NuqsTestingAdapter } from 'nuqs/adapters/testing'
import type { ReactElement, ReactNode } from 'react'

import {
  bucketFor,
  parseLevelToken,
  RANGE_MS,
  RANGE_PRESETS,
  ROLES,
  SOURCES,
  useLogQuery,
} from './filters'

afterEach(() => {
  cleanup()
  vi.useRealTimers()
})

/** Render `useLogQuery` and surface its compiled query/flags as text for assertions. */
function Probe(): ReactElement {
  const { query, live, isRelative } = useLogQuery()
  return (
    <div>
      <span data-testid="query">{JSON.stringify(query)}</span>
      <span data-testid="live">{String(live)}</span>
      <span data-testid="relative">{String(isRelative)}</span>
    </div>
  )
}

/** Mount the probe under a testing nuqs adapter seeded with the given search params. */
function renderProbe(searchParams: string | Record<string, string>): void {
  const wrapper = ({ children }: { children: ReactNode }): ReactElement => (
    <NuqsTestingAdapter searchParams={searchParams}>{children}</NuqsTestingAdapter>
  )
  render(<Probe />, { wrapper })
}

/** Read the compiled {@link LogQuery} the probe rendered as JSON. */
function readQuery(): Record<string, unknown> {
  return JSON.parse(screen.getByTestId('query').textContent ?? '{}')
}

describe('parseLevelToken', () => {
  /** An empty token is "unset" and must resolve to `undefined`. */
  it('returns undefined for the empty string', () => {
    expect(parseLevelToken('')).toBeUndefined()
  })

  /** A bare valid level is an exact match. */
  it('returns an exact level for a bare valid token', () => {
    expect(parseLevelToken('error')).toBe('error')
  })

  /** A `>=` prefix on a valid level denotes the at-or-above comparison. */
  it('returns a gte comparison for a >= valid token', () => {
    expect(parseLevelToken('>=warn')).toEqual({ gte: 'warn' })
  })

  /** A `>=` prefix on an unknown level is invalid and resolves to `undefined`. */
  it('returns undefined for a >= unknown token', () => {
    expect(parseLevelToken('>=nope')).toBeUndefined()
  })

  /** A bare unknown level is invalid and resolves to `undefined`. */
  it('returns undefined for a bare unknown token', () => {
    expect(parseLevelToken('bogus')).toBeUndefined()
  })
})

describe('bucketFor', () => {
  /** A window of at most 6 hours buckets at minute granularity. */
  it('returns 1m for a window up to 6h', () => {
    expect(bucketFor('2026-06-04T00:00:00.000Z', '2026-06-04T06:00:00.000Z')).toBe('1m')
  })

  /** A window over 6h and up to 24h buckets at five-minute granularity. */
  it('returns 5m for a window between 6h and 24h', () => {
    expect(bucketFor('2026-06-04T00:00:00.000Z', '2026-06-04T20:00:00.000Z')).toBe('5m')
  })

  /** A window over 24h buckets at hour granularity. */
  it('returns 1h for a window over 24h', () => {
    expect(bucketFor('2026-06-04T00:00:00.000Z', '2026-06-06T00:00:00.000Z')).toBe('1h')
  })
})

describe('exported constants', () => {
  /** The toggle/switcher option lists and preset map must stay aligned. */
  it('exposes the source, role, and range preset catalogs', () => {
    expect(SOURCES).toEqual(['loki', 'postgres'])
    expect(ROLES).toEqual(['viewer', 'operator', 'admin'])
    expect(RANGE_PRESETS).toEqual(['5m', '15m', '1h', '6h', '24h', '7d'])
    expect(Object.keys(RANGE_MS)).toEqual(['5m', '15m', '1h', '6h', '24h', '7d'])
  })
})

describe('useLogQuery', () => {
  /**
   * With no params the query falls back to defaults (`loki`/`admin`), carries no
   * optional fields, and is treated as relative (live tail allowed by default).
   */
  it('compiles the default query from an empty URL', () => {
    renderProbe('')
    expect(readQuery()).toEqual({ source: 'loki', role: 'admin' })
    expect(screen.getByTestId('live').textContent).toBe('false')
    expect(screen.getByTestId('relative').textContent).toBe('true')
  })

  /**
   * A relative `range` preset resolves to concrete `from`/`to` around a quantized
   * "now" and is reported as relative.
   */
  it('resolves a relative range preset to a concrete window', () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-06-04T12:00:00.000Z'))
    renderProbe({ range: '1h' })
    const q = readQuery()
    expect(q.to).toBe('2026-06-04T12:00:00.000Z')
    expect(q.from).toBe('2026-06-04T11:00:00.000Z')
    expect(screen.getByTestId('relative').textContent).toBe('true')
  })

  /**
   * An absolute `from`/`to` window (no `range`) passes through verbatim and is
   * reported as NOT relative so the live tail stays disabled.
   */
  it('passes an absolute from/to window through and marks it non-relative', () => {
    renderProbe({ from: '2026-06-01T00:00:00.000Z', to: '2026-06-02T00:00:00.000Z' })
    const q = readQuery()
    expect(q.from).toBe('2026-06-01T00:00:00.000Z')
    expect(q.to).toBe('2026-06-02T00:00:00.000Z')
    expect(screen.getByTestId('relative').textContent).toBe('false')
  })

  /**
   * Every optional filter field present in the URL must be threaded into the
   * compiled query, including a parsed `level` token and the `live` flag.
   */
  it('threads all optional filter fields into the compiled query', () => {
    renderProbe({
      source: 'postgres',
      role: 'operator',
      tenantId: 'acme',
      level: '>=warn',
      logKey: 'HTTP_REQUEST',
      service: 'gateway',
      q: 'timeout',
      traceId: 'trace_1',
      requestId: 'req_1',
      live: 'true',
    })
    expect(readQuery()).toEqual({
      source: 'postgres',
      role: 'operator',
      tenantId: 'acme',
      level: { gte: 'warn' },
      logKey: 'HTTP_REQUEST',
      service: 'gateway',
      q: 'timeout',
      traceId: 'trace_1',
      requestId: 'req_1',
    })
    expect(screen.getByTestId('live').textContent).toBe('true')
  })

  /**
   * An invalid `level` token is dropped from the query (the `level !== undefined`
   * guard), leaving only the defaults.
   */
  it('omits the level field when the token is invalid', () => {
    renderProbe({ level: 'bogus' })
    expect(readQuery()).toEqual({ source: 'loki', role: 'admin' })
  })

  /**
   * For a relative preset the ticker advances the window on each interval: after
   * the quantum elapses the recomputed `to` reflects the new quantized "now".
   */
  it('advances the relative window as the ticker fires', () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-06-04T12:00:00.000Z'))
    renderProbe({ range: '5m' })
    expect(readQuery().to).toBe('2026-06-04T12:00:00.000Z')
    // Advancing the fake clock by exactly one 30s quantum both fires the ticker
    // and moves "now" to the next quantized boundary, so the window recomputes.
    act(() => {
      vi.advanceTimersByTime(30_000)
    })
    expect(readQuery().to).toBe('2026-06-04T12:00:30.000Z')
  })
})

describe('useLogQuery — isRelative boundary conditions', () => {
  /**
   * When only the `to` bound is set (no `range`, no `from`) the range is NOT
   * relative — the user selected an absolute upper bound. Asserting `false` kills
   * the ConditionalExpression→true mutation on `state.to === ''` inside the
   * isRelative computation: with the mutation `true`, `(from===''&&true)` = true,
   * making `isRelative=true` when it should be false.
   */
  it('marks a query with only the to bound (no range, no from) as not-relative', () => {
    renderProbe({ to: '2026-06-02T00:00:00.000Z' })
    expect(screen.getByTestId('relative').textContent).toBe('false')
  })

  /**
   * When a relative range preset is set alongside a concrete `from` bound the
   * range IS still relative (the preset takes priority). Asserting `true` here
   * kills the LogicalOperator `||→&&` mutation: with `&&`, the second condition
   * `(from===''&&to==='')` is false (from is set), making `isRelative=false`.
   * It also kills the ConditionalExpression→false mutation on `state.range!==''`.
   */
  it('marks a query with a range preset and a concrete from bound as relative', () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-06-04T12:00:00.000Z'))
    renderProbe({ range: '1h', from: '2026-06-04T11:00:00.000Z' })
    expect(screen.getByTestId('relative').textContent).toBe('true')
  })
})
