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
})
