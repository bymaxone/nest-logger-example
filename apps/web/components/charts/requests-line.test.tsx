/**
 * @fileoverview Component tests for {@link RequestsLine} — the RED "Rate" panel.
 *
 * The TanStack Query data hook (`@/hooks/use-aggregate`) is the mocked network
 * boundary; each test drives one of the hook's branches (loading skeleton,
 * empty data, populated series) and asserts the real rendered output via
 * Testing Library queries — never on fabricated class names.
 *
 * @module components/charts/requests-line.test
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import type { ReactElement, ReactNode } from 'react'

import type { LogQuery, StatusMixRow } from '@/lib/types'
import { formatBucket } from '@/lib/metrics'

/** Mutable value the mocked `useAggregate` returns; set per test before render. */
let aggregateState: { data: StatusMixRow[] | undefined; isLoading: boolean } = {
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
const { RequestsLine } = await import('./requests-line')

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

describe('RequestsLine', () => {
  /** While the aggregate is loading, the panel shows the skeleton, not a chart. */
  it('renders a loading skeleton while the aggregate is loading', () => {
    aggregateState = { data: undefined, isLoading: true }
    const { container } = renderWithClient(<RequestsLine query={query} />)
    expect(container.querySelector('.animate-pulse')).toBeInTheDocument()
    expect(container.querySelector('.recharts-line')).toBeNull()
  })

  /** With no data the chart still mounts (empty series — the `data ?? []` branch). */
  it('renders the chart container with an empty series', () => {
    aggregateState = { data: [], isLoading: false }
    const { container } = renderWithClient(<RequestsLine query={query} />)
    expect(container.querySelector('.recharts-surface')).toBeInTheDocument()
    expect(container.querySelector('.animate-pulse')).toBeNull()
  })

  /**
   * With populated buckets the requests line and its bucket tick labels render,
   * and activating the Tooltip runs its `labelFormatter` — proving `statusTotals`
   * and the `formatBucket` tick/label formatters are wired through.
   */
  it('renders the requests line and the formatted tooltip label for populated data', () => {
    aggregateState = {
      data: [
        { bucket: '2026-06-05T10:00:00.000Z', s2xx: 5, s3xx: 1, s4xx: 2, s5xx: 0 },
        { bucket: '2026-06-05T10:05:00.000Z', s2xx: 8, s3xx: 0, s4xx: 1, s5xx: 1 },
      ],
      isLoading: false,
    }
    const { container } = renderWithClient(<RequestsLine query={query} />)
    expect(container.querySelector('.recharts-line')).toBeInTheDocument()
    // formatBucket renders an HH:MM tick for each bucket; at least one tick is shown.
    expect(container.querySelectorAll('.recharts-cartesian-axis-tick').length).toBeGreaterThan(0)
    // Keyboard navigation activates the Tooltip deterministically (recharts a11y
    // layer), which runs the `labelFormatter` over the focused bucket.
    const surface = container.querySelector('.recharts-surface')
    expect(surface).not.toBeNull()
    fireEvent.focus(surface as Element)
    fireEvent.keyDown(surface as Element, { key: 'ArrowRight' })
    const label = container.querySelector('.recharts-tooltip-label')
    expect(label).not.toBeNull()
    expect(label).toHaveTextContent(formatBucket('2026-06-05T10:05:00.000Z'))
  })

  /** The panel derives requests from the `statusMix` metric (StringLiteral→"" mutation). */
  it('queries the statusMix aggregate metric', () => {
    aggregateState = { data: [], isLoading: false }
    renderWithClient(<RequestsLine query={query} />)
    expect(capturedAggregateMetric).toBe('statusMix')
  })
})

describe('RequestsLine — recharts prop wiring (stubbed recharts)', () => {
  /** Captured recharts props for the chart, grid, axis and line primitives. */
  let lineChartProps: { data?: unknown[]; margin?: unknown } | undefined
  let gridProps: { vertical?: unknown } | undefined
  let yAxisProps: { allowDecimals?: unknown } | undefined
  let lineProps: { dot?: unknown; isAnimationActive?: unknown } | undefined

  /** A small populated series so the chart primitives mount. */
  const rows: StatusMixRow[] = [
    { bucket: '2026-06-05T10:00:00.000Z', s2xx: 5, s3xx: 1, s4xx: 2, s5xx: 0 },
  ]

  /** Re-import the component with the stubbed recharts bound for this block only. */
  async function importWithStubbedRecharts(): Promise<typeof import('./requests-line')> {
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
      YAxis: (props: { allowDecimals?: unknown }) => {
        yAxisProps = props
        return null
      },
      Tooltip: () => null,
    }))
    return import('./requests-line')
  }

  afterEach(() => {
    lineChartProps = undefined
    gridProps = undefined
    yAxisProps = undefined
    lineProps = undefined
    vi.doUnmock('recharts')
    vi.resetModules()
  })

  /**
   * The chart wiring is fixed: the exact margins object, no vertical grid lines, and
   * integer-only Y ticks. Asserting these kills the ObjectLiteral→{} mutation on
   * `margin` and the BooleanLiteral→true mutations on `vertical={false}` /
   * `allowDecimals={false}`.
   */
  it('passes the fixed margins, hides vertical grid lines and disables Y decimals', async () => {
    aggregateState = { data: rows, isLoading: false }
    const { RequestsLine: StubbedRequestsLine } = await importWithStubbedRecharts()
    renderWithClient(<StubbedRequestsLine query={query} />)
    expect(lineChartProps?.margin).toEqual({ top: 4, right: 8, bottom: 0, left: 0 })
    expect(gridProps?.vertical).toBe(false)
    expect(yAxisProps?.allowDecimals).toBe(false)
  })

  /**
   * The requests line draws no point markers and runs no entry animation. Asserting
   * both kills the BooleanLiteral→true mutations on `dot={false}` and
   * `isAnimationActive={false}`.
   */
  it('renders the requests line with dots and animation disabled', async () => {
    aggregateState = { data: rows, isLoading: false }
    const { RequestsLine: StubbedRequestsLine } = await importWithStubbedRecharts()
    renderWithClient(<StubbedRequestsLine query={query} />)
    expect(lineProps?.dot).toBe(false)
    expect(lineProps?.isAnimationActive).toBe(false)
  })

  /**
   * When the loaded data is undefined the `data ?? []` fallback totals an empty
   * series, so the LineChart receives no points. Asserting the empty array kills the
   * ArrayDeclaration→["Stryker was here"] mutation, which would feed one phantom point.
   */
  it('totals an empty series when the loaded data is undefined', async () => {
    aggregateState = { data: undefined, isLoading: false }
    const { RequestsLine: StubbedRequestsLine } = await importWithStubbedRecharts()
    renderWithClient(<StubbedRequestsLine query={query} />)
    expect(lineChartProps?.data).toEqual([])
  })
})
