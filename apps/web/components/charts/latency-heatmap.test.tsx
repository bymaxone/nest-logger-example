/**
 * @fileoverview Component tests for {@link LatencyHeatmap} — the loading skeleton,
 * the empty-buckets message, the slow-request stat sourced from the `logKey` facet,
 * and the per-cell `heatColor` bucketing (null / max-zero floor vs intensity scale).
 *
 * The two data hooks (`@/hooks/use-aggregate`, `@/hooks/use-facets`) are mocked so
 * each test drives one branch; rendering is asserted via Testing Library queries.
 *
 * @module components/charts/latency-heatmap.test
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, render, screen } from '@testing-library/react'

import type { FacetsResult, LatencyRow } from '@/lib/types'

/** Mutable returns the mocked hooks yield; reset per test before render. */
let aggregateReturn: { data: LatencyRow[] | undefined; isLoading: boolean } = {
  data: [],
  isLoading: false,
}
let facetsReturn: { data: FacetsResult | undefined } = { data: undefined }

vi.mock('@/hooks/use-aggregate', () => ({
  useAggregate: () => aggregateReturn,
}))

vi.mock('@/hooks/use-facets', () => ({
  useFacets: () => facetsReturn,
}))

const { LatencyHeatmap } = await import('./latency-heatmap')

/** A query is only an identity token here; the hooks are mocked, so any value works. */
const query = { source: 'loki' } as const

beforeEach(() => {
  aggregateReturn = { data: [], isLoading: false }
  facetsReturn = { data: undefined }
})

afterEach(() => {
  cleanup()
  vi.clearAllMocks()
})

describe('LatencyHeatmap', () => {
  /** While the latency query is loading, only the skeleton renders (no stat, no grid). */
  it('renders the skeleton while latency is loading', () => {
    aggregateReturn = { data: undefined, isLoading: true }
    render(<LatencyHeatmap query={query} />)
    expect(screen.queryByText(/Slow reqs/)).not.toBeInTheDocument()
    expect(screen.queryByText('p99')).not.toBeInTheDocument()
    expect(screen.queryByText('No latency samples in this window.')).not.toBeInTheDocument()
  })

  /** With no buckets the empty-window message replaces the cell grid. */
  it('shows the empty message when there are no latency buckets', () => {
    aggregateReturn = { data: [], isLoading: false }
    render(<LatencyHeatmap query={query} />)
    expect(screen.getByText('No latency samples in this window.')).toBeInTheDocument()
  })

  /** An undefined (loaded) data payload falls back to an empty bucket list (`data ?? []`). */
  it('falls back to an empty bucket list when loaded data is undefined', () => {
    aggregateReturn = { data: undefined, isLoading: false }
    render(<LatencyHeatmap query={query} />)
    expect(screen.getByText('No latency samples in this window.')).toBeInTheDocument()
  })

  /** A missing facet result defaults the slow-request count to zero. */
  it('defaults the slow-request count to zero when the facet is absent', () => {
    facetsReturn = { data: undefined }
    render(<LatencyHeatmap query={query} />)
    expect(screen.getByText('0')).toBeInTheDocument()
  })

  /** The slow count is read from the METHOD_SLOW_EXECUTION logKey facet value. */
  it('reads the slow-request count from the METHOD_SLOW_EXECUTION facet', () => {
    facetsReturn = {
      data: {
        logKey: [
          { value: 'OTHER_KEY', count: 99 },
          { value: 'METHOD_SLOW_EXECUTION', count: 7 },
        ],
      },
    }
    render(<LatencyHeatmap query={query} />)
    expect(screen.getByText('7')).toBeInTheDocument()
  })

  /**
   * Populated buckets render one cell per percentile row; `heatColor` colours each
   * cell — covering the null branch (floor colour), the max-derived intensity, and
   * the value tooltips (formatted vs the em-dash for null).
   */
  it('renders the percentile grid colouring cells by intensity and null', () => {
    aggregateReturn = {
      data: [
        { bucket: '2026-06-05T10:00:00.000Z', p50: 100, p95: 200, p99: 400 },
        { bucket: '2026-06-05T10:01:00.000Z', p50: null, p95: 50, p99: null },
      ],
      isLoading: false,
    }
    const { container } = render(<LatencyHeatmap query={query} />)

    // Three percentile labels are present (p99 / p95 / p50).
    expect(screen.getByText('p99')).toBeInTheDocument()
    expect(screen.getByText('p95')).toBeInTheDocument()
    expect(screen.getByText('p50')).toBeInTheDocument()

    // A non-null max cell gets the saturated red tint; a null cell gets the floor.
    const cells = container.querySelectorAll('div[title]')
    const maxCell = [...cells].find((c) => c.getAttribute('title')?.includes('p99 400ms'))
    const nullCell = [...cells].find(
      (c) => c.getAttribute('title')?.includes('p99') && c.getAttribute('title')?.includes('—'),
    )
    expect(maxCell).toBeDefined()
    expect(nullCell).toBeDefined()
    expect((maxCell as HTMLElement).style.background).toBe('rgba(239, 68, 68, 0.9)')
    expect((nullCell as HTMLElement).style.background).toBe('rgba(255, 255, 255, 0.04)')
  })

  /**
   * When every p99 is null the grid max is zero, so even non-null cells fall to the
   * floor colour — the `max === 0` branch of `heatColor`.
   */
  it('floors every cell when the grid max is zero', () => {
    aggregateReturn = {
      data: [{ bucket: '2026-06-05T10:00:00.000Z', p50: 0, p95: 0, p99: null }],
      isLoading: false,
    }
    const { container } = render(<LatencyHeatmap query={query} />)
    const cells = container.querySelectorAll('div[title]')
    expect(cells.length).toBe(3)
    for (const cell of cells) {
      expect((cell as HTMLElement).style.background).toBe('rgba(255, 255, 255, 0.04)')
    }
  })
})
