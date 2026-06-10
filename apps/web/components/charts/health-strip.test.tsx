/**
 * @fileoverview Component tests for {@link HealthStrip} — the four golden-signal
 * tiles plus the SLO gauge that compose the Overview's health row.
 *
 * Each tile is fed by `useAggregate` (`/logs/aggregate`); the hook is mocked so
 * every branch — error banner, skeleton loading, empty prompt, and the populated
 * tiles with their danger thresholds — can be driven deterministically. `next/link`
 * is stubbed to a plain anchor so the empty-state call-to-action is assertable.
 *
 * @module components/charts/health-strip.test
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, render, screen } from '@testing-library/react'
import type { ReactNode } from 'react'

import type {
  AggregateMetric,
  ErrorRateRow,
  LatencyRow,
  LogQuery,
  StatusMixRow,
  VolumeRow,
} from '@/lib/types'

/** One TanStack-shaped query result the mocked `useAggregate` returns per metric. */
interface FakeQuery {
  data?: unknown
  isLoading: boolean
  isError: boolean
}

/** Per-metric result map the mocked hook reads; reset before each test. */
let results: Record<AggregateMetric, FakeQuery>

vi.mock('@/hooks/use-aggregate', () => ({
  useAggregate: (metric: AggregateMetric): FakeQuery => results[metric],
}))

vi.mock('next/link', () => ({
  default: ({ href, children }: { href: string; children: ReactNode }) => (
    <a href={href}>{children}</a>
  ),
}))

const { HealthStrip } = await import('./health-strip')

/** A baseline non-loading, non-error result with empty data for one metric. */
function ready(data: unknown = []): FakeQuery {
  return { data, isLoading: false, isError: false }
}

const BASE_QUERY: LogQuery = { source: 'loki' }

beforeEach(() => {
  results = {
    volume: ready(),
    errorRate: ready(),
    latency: ready(),
    statusMix: ready(),
  }
})

afterEach(() => {
  cleanup()
  vi.clearAllMocks()
})

