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
})
