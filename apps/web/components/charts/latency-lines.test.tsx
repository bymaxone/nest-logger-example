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
import type { ReactElement, ReactNode } from 'react'

import type { LatencyRow, LogQuery } from '@/lib/types'
import { formatBucket } from '@/lib/metrics'

/** Mutable value the mocked `useAggregate` returns; set per test before render. */
let aggregateState: { data: LatencyRow[] | undefined; isLoading: boolean } = {
  data: [],
  isLoading: false,
}

/** The metric name the component passes to `useAggregate`, captured per render. */
let capturedAggregateMetric: string | undefined

vi.mock('@/hooks/use-aggregate', () => ({
  useAggregate: (metric: string) => {
    capturedAggregateMetric = metric
    return aggregateState
  },
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
  capturedAggregateMetric = undefined
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

  /** The panel reads the `latency` aggregate metric (StringLiteral→"" mutation). */
  it('queries the latency aggregate metric', () => {
    aggregateState = { data: [], isLoading: false }
    renderWithClient(<LatencyLines query={query} />)
    expect(capturedAggregateMetric).toBe('latency')
  })
})

describe('LatencyLines — recharts prop wiring (stubbed recharts)', () => {
  /** Captured recharts props for the chart, grid and line primitives. */
  let lineChartProps: { data?: unknown[]; margin?: unknown } | undefined
  let gridProps: { vertical?: unknown } | undefined
  let lineProps: { dot?: unknown; isAnimationActive?: unknown } | undefined

  /** A small populated series so the chart primitives mount. */
  const rows: LatencyRow[] = [{ bucket: '2026-06-05T10:00:00.000Z', p50: 20, p95: 80, p99: 140 }]

  /** Re-import the component with the stubbed recharts bound for this block only. */
  async function importWithStubbedRecharts(): Promise<typeof import('./latency-lines')> {
    vi.resetModules()
    vi.doMock('recharts', () => ({
      ResponsiveContainer: ({ children }: { children?: ReactNode }) => <div>{children}</div>,
      LineChart: (props: { children?: ReactNode; data?: unknown[]; margin?: unknown }) => {
        lineChartProps = props
        return <div>{props.children}</div>
      },
      Line: (props: { dot?: unknown; isAnimationActive?: unknown }) => {
        lineProps = props
        return null
      },
      CartesianGrid: (props: { vertical?: unknown }) => {
        gridProps = props
        return null
      },
      XAxis: () => null,
      YAxis: () => null,
      Tooltip: () => null,
    }))
    return import('./latency-lines')
  }

  afterEach(() => {
    lineChartProps = undefined
    gridProps = undefined
    lineProps = undefined
    vi.doUnmock('recharts')
    vi.resetModules()
  })

  /**
   * The chart wiring is fixed: the exact margins object and no vertical grid lines.
   * Asserting these kills the ObjectLiteral→{} mutation on `margin` and the
   * BooleanLiteral→true mutation on `vertical={false}`.
   */
  it('passes the fixed margins and hides vertical grid lines', async () => {
    aggregateState = { data: rows, isLoading: false }
    const { LatencyLines: StubbedLatencyLines } = await importWithStubbedRecharts()
    renderWithClient(<StubbedLatencyLines query={query} />)
    expect(lineChartProps?.margin).toEqual({ top: 4, right: 8, bottom: 0, left: 0 })
    expect(gridProps?.vertical).toBe(false)
  })

  /**
   * The percentile lines draw no point markers and run no entry animation. Asserting
   * both kills the BooleanLiteral→true mutations on `dot={false}` and
   * `isAnimationActive={false}`.
   */
  it('renders the percentile lines with dots and animation disabled', async () => {
    aggregateState = { data: rows, isLoading: false }
    const { LatencyLines: StubbedLatencyLines } = await importWithStubbedRecharts()
    renderWithClient(<StubbedLatencyLines query={query} />)
    expect(lineProps?.dot).toBe(false)
    expect(lineProps?.isAnimationActive).toBe(false)
  })

  /**
   * When the loaded data is undefined the `data ?? []` fallback yields an empty
   * series, so the LineChart receives no points. Asserting the empty array kills the
   * ArrayDeclaration→["Stryker was here"] mutation, which would feed one phantom point.
   */
  it('falls back to an empty series when the loaded data is undefined', async () => {
    aggregateState = { data: undefined, isLoading: false }
    const { LatencyLines: StubbedLatencyLines } = await importWithStubbedRecharts()
    renderWithClient(<StubbedLatencyLines query={query} />)
    expect(lineChartProps?.data).toEqual([])
  })
})