describe('HealthStrip', () => {
  /** Any failing aggregate query short-circuits to the error banner. */
  it('renders the error banner when an aggregate query fails', () => {
    results.latency = { isLoading: false, isError: true }
    render(<HealthStrip query={BASE_QUERY} />)
    expect(
      screen.getByText('Failed to load metrics. Check that the API is reachable, then retry.'),
    ).toBeInTheDocument()
  })

  /** While any query loads, five skeleton tiles render (never the data tiles). */
  it('renders skeleton tiles while loading', () => {
    results.volume = { isLoading: true, isError: false }
    render(<HealthStrip query={BASE_QUERY} />)
    expect(screen.queryByText('TRAFFIC')).not.toBeInTheDocument()
    expect(screen.queryByText('SLO 99.9% (30d)')).not.toBeInTheDocument()
  })

  /** With no requests and no volume, the action-oriented empty prompt shows. */
  it('renders the empty prompt when the window has no logs', () => {
    render(<HealthStrip query={BASE_QUERY} />)
    expect(screen.getByText('No logs in this window yet.')).toBeInTheDocument()
    const link = screen.getByRole('link', { name: /Fire one from the Trigger Center/ })
    expect(link).toHaveAttribute('href', '/trigger')
  })

  /** A populated window renders the five tiles; high error/fatal flips danger. */
  it('renders the five golden-signal tiles for a populated window', () => {
    const statusMix: StatusMixRow[] = [
      { bucket: '2026-01-01T00:00:00Z', s2xx: 5, s3xx: 0, s4xx: 0, s5xx: 0 },
      { bucket: '2026-01-01T00:01:00Z', s2xx: 90, s3xx: 0, s4xx: 5, s5xx: 0 },
    ]
    const volume: VolumeRow[] = [
      { bucket: '2026-01-01T00:00:00Z', level: 'info', n: 50 },
      { bucket: '2026-01-01T00:00:00Z', level: 'error', n: 3 },
      { bucket: '2026-01-01T00:01:00Z', level: 'fatal', n: 1 },
    ]
    const errorRate: ErrorRateRow[] = [
      { bucket: '2026-01-01T00:00:00Z', errorRate: 0.02 },
      { bucket: '2026-01-01T00:01:00Z', errorRate: 0.05 },
      // A null bucket exercises the `r.errorRate ?? 0` fallback in the series map.
      { bucket: '2026-01-01T00:02:00Z', errorRate: null },
    ]
    const latency: LatencyRow[] = [
      { bucket: '2026-01-01T00:00:00Z', p50: 10, p95: 120, p99: 300 },
      { bucket: '2026-01-01T00:01:00Z', p50: 12, p95: 1500, p99: 4000 },
      // A null p95 exercises the `r.p95 ?? 0` fallback in the latency series.
      { bucket: '2026-01-01T00:02:00Z', p50: null, p95: null, p99: null },
    ]
    results = {
      volume: ready(volume),
      errorRate: ready(errorRate),
      latency: ready(latency),
      statusMix: ready(statusMix),
    }
    render(
      <HealthStrip
        query={{ source: 'loki', from: '2026-01-01T00:00:00Z', to: '2026-01-01T00:02:00Z' }}
      />,
    )
    expect(screen.getByText('TRAFFIC')).toBeInTheDocument()
    expect(screen.getByText('ERRORS')).toBeInTheDocument()
    expect(screen.getByText('LATENCY')).toBeInTheDocument()
    expect(screen.getByText('FATAL+ERROR')).toBeInTheDocument()
    expect(screen.getByText('SLO 99.9% (30d)')).toBeInTheDocument()
    // errRate 0.035 > 1% threshold → ERRORS tile shows the percentage and is in danger.
    expect(screen.getByText('3.50%')).toBeInTheDocument()
    // 4 error+fatal rows summed → FATAL+ERROR is non-zero (danger path).
    expect(screen.getByText('4')).toBeInTheDocument()
  })

  /** A populated, healthy window keeps the non-danger tiles (below thresholds). */
  it('renders non-danger tiles when error rate and fatals are zero', () => {
    const statusMix: StatusMixRow[] = [
      { bucket: '2026-01-01T00:00:00Z', s2xx: 100, s3xx: 0, s4xx: 0, s5xx: 0 },
    ]
    const volume: VolumeRow[] = [{ bucket: '2026-01-01T00:00:00Z', level: 'info', n: 100 }]
    const errorRate: ErrorRateRow[] = [{ bucket: '2026-01-01T00:00:00Z', errorRate: 0 }]
    const latency: LatencyRow[] = [{ bucket: '2026-01-01T00:00:00Z', p50: 5, p95: 40, p99: 90 }]
    results = {
      volume: ready(volume),
      errorRate: ready(errorRate),
      latency: ready(latency),
      statusMix: ready(statusMix),
    }
    render(<HealthStrip query={BASE_QUERY} />)
    expect(screen.getByText('0.00%')).toBeInTheDocument()
    expect(screen.getByText('FATAL+ERROR')).toBeInTheDocument()
  })

  /** Undefined aggregate payloads fall back to empty arrays (the `?? []` guards). */
  it('treats undefined aggregate payloads as empty', () => {
    results = {
      volume: { data: undefined, isLoading: false, isError: false },
      errorRate: { data: undefined, isLoading: false, isError: false },
      latency: { data: undefined, isLoading: false, isError: false },
      statusMix: { data: undefined, isLoading: false, isError: false },
    }
    render(<HealthStrip query={BASE_QUERY} />)
    expect(screen.getByText('No logs in this window yet.')).toBeInTheDocument()
  })

  /**
   * The ERRORS tile is in danger when errRate > 1% (ERROR_RATE_THRESHOLD).
   * Asserting the destructive class kills mutations to the threshold constant
   * and to the `>` comparison operator.
   */
  it('marks the ERRORS tile value as destructive when the error rate exceeds 1%', () => {
    const statusMix = [{ bucket: 'b', s2xx: 90, s3xx: 0, s4xx: 5, s5xx: 5 }]
    const volume = [{ bucket: 'b', level: 'info', n: 100 }]
    // errRate = 0.05 (5%) > 0.01 threshold → danger=true.
    const errorRate = [{ bucket: 'b', errorRate: 0.05 }]
    const latency = [{ bucket: 'b', p50: 10, p95: 50, p99: 80 }]
    results = {
      volume: ready(volume),
      errorRate: ready(errorRate),
      latency: ready(latency),
      statusMix: ready(statusMix),
    }
    render(<HealthStrip query={BASE_QUERY} />)
    const errValue = screen.getByText('5.00%')
    expect(errValue.className).toContain('text-destructive')
  })

  /**
   * The ERRORS tile is NOT in danger when errRate is exactly 1% (strict `>`).
   * This kills the `> threshold` → `>= threshold` mutation.
   */
  it('does not mark the ERRORS tile as danger when the error rate is exactly 1%', () => {
    const statusMix = [{ bucket: 'b', s2xx: 99, s3xx: 0, s4xx: 1, s5xx: 0 }]
    const volume = [{ bucket: 'b', level: 'info', n: 100 }]
    // errRate = 0.01 (1%) — NOT > 0.01 → danger=false.
    const errorRate = [{ bucket: 'b', errorRate: 0.01 }]
    const latency = [{ bucket: 'b', p50: 5, p95: 30, p99: 60 }]
    results = {
      volume: ready(volume),
      errorRate: ready(errorRate),
      latency: ready(latency),
      statusMix: ready(statusMix),
    }
    render(<HealthStrip query={BASE_QUERY} />)
    const errValue = screen.getByText('1.00%')
    expect(errValue.className).not.toContain('text-destructive')
    expect(errValue.className).toContain('text-foreground')
  })

  /**
   * The FATAL+ERROR tile is NOT in danger when fatalError is zero.
   * This kills the `fatalError > 0` → `>= 0` mutation.
   */
  it('does not mark the FATAL+ERROR tile as danger when there are no fatal or error rows', () => {
    const statusMix = [{ bucket: 'b', s2xx: 100, s3xx: 0, s4xx: 0, s5xx: 0 }]
    const volume = [{ bucket: 'b', level: 'info', n: 100 }]
    const errorRate = [{ bucket: 'b', errorRate: 0 }]
    const latency = [{ bucket: 'b', p50: 5, p95: 30, p99: 60 }]
    results = {
      volume: ready(volume),
      errorRate: ready(errorRate),
      latency: ready(latency),
      statusMix: ready(statusMix),
    }
    render(<HealthStrip query={BASE_QUERY} />)
    // fatalError = 0 → danger=false → text-foreground not text-destructive.
    const fatalValue = screen.getByText('0')
    expect(fatalValue.className).not.toContain('text-destructive')
    expect(fatalValue.className).toContain('text-foreground')
  })

  /**
   * A 1-minute absolute window with 60 total requests gives reqPerMin = 60.
   * Asserting "60" kills the `ms / 60_000` → `ms * 60_000` ArithmeticOperator
   * mutation (which makes windowMinutes ≈ 3.6B, driving reqPerMin to ~0 → "0")
   * and also kills mutations to the `from === undefined` / `to === undefined`
   * guards (which would fall back to the 60-minute default and show "1").
   */
  it('displays the correct requests-per-minute for a 1-minute absolute window', () => {
    const statusMix: StatusMixRow[] = [
      { bucket: '2026-06-01T00:00:00Z', s2xx: 60, s3xx: 0, s4xx: 0, s5xx: 0 },
    ]
    const volume: VolumeRow[] = [{ bucket: '2026-06-01T00:00:00Z', level: 'info', n: 1 }]
    const errorRate: ErrorRateRow[] = [{ bucket: '2026-06-01T00:00:00Z', errorRate: 0 }]
    const latency: LatencyRow[] = [{ bucket: '2026-06-01T00:00:00Z', p50: 1, p95: 1, p99: 1 }]
    results = {
      volume: ready(volume),
      errorRate: ready(errorRate),
      latency: ready(latency),
      statusMix: ready(statusMix),
    }
    render(
      <HealthStrip
        query={{ source: 'loki', from: '2026-06-01T00:00:00Z', to: '2026-06-01T00:01:00Z' }}
      />,
    )
    // ms = 60 000; windowMinutes = Math.max(1, 60 000 / 60 000) = 1; reqPerMin = 60/1 = 60.
    expect(screen.getByText('60')).toBeInTheDocument()
  })

  /**
   * A sub-minute window (30 s) is floored to 1 minute by `Math.max`.
   * Asserting "120" (= 120 requests / 1 min) kills the `Math.max` → `Math.min`
   * mutation: with Math.min the window stays 0.5 min, giving reqPerMin = 240.
   */
  it('floors a sub-minute window to 1 minute for the traffic calculation', () => {
    const statusMix: StatusMixRow[] = [
      { bucket: '2026-06-01T00:00:00Z', s2xx: 120, s3xx: 0, s4xx: 0, s5xx: 0 },
    ]
    const volume: VolumeRow[] = [{ bucket: '2026-06-01T00:00:00Z', level: 'info', n: 1 }]
    const errorRate: ErrorRateRow[] = [{ bucket: '2026-06-01T00:00:00Z', errorRate: 0 }]
    const latency: LatencyRow[] = [{ bucket: '2026-06-01T00:00:00Z', p50: 1, p95: 1, p99: 1 }]
    results = {
      volume: ready(volume),
      errorRate: ready(errorRate),
      latency: ready(latency),
      statusMix: ready(statusMix),
    }
    render(
      <HealthStrip
        query={{ source: 'loki', from: '2026-06-01T00:00:00Z', to: '2026-06-01T00:00:30Z' }}
      />,
    )
    // ms = 30 000; ms/60_000 = 0.5; Math.max(1, 0.5) = 1; reqPerMin = 120/1 = 120.
    expect(screen.getByText('120')).toBeInTheDocument()
  })

  /**
   * When no explicit range is set, `windowMinutes` returns `DEFAULT_WINDOW_MINUTES` (60).
   * Asserting "100" (= 6 000 requests / 60 min) kills numeric-literal mutations to the
   * constant (e.g. 60 → 59 gives "102"; 60 → 61 gives "98").
   */
  it('uses the 60-minute default window when no explicit range is set', () => {
    const statusMix: StatusMixRow[] = [{ bucket: 'b', s2xx: 6000, s3xx: 0, s4xx: 0, s5xx: 0 }]
    const volume: VolumeRow[] = [{ bucket: 'b', level: 'info', n: 1 }]
    const errorRate: ErrorRateRow[] = [{ bucket: 'b', errorRate: 0 }]
    const latency: LatencyRow[] = [{ bucket: 'b', p50: 1, p95: 1, p99: 1 }]
    results = {
      volume: ready(volume),
      errorRate: ready(errorRate),
      latency: ready(latency),
      statusMix: ready(statusMix),
    }
    render(<HealthStrip query={BASE_QUERY} />)
    // reqPerMin = 6 000 / 60 = 100 → formatCount(100) = '100'.
    expect(screen.getByText('100')).toBeInTheDocument()
  })
})

