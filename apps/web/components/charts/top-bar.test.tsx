/**
 * @fileoverview Component tests for {@link TopBar} — the loading skeleton, the empty
 * "No data" state, the populated horizontal bar chart, the YAxis label truncation,
 * and the click-to-filter `shape` render-prop (including the missing-payload guard).
 *
 * Recharts is stubbed so the `Bar.shape` callback runs with a known payload and the
 * `Rectangle` it returns is a real, clickable element — making `onPick` reachable.
 *
 * @module components/charts/top-bar.test
 */
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { ReactNode } from 'react'

import type { FacetValue } from '@/lib/types'

/** Captures the label fed to the YAxis tick formatter so truncation can be asserted. */
const yAxisFormatted: string[] = []

// Recharts axis ticks and bar shapes do not paint in jsdom; stub the surface so the
// `YAxis.tickFormatter` and the `Bar.shape` render prop both execute deterministically.
type BarShape = (props: { payload?: FacetValue }) => ReactNode
vi.mock('recharts', () => ({
  ResponsiveContainer: ({ children }: { children: ReactNode }) => <div>{children}</div>,
  BarChart: ({ children }: { children: ReactNode }) => (
    <div data-testid="bar-chart">{children}</div>
  ),
  XAxis: () => <div data-testid="x-axis" />,
  YAxis: ({ tickFormatter }: { tickFormatter?: (v: string) => string }) => {
    if (tickFormatter) {
      yAxisFormatted.push(tickFormatter('short'))
      yAxisFormatted.push(tickFormatter('a-very-long-facet-value-that-overflows'))
    }
    return <div data-testid="y-axis" />
  },
  Tooltip: () => <div data-testid="tooltip" />,
  Rectangle: ({ onClick }: { onClick?: () => void }) => (
    <button type="button" data-testid="bar-rect" onClick={onClick}>
      bar
    </button>
  ),
  // Render the shape for a known payload and for an undefined one, exercising both
  // sides of the `row !== undefined` guard inside the shape callback.
  Bar: ({ shape }: { shape?: BarShape }) => (
    <div data-testid="bars">
      {shape ? shape({ payload: { value: 'GET /users', count: 9 } }) : null}
      {/* No `payload` key at all exercises the `row === undefined` guard. */}
      {shape ? shape({}) : null}
    </div>
  ),
}))

const { TopBar } = await import('./top-bar')

/** Default props shared across the rendered-chart cases. */
const rows: FacetValue[] = [
  { value: 'GET /users', count: 9 },
  { value: 'POST /orders', count: 4 },
]

afterEach(() => {
  yAxisFormatted.length = 0
  cleanup()
  vi.clearAllMocks()
})

describe('TopBar', () => {
  /** The title always renders, even while loading; the skeleton replaces the chart. */
  it('renders the title and skeleton while loading', () => {
    render(<TopBar title="Top logKeys" rows={[]} onPick={vi.fn()} loading />)
    expect(screen.getByRole('heading', { name: 'Top logKeys' })).toBeInTheDocument()
    expect(screen.queryByTestId('bar-chart')).not.toBeInTheDocument()
    expect(screen.queryByText('No data')).not.toBeInTheDocument()
  })

  /** With no rows (and not loading) the "No data" state shows instead of the chart. */
  it('shows the empty state when there are no rows', () => {
    render(<TopBar title="Top tenants" rows={[]} onPick={vi.fn()} />)
    expect(screen.getByText('No data')).toBeInTheDocument()
    expect(screen.queryByTestId('bar-chart')).not.toBeInTheDocument()
  })

  /**
   * Populated rows render the bar chart; the YAxis formatter passes short labels
   * through and truncates long ones with an ellipsis. The `loading` default is `false`.
   */
  it('renders the bar chart and truncates long axis labels', () => {
    render(<TopBar title="Top logKeys" rows={rows} onPick={vi.fn()} />)
    expect(screen.getByTestId('bar-chart')).toBeInTheDocument()
    // Short label is untouched; the long one is clipped to 17 chars + ellipsis.
    expect(yAxisFormatted).toContain('short')
    expect(yAxisFormatted).toContain('a-very-long-facet…')
  })

  /** Clicking a bar with a payload pivots the filter to that value via `onPick`. */
  it('calls onPick with the bar value on click', async () => {
    const onPick = vi.fn()
    render(<TopBar title="Top logKeys" rows={rows} onPick={onPick} fill="#123456" />)
    // The first rendered rect carries the known payload; the second has none.
    const bars = screen.getAllByTestId('bar-rect')
    await userEvent.click(bars[0] as HTMLElement)
    expect(onPick).toHaveBeenCalledWith('GET /users')
    // The payload-less rect must not trigger a pick (the missing-payload guard).
    onPick.mockClear()
    await userEvent.click(bars[1] as HTMLElement)
    expect(onPick).not.toHaveBeenCalled()
  })
})
