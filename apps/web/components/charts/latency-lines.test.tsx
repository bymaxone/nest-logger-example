/**
 * @fileoverview Component tests for {@link LatencyLines} — the RED "Duration" panel.
 *
 * The TanStack Query data hook (`@/hooks/use-aggregate`) is the mocked network
 * boundary; tests drive the loading skeleton, the empty `data ?? []` branch and
 * the populated path with the p50/p95/p99 series plus a formatted tooltip label.
 * Assertions query the real rendered output.
 *
 * @module components/charts/latency-lines.test
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import type { ReactElement } from 'react'

import type { LatencyRow, LogQuery } from '@/lib/types'
import { formatBucket } from '@/lib/metrics'

/** Mutable value the mocked `useAggregate` returns; set per test before render. */
let aggregateState: { data: LatencyRow[] | undefined; isLoading: boolean } = {
  data: [],
  isLoading: false,
}

vi.mock('@/hooks/use-aggregate', () => ({
  useAggregate: () => aggregateState,
}))

// Imported after the mock so the component binds the mocked hook.
const { LatencyLines } = await import('./latency-lines')

/** A stable query object; its contents are irrelevant because the hook is mocked. */
const query: LogQuery = { source: 'postgres' }

/** Wrap a tree in a fresh QueryClient (retries off so failures surface at once). */
function renderWithClient(ui: ReactElement): ReturnType<typeof render> {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(<QueryClientProvider client={queryClient}>{ui}</QueryClientProvider>)
}

beforeEach(() => {
  aggregateState = { data: [], isLoading: false }
})

afterEach(() => {
  cleanup()
  vi.clearAllMocks()
})

describe('LatencyLines', () => {
  /** While the aggregate is loading, the panel shows the skeleton, not a chart. */
  it('renders a loading skeleton while the aggregate is loading', () => {
    aggregateState = { data: undefined, isLoading: true }
    const { container } = renderWithClient(<LatencyLines query={query} />)
    expect(container.querySelector('.animate-pulse')).toBeInTheDocument()
    expect(container.querySelector('.recharts-line')).toBeNull()
  })

  /** With no data the chart still mounts (the `data ?? []` empty branch). */
  it('renders the chart container with an empty series', () => {
    aggregateState = { data: [], isLoading: false }
    const { container } = renderWithClient(<LatencyLines query={query} />)
    expect(container.querySelector('.recharts-surface')).toBeInTheDocument()
    expect(container.querySelector('.animate-pulse')).toBeNull()
  })

  /**
   * When the query settles with no payload (`data === undefined`, not loading)
   * the `data ?? []` nullish fallback keeps the chart mounting without throwing.
   */
  it('falls back to an empty series when data is undefined', () => {
    aggregateState = { data: undefined, isLoading: false }
    const { container } = renderWithClient(<LatencyLines query={query} />)
    expect(container.querySelector('.recharts-surface')).toBeInTheDocument()
    expect(container.querySelector('.animate-pulse')).toBeNull()
  })

  /** Populated buckets draw all three percentile series (p50, p95, p99). */
  it('draws the p50, p95 and p99 percentile lines for populated data', () => {
    aggregateState = {
      data: [
        { bucket: '2026-06-05T10:00:00.000Z', p50: 20, p95: 80, p99: 140 },
        { bucket: '2026-06-05T10:05:00.000Z', p50: 25, p95: 90, p99: 160 },
      ],
      isLoading: false,
    }
    const { container } = renderWithClient(<LatencyLines query={query} />)
    expect(container.querySelectorAll('.recharts-line').length).toBe(3)
  })

  /**
   * Activating the Tooltip runs its `labelFormatter`, proving the formatter is
   * wired and the populated branch is exercised end to end.
   */
  it('renders the formatted tooltip label for the focused bucket', () => {
    aggregateState = {
      data: [
        { bucket: '2026-06-05T10:00:00.000Z', p50: 20, p95: 80, p99: 140 },
        { bucket: '2026-06-05T10:05:00.000Z', p50: 25, p95: 90, p99: 160 },
      ],
      isLoading: false,
    }
    const { container } = renderWithClient(<LatencyLines query={query} />)
    const surface = container.querySelector('.recharts-surface')
    expect(surface).not.toBeNull()
    fireEvent.focus(surface as Element)
    fireEvent.keyDown(surface as Element, { key: 'ArrowRight' })
    const label = container.querySelector('.recharts-tooltip-label')
    expect(label).not.toBeNull()
    expect(label).toHaveTextContent(formatBucket('2026-06-05T10:05:00.000Z'))
  })
})