describe('HealthStrip — loading skeleton presence', () => {
  /**
   * While any metric is loading the component must render skeleton cards
   * (elements with the `animate-pulse` class). Asserting the skeleton IS
   * present kills three BlockStatement/ObjectLiteral/ArrowFunction mutations
   * on the loading branch:
   * - `if (isLoading) {}`: branch becomes a no-op; no skeleton renders.
   * - `Array.from({})` (ObjectLiteral): no cards produced; no animate-pulse.
   * - `(_, i) => undefined` (ArrowFunction): same effect.
   */
  it('renders at least one skeleton (animate-pulse) tile while loading', () => {
    results.volume = { isLoading: true, isError: false }
    const { container } = render(<HealthStrip query={BASE_QUERY} />)
    expect(container.querySelector('.animate-pulse')).toBeInTheDocument()
  })

  /**
   * Any one of the four aggregate queries loading must be sufficient to show
   * skeletons. This exercises the `||` chain in the `isLoading` derivation.
   */
  it('renders skeletons when only the errorRate query is loading', () => {
    results.errorRate = { isLoading: true, isError: false }
    const { container } = render(<HealthStrip query={BASE_QUERY} />)
    expect(container.querySelector('.animate-pulse')).toBeInTheDocument()
  })
})

describe('HealthStrip — FATAL+ERROR danger styling', () => {
  /**
   * When fatal or error rows exist (`fatalError > 0`) the FATAL+ERROR tile must
   * render its value with the `text-destructive` class. Asserting this kills the
   * ConditionalExpression→false mutation on `danger={fatalError > 0}` which would
   * suppress the danger styling regardless of the count.
   */
  it('marks the FATAL+ERROR tile value as destructive when fatal and error rows are present', () => {
    const statusMix: StatusMixRow[] = [{ bucket: 'b', s2xx: 100, s3xx: 0, s4xx: 0, s5xx: 0 }]
    const volume: VolumeRow[] = [
      { bucket: 'b', level: 'error', n: 2 },
      { bucket: 'b', level: 'fatal', n: 1 },
    ]
    const errorRate: ErrorRateRow[] = [{ bucket: 'b', errorRate: 0 }]
    const latency: LatencyRow[] = [{ bucket: 'b', p50: 5, p95: 20, p99: 40 }]
    results = {
      volume: ready(volume),
      errorRate: ready(errorRate),
      latency: ready(latency),
      statusMix: ready(statusMix),
    }
    render(<HealthStrip query={BASE_QUERY} />)
    // sumLevels(['error', 'fatal']) = 2 + 1 = 3 → danger=true → text-destructive.
    const fatalValue = screen.getByText('3')
    expect(fatalValue.className).toContain('text-destructive')
  })
})

