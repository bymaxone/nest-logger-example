/**
 * @fileoverview Component tests for {@link ChartLegend} — the swatch + label row.
 *
 * Covers the empty-items guard (renders nothing), a series carrying a unit
 * suffix, and a series without one, so a viewer can always map a colour to its
 * meaning. Output is asserted via role/text queries, not class names.
 *
 * @module components/charts/chart-legend.test
 */
import { afterEach, describe, expect, it } from 'vitest'
import { cleanup, render, screen } from '@testing-library/react'

import { ChartLegend } from '@/components/charts/chart-legend'
import type { ChartSeries } from '@/lib/chart-series'

afterEach(() => {
  cleanup()
})

describe('ChartLegend', () => {
  /** An empty series list renders nothing — no stray, label-less legend row. */
  it('renders nothing when there are no items', () => {
    const { container } = render(<ChartLegend items={[]} />)
    expect(container).toBeEmptyDOMElement()
  })

  /** A series with a unit shows both its label and the unit suffix. */
  it('renders the label and unit suffix for a series with a unit', () => {
    const items: ChartSeries[] = [{ key: 'p95', label: 'p95', color: '#f59e0b', unit: 'ms' }]
    render(<ChartLegend items={items} />)
    expect(screen.getByRole('list', { name: 'Chart legend' })).toBeInTheDocument()
    expect(screen.getByText('p95')).toBeInTheDocument()
    expect(screen.getByText('ms')).toBeInTheDocument()
  })

  /** A series without a unit shows only its label (no trailing unit node). */
  it('renders only the label for a series without a unit', () => {
    const items: ChartSeries[] = [{ key: 's2xx', label: '2xx', color: '#22c55e' }]
    render(<ChartLegend items={items} />)
    expect(screen.getByText('2xx')).toBeInTheDocument()
    // Exactly one list item, with no unit suffix beside the label.
    expect(screen.getAllByRole('listitem')).toHaveLength(1)
  })

  /**
   * The legend `<ul>` must carry its flex-wrap layout classes so swatches lay out
   * in a wrapping row. Asserting them kills the StringLiteral→"" mutation on the
   * `cn('flex flex-wrap items-center gap-x-3 gap-y-1', …)` base-class argument.
   */
  it('applies the flex-wrap layout classes to the legend list', () => {
    const items: ChartSeries[] = [{ key: 's2xx', label: '2xx', color: '#22c55e' }]
    render(<ChartLegend items={items} />)
    const list = screen.getByRole('list', { name: 'Chart legend' })
    expect(list.className).toContain('flex')
    expect(list.className).toContain('flex-wrap')
    expect(list.className).toContain('items-center')
    expect(list.className).toContain('gap-x-3')
    expect(list.className).toContain('gap-y-1')
  })

  /**
   * Each swatch paints its series colour through an inline `background` style;
   * jsdom normalises `#22c55e` to `rgb(34, 197, 94)`. Asserting the exact value
   * kills the ObjectLiteral→{} mutation on `style={{ background: s.color }}`
   * (which would leave the swatch with no background at all).
   */
  it('paints the swatch with the series colour as an inline background', () => {
    const items: ChartSeries[] = [{ key: 's2xx', label: '2xx', color: '#22c55e' }]
    render(<ChartLegend items={items} />)
    const swatch = screen.getByRole('listitem').firstChild as HTMLElement
    expect(swatch.style.background).toBe('rgb(34, 197, 94)')
  })

  /**
   * A unit-less series must render exactly the swatch span plus the label span —
   * no empty trailing unit node. Asserting two spans kills the
   * ConditionalExpression→true mutation on `s.unit !== undefined ? … : null`,
   * which would always render a third (empty) unit span.
   */
  it('renders no unit span for a series without a unit', () => {
    const items: ChartSeries[] = [{ key: 's2xx', label: '2xx', color: '#22c55e' }]
    render(<ChartLegend items={items} />)
    expect(screen.getByRole('listitem').querySelectorAll('span')).toHaveLength(2)
  })
})
