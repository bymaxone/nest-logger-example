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
import { cloneElement, type ReactElement, type ReactNode } from 'react'

import type { FacetValue } from '@/lib/types'

// Recharts axis ticks and bar shapes do not paint in jsdom; stub the surface so the
// custom `YAxis` chip tick and the `Bar.shape` render prop both execute deterministically.
// Each stub reflects the recharts config props it receives onto data-attributes so the
// component's chart configuration (margins, axis flags, tooltip cursor, bar radius/fill/
// animation) is assertable without painting a real chart.
type BarShape = (props: { payload?: FacetValue }) => ReactNode
vi.mock('recharts', () => ({
  ResponsiveContainer: ({ children }: { children: ReactNode }) => <div>{children}</div>,
  BarChart: ({ children, margin }: { children: ReactNode; margin?: unknown }) => (
    <div data-testid="bar-chart" data-margin={JSON.stringify(margin)}>
      {children}
    </div>
  ),
  XAxis: ({ allowDecimals }: { allowDecimals?: boolean }) => (
    <div data-testid="x-axis" data-allow-decimals={String(allowDecimals)} />
  ),
  YAxis: ({
    tick,
    tickLine,
    axisLine,
  }: {
    tick?: ReactElement<{ x?: number; y?: number; payload?: { value: string } }>
    tickLine?: boolean
    axisLine?: boolean
  }) => (
    <div data-testid="y-axis" data-tick-line={String(tickLine)} data-axis-line={String(axisLine)}>
      {tick && cloneElement(tick, { x: 130, y: 12, payload: { value: 'short' } })}
      {tick &&
        cloneElement(tick, {
          x: 130,
          y: 40,
          payload: { value: 'a-very-long-facet-value-that-overflows' },
        })}
      {/* Exactly 18 chars: at the truncation boundary, must pass through unclipped. */}
      {tick && cloneElement(tick, { x: 130, y: 60, payload: { value: 'abcdefghijklmnopqr' } })}
      {tick && cloneElement(tick, {})}
    </div>
  ),
  Tooltip: ({ cursor }: { cursor?: unknown }) => (
    <div data-testid="tooltip" data-cursor={JSON.stringify(cursor)} />
  ),
  Rectangle: ({ onClick, fill }: { onClick?: () => void; fill?: string }) => (
    <button type="button" data-testid="bar-rect" data-fill={fill} onClick={onClick}>
      bar
    </button>
  ),
  // Render the shape for a known payload and for an undefined one, exercising both
  // sides of the `row !== undefined` guard inside the shape callback.
  Bar: ({
    shape,
    fill,
    radius,
    isAnimationActive,
  }: {
    shape?: BarShape
    fill?: string
    radius?: unknown
    isAnimationActive?: boolean
  }) => (
    <div
      data-testid="bars"
      data-fill={fill}
      data-radius={JSON.stringify(radius)}
      data-anim={String(isAnimationActive)}
    >
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
  it('renders the bar chart and chip-truncates long axis labels', () => {
    render(<TopBar title="Top logKeys" rows={rows} onPick={vi.fn()} />)
    expect(screen.getByTestId('bar-chart')).toBeInTheDocument()
    // The short value renders verbatim inside its chip; the long one is clipped to
    // 17 chars + ellipsis by the chip tick.
    expect(screen.getByText('short')).toBeInTheDocument()
    expect(screen.getByText('a-very-long-facet…')).toBeInTheDocument()
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

  /**
   * The chip tick derives its SVG geometry from the label length. For 'short' (5 chars):
   * width = 5*6 + 12 = 42; the group is translated to (x - width - 4, y - TICK_HEIGHT/2) =
   * (130 - 42 - 4, 12 - 8) = (84, 4); the centered label sits at (width/2, TICK_HEIGHT/2) =
   * (21, 8). Asserting these exact values kills every arithmetic and template-literal
   * mutation on the chip width, group transform, and label coordinates.
   */
  it('lays out the chip tick geometry from the label length', () => {
    render(<TopBar title="Top logKeys" rows={rows} onPick={vi.fn()} />)
    const text = screen.getByText('short')
    expect(text.getAttribute('x')).toBe('21')
    expect(text.getAttribute('y')).toBe('8')
    const group = text.closest('g')
    expect(group?.getAttribute('transform')).toBe('translate(84, 4)')
    expect(group?.querySelector('rect')?.getAttribute('width')).toBe('42')
  })

  /** A label at exactly the 18-char limit is NOT clipped (kills the `>` → `>=` boundary mutation). */
  it('keeps an 18-character label unclipped at the truncation boundary', () => {
    render(<TopBar title="Top logKeys" rows={rows} onPick={vi.fn()} />)
    // `length > 18` is false at 18 chars → verbatim; `>= 18` would clip to 17 chars + ellipsis.
    expect(screen.getByText('abcdefghijklmnopqr')).toBeInTheDocument()
    expect(screen.queryByText('abcdefghijklmnopq…')).not.toBeInTheDocument()
  })

  /** A tick with no payload renders an empty label (kills the `?? ''` → "Stryker…" mutation). */
  it('renders an empty chip label when the tick payload is missing', () => {
    render(<TopBar title="Top logKeys" rows={rows} onPick={vi.fn()} />)
    expect(screen.queryByText('Stryker was here!')).not.toBeInTheDocument()
  })

  /** The bar chart receives the exact plot margins (kills the margin→{} mutation). */
  it('passes the configured plot margins to the bar chart', () => {
    render(<TopBar title="Top logKeys" rows={rows} onPick={vi.fn()} />)
    const margin = JSON.parse(screen.getByTestId('bar-chart').dataset.margin ?? 'null')
    expect(margin).toEqual({ left: 4, right: 8, top: 0, bottom: 0 })
  })

  /** The numeric value axis disallows fractional ticks (kills allowDecimals→true). */
  it('disables decimal ticks on the value axis', () => {
    render(<TopBar title="Top logKeys" rows={rows} onPick={vi.fn()} />)
    expect(screen.getByTestId('x-axis').dataset.allowDecimals).toBe('false')
  })

  /** The category axis hides its tick marks and axis line (kills tickLine/axisLine→true). */
  it('hides the category axis tick and axis lines', () => {
    render(<TopBar title="Top logKeys" rows={rows} onPick={vi.fn()} />)
    const yAxis = screen.getByTestId('y-axis')
    expect(yAxis.dataset.tickLine).toBe('false')
    expect(yAxis.dataset.axisLine).toBe('false')
  })

  /** The tooltip hover cursor uses the faint translucent fill (kills cursor→{} and fill→''). */
  it('configures the tooltip cursor fill', () => {
    render(<TopBar title="Top logKeys" rows={rows} onPick={vi.fn()} />)
    const cursor = JSON.parse(screen.getByTestId('tooltip').dataset.cursor ?? 'null')
    expect(cursor).toEqual({ fill: 'rgba(255,255,255,0.04)' })
  })

  /** Bars use rounded right corners with animation disabled (kills radius→[] and anim→true). */
  it('renders bars with corner radii and animation disabled', () => {
    render(<TopBar title="Top logKeys" rows={rows} onPick={vi.fn()} />)
    const bars = screen.getByTestId('bars')
    expect(JSON.parse(bars.dataset.radius ?? 'null')).toEqual([0, 4, 4, 0])
    expect(bars.dataset.anim).toBe('false')
  })

  /** With no `fill` prop the bars default to brand orange (kills the default-param ''-mutation). */
  it('defaults the bar fill to brand orange', () => {
    render(<TopBar title="Top logKeys" rows={rows} onPick={vi.fn()} />)
    expect(screen.getByTestId('bars').dataset.fill).toBe('#ff6224')
    // The clickable rect produced by the shape callback also receives the default fill.
    expect((screen.getAllByTestId('bar-rect')[0] as HTMLElement).dataset.fill).toBe('#ff6224')
  })
})