describe('HealthStrip — empty-state guard uses both totalRequests and totalVolume', () => {
  /**
   * When statusMix is empty (`totalRequests === 0`) but volume rows exist
   * (`totalVolume > 0`) the component must NOT show the empty-state prompt —
   * there is real log volume to display.
   *
   * Asserting this kills the ConditionalExpression→true mutation on
   * `totalVolume === 0`: with the mutation, the condition becomes
   * `totalRequests === 0`, which is true here, incorrectly showing the
   * empty-state prompt instead of the tiles.
   */
  it('shows the tiles when volume data exists even if statusMix is empty', () => {
    const volume: VolumeRow[] = [{ bucket: 'b', level: 'info', n: 50 }]
    const errorRate: ErrorRateRow[] = [{ bucket: 'b', errorRate: 0 }]
    const latency: LatencyRow[] = [{ bucket: 'b', p50: 5, p95: 20, p99: 40 }]
    results = {
      volume: ready(volume),
      errorRate: ready(errorRate),
      latency: ready(latency),
      statusMix: ready([]),
    }
    render(<HealthStrip query={BASE_QUERY} />)
    expect(screen.getByText('TRAFFIC')).toBeInTheDocument()
    expect(screen.queryByText('No logs in this window yet.')).not.toBeInTheDocument()
  })
})

