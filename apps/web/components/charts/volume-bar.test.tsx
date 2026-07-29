/**
 * @fileoverview Component tests for {@link VolumeBar} — the brushable volume panel.
 *
 * The TanStack Query data hook (`@/hooks/use-aggregate`) is the mocked network
 * boundary; tests drive the loading skeleton, the empty `data ?? []` branch, the
 * per-level stacked bars, the formatted tooltip label, and the Brush `onChange`
 * handler that lifts the brushed range to the URL. Assertions query the real
 * rendered output.
 *
 * @module components/charts/volume-bar.test
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import type { ReactElement, ReactNode } from 'react'

import type { LogQuery, VolumeRow } from '@/lib/types'
import { formatBucket } from '@/lib/metrics'

/** Mutable value the mocked `useAggregate` returns; set per test before render. */
let aggregateState: { data: VolumeRow[] | undefined; isLoading: boolean } = {
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
const { VolumeBar } = await import('./volume-bar')

/** A stable query object; its contents are irrelevant because the hook is mocked. */
const query: LogQuery = { source: 'postgres' }

/** A small three-bucket, two-level volume series for the populated tests. */
const volumeRows: VolumeRow[] = [
  { bucket: '2026-06-05T10:00:00.000Z', level: 'info', n: 10 },
  { bucket: '2026-06-05T10:00:00.000Z', level: 'error', n: 2 },
  { bucket: '2026-06-05T10:05:00.000Z', level: 'info', n: 8 },
  { bucket: '2026-06-05T10:05:00.000Z', level: 'error', n: 1 },
  { bucket: '2026-06-05T10:10:00.000Z', level: 'info', n: 6 },
]

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

describe('VolumeBar', () => {
  /** While the aggregate is loading, the panel shows the skeleton, not a chart. */
  it('renders a loading skeleton while the aggregate is loading', () => {
    aggregateState = { data: undefined, isLoading: true }
    const { container } = renderWithClient(<VolumeBar query={query} onBrush={vi.fn()} />)
    expect(container.querySelector('.animate-pulse')).toBeInTheDocument()
    expect(container.querySelector('.recharts-bar')).toBeNull()
  })

  /** The panel reads the `volume` aggregate metric (StringLiteral→"" mutation). */
  it('queries the volume aggregate metric', () => {
    aggregateState = { data: volumeRows, isLoading: false }
    renderWithClient(<VolumeBar query={query} onBrush={vi.fn()} />)
    expect(capturedAggregateMetric).toBe('volume')
  })

  /** With no data the chart still mounts (the `data ?? []` empty branch). */
  it('renders the chart container with an empty series', () => {
    aggregateState = { data: [], isLoading: false }
    const { container } = renderWithClient(<VolumeBar query={query} onBrush={vi.fn()} />)
    expect(container.querySelector('.recharts-surface')).toBeInTheDocument()
    expect(container.querySelector('.animate-pulse')).toBeNull()
  })

  /** Populated buckets draw a stacked bar series per level present in the data. */
  it('draws the stacked level bars for populated data', () => {
    aggregateState = { data: volumeRows, isLoading: false }
    const { container } = renderWithClient(<VolumeBar query={query} onBrush={vi.fn()} />)
    // One <Bar> group renders per declared stack level (six levels).
    expect(container.querySelectorAll('.recharts-bar').length).toBe(6)
  })

  /**
   * Activating the Tooltip runs its `labelFormatter`, proving the formatter is
   * wired and the populated branch is exercised end to end.
   */
  it('renders the formatted tooltip label for the focused bucket', () => {
    aggregateState = { data: volumeRows, isLoading: false }
    const { container } = renderWithClient(<VolumeBar query={query} onBrush={vi.fn()} />)
    const surface = container.querySelector('.recharts-surface')
    expect(surface).not.toBeNull()
    fireEvent.focus(surface as Element)
    fireEvent.keyDown(surface as Element, { key: 'ArrowRight' })
    const label = container.querySelector('.recharts-tooltip-label')
    expect(label).not.toBeNull()
    expect(label).toHaveTextContent(formatBucket('2026-06-05T10:05:00.000Z'))
  })

  /**
   * Dragging the Brush traveller fires `onChange`, which lifts the brushed
   * bucket range to `onBrush(from, to)` — the core "brush → filter" payoff.
   */
  it('lifts the brushed bucket range through onBrush', () => {
    aggregateState = { data: volumeRows, isLoading: false }
    const onBrush = vi.fn<(from: string, to: string) => void>()
    const { container } = renderWithClient(<VolumeBar query={query} onBrush={onBrush} />)
    const travellers = container.querySelectorAll('.recharts-brush-traveller')
    expect(travellers.length).toBeGreaterThan(0)
    // Drag the right traveller leftwards to shrink the selected window; recharts
    // binds its move/up listeners on `document`, so the drag is driven there.
    const right = travellers[travellers.length - 1] as Element
    fireEvent.mouseDown(right, { clientX: 700 })
    fireEvent.mouseMove(document, { clientX: 300 })
    fireEvent.mouseUp(document)
    expect(onBrush).toHaveBeenCalled()
    // The prior assertion guarantees at least one call, so the first is defined.
    const [from, to] = onBrush.mock.calls[0]!
    expect(typeof from).toBe('string')
    expect(typeof to).toBe('string')
    // The lifted range maps back to real buckets from the brushed indices.
    expect(volumeRows.some((r) => r.bucket === from)).toBe(true)
    expect(volumeRows.some((r) => r.bucket === to)).toBe(true)
  })
})

describe('VolumeBar — Brush onChange index fallbacks (stubbed recharts)', () => {
  /**
   * A real traveller drag always supplies both indices, so the `?? 0` /
   * `?? points.length - 1` fallbacks and the missing-point guard are reachable
   * only by invoking the `onChange` prop directly. The stub captures it; the
   * surrounding chart primitives render pass-through containers.
   */
  let brushOnChange: ((range: { startIndex?: number; endIndex?: number }) => void) | undefined
  /** Captured recharts props, asserted to lock the chart wiring. */
  let barChartProps: { data?: unknown[]; margin?: unknown } | undefined
  let gridProps: { vertical?: unknown } | undefined
  let yAxisProps: { allowDecimals?: unknown } | undefined

  /** Re-import the component with the stubbed recharts bound for this block only. */
  async function importWithStubbedRecharts(): Promise<typeof import('./volume-bar')> {
    vi.resetModules()
    vi.doMock('recharts', () => ({
      ResponsiveContainer: ({ children }: { children?: ReactNode }) => <div>{children}</div>,
      BarChart: (props: { children?: ReactNode; data?: unknown[]; margin?: unknown }) => {
        barChartProps = props
        return <div>{props.children}</div>
      },
      Bar: () => null,
      Brush: (props: { onChange?: (r: { startIndex?: number; endIndex?: number }) => void }) => {
        brushOnChange = props.onChange
        return null
      },
      CartesianGrid: (props: { vertical?: unknown }) => {
        gridProps = props
        return null
      },
      Tooltip: () => null,
      XAxis: () => null,
      YAxis: (props: { allowDecimals?: unknown }) => {
        yAxisProps = props
        return null
      },
    }))
    return import('./volume-bar')
  }

  afterEach(() => {
    brushOnChange = undefined
    barChartProps = undefined
    gridProps = undefined
    yAxisProps = undefined
    vi.doUnmock('recharts')
    vi.resetModules()
  })

  /** Without indices the brushed range falls back to the full series window. */
  it('lifts the full bucket range when the change event carries no indices', async () => {
    aggregateState = { data: volumeRows, isLoading: false }
    const { VolumeBar: StubbedVolumeBar } = await importWithStubbedRecharts()
    const onBrush = vi.fn<(from: string, to: string) => void>()
    renderWithClient(<StubbedVolumeBar query={query} onBrush={onBrush} />)
    expect(brushOnChange).toBeDefined()
    brushOnChange!({})
    expect(onBrush).toHaveBeenCalledWith('2026-06-05T10:00:00.000Z', '2026-06-05T10:10:00.000Z')
  })

  /** With an empty series the fallback indices resolve no points, so nothing is lifted. */
  it('does not lift a range when there are no points', async () => {
    aggregateState = { data: [], isLoading: false }
    const { VolumeBar: StubbedVolumeBar } = await importWithStubbedRecharts()
    const onBrush = vi.fn<(from: string, to: string) => void>()
    renderWithClient(<StubbedVolumeBar query={query} onBrush={onBrush} />)
    expect(brushOnChange).toBeDefined()
    brushOnChange!({})
    expect(onBrush).not.toHaveBeenCalled()
  })

  /**
   * Both ends of the brushed window must resolve before lifting: when only the
   * start index maps to a point (the end index is out of range) the guard must
   * block the call without throwing. This kills the `&&`→`||` LogicalOperator
   * mutation and the ConditionalExpression→true mutation on the right operand
   * (`end !== undefined`), both of which would call `onBrush` and dereference the
   * undefined end point.
   */
  it('does not lift a range when only the start index resolves to a point', async () => {
    aggregateState = { data: volumeRows, isLoading: false }
    const { VolumeBar: StubbedVolumeBar } = await importWithStubbedRecharts()
    const onBrush = vi.fn<(from: string, to: string) => void>()
    renderWithClient(<StubbedVolumeBar query={query} onBrush={onBrush} />)
    expect(brushOnChange).toBeDefined()
    expect(() => brushOnChange!({ startIndex: 0, endIndex: 999 })).not.toThrow()
    expect(onBrush).not.toHaveBeenCalled()
  })

  /**
   * The mirror case: when only the end index maps to a point (the start index is
   * out of range) the guard must still block the call. This kills the
   * ConditionalExpression→true mutation on the left operand (`start !== undefined`).
   */
  it('does not lift a range when only the end index resolves to a point', async () => {
    aggregateState = { data: volumeRows, isLoading: false }
    const { VolumeBar: StubbedVolumeBar } = await importWithStubbedRecharts()
    const onBrush = vi.fn<(from: string, to: string) => void>()
    renderWithClient(<StubbedVolumeBar query={query} onBrush={onBrush} />)
    expect(brushOnChange).toBeDefined()
    expect(() => brushOnChange!({ startIndex: 999, endIndex: 0 })).not.toThrow()
    expect(onBrush).not.toHaveBeenCalled()
  })

  /**
   * The chart wiring is fixed: the exact margins object, no vertical grid lines, and
   * integer-only Y ticks. Asserting these kills the ObjectLiteral→{} mutation on
   * `margin` and the BooleanLiteral→true mutations on `vertical={false}` /
   * `allowDecimals={false}`.
   */
  it('passes the fixed margins, hides vertical grid lines and disables Y decimals', async () => {
    aggregateState = { data: volumeRows, isLoading: false }
    const { VolumeBar: StubbedVolumeBar } = await importWithStubbedRecharts()
    renderWithClient(<StubbedVolumeBar query={query} onBrush={vi.fn()} />)
    expect(barChartProps?.margin).toEqual({ top: 4, right: 8, bottom: 0, left: 0 })
    expect(gridProps?.vertical).toBe(false)
    expect(yAxisProps?.allowDecimals).toBe(false)
  })

  /**
   * When the loaded data is undefined the `data ?? []` fallback pivots to an empty
   * series, so the BarChart receives no points. Asserting the empty array kills the
   * ArrayDeclaration→["Stryker was here"] mutation, which would feed one phantom point.
   */
  it('pivots to an empty series when the loaded data is undefined', async () => {
    aggregateState = { data: undefined, isLoading: false }
    const { VolumeBar: StubbedVolumeBar } = await importWithStubbedRecharts()
    renderWithClient(<StubbedVolumeBar query={query} onBrush={vi.fn()} />)
    expect(barChartProps?.data).toEqual([])
  })
})