describe('HealthStrip — windowMinutes partial-range fallback', () => {
  /**
   * When only `from` is defined (no `to`), `windowMinutes` must fall back to
   * DEFAULT_WINDOW_MINUTES (60). The `||` in `from === undefined || to === undefined`
   * ensures a partially-specified range still uses the default.
   *
   * Asserting the reqPerMin from the 60-minute window kills two mutations:
   * - LogicalOperator `||` → `&&`: with `&&`, `from !== undefined && to === undefined`
   *   evaluates to false so the default is NOT returned, causing NaN arithmetic
   *   and a window of 1 minute → a drastically different traffic figure.
   * - ConditionalExpression→false on `to === undefined`: with the check removed
   *   the condition becomes `from === undefined` only, which is false here, again
   *   skipping the default → same NaN path → wrong traffic figure.
   */
  it('falls back to the 60-minute default window when only the from bound is set', () => {
    const statusMix: StatusMixRow[] = [{ bucket: 'b', s2xx: 3000, s3xx: 0, s4xx: 0, s5xx: 0 }]
    const volume: VolumeRow[] = [{ bucket: 'b', level: 'info', n: 1 }]
    const errorRate: ErrorRateRow[] = [{ bucket: 'b', errorRate: 0 }]
    const latency: LatencyRow[] = [{ bucket: 'b', p50: 1, p95: 1, p99: 1 }]
    results = {
      volume: ready(volume),
      errorRate: ready(errorRate),
      latency: ready(latency),
      statusMix: ready(statusMix),
    }
    // from is defined; to is intentionally absent — windowMinutes must return 60.
    render(<HealthStrip query={{ source: 'loki', from: '2026-01-01T00:00:00Z' }} />)
    // reqPerMin = 3 000 / 60 = 50 → formatCount(50) = '50'.
    // With the ||→&& mutation, window = 1 and reqPerMin = 3 000 → '3.0k'.
    expect(screen.getByText('50')).toBeInTheDocument()
  })
})
