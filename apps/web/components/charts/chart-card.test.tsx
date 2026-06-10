/**
 * @fileoverview Component tests for {@link ChartCard} — the glass panel wrapper.
 *
 * Verifies the three slots the wrapper exposes: the mono title, the optional
 * right-aligned header action, and the body children. Output is asserted via
 * Testing Library role/text queries rather than class names.
 *
 * @module components/charts/chart-card.test
 */
import { afterEach, describe, expect, it } from 'vitest'
import { cleanup, render, screen } from '@testing-library/react'

import { ChartCard } from '@/components/charts/chart-card'

afterEach(() => {
  cleanup()
})

describe('ChartCard', () => {
  /** The title and body children must both render so a titled panel is usable. */
  it('renders the title and body children', () => {
    render(
      <ChartCard title="Error rate">
        <p>panel body</p>
      </ChartCard>,
    )
    expect(screen.getByText('Error rate')).toBeInTheDocument()
    expect(screen.getByText('panel body')).toBeInTheDocument()
  })

  /** A provided `action` node must render in the header alongside the title. */
  it('renders the optional header action node', () => {
    render(
      <ChartCard title="Latency" action={<button type="button">refresh</button>}>
        <p>chart</p>
      </ChartCard>,
    )
    expect(screen.getByRole('button', { name: 'refresh' })).toBeInTheDocument()
    expect(screen.getByText('Latency')).toBeInTheDocument()
  })

  /** Omitting `action` (and `className`) must still render a clean titled card. */
  it('renders without an action or extra class names', () => {
    render(
      <ChartCard title="Volume">
        <span>body only</span>
      </ChartCard>,
    )
    expect(screen.getByText('Volume')).toBeInTheDocument()
    expect(screen.getByText('body only')).toBeInTheDocument()
    expect(screen.queryByRole('button')).not.toBeInTheDocument()
  })

  /**
   * The Card wrapper must receive `flex flex-col` so the body stretches to fill
   * the available height. Asserting both classes kills the StringLiteral→""
   * mutation on the `'flex flex-col'` argument to `cn()`.
   */
  it('applies flex and flex-col layout classes to the card root element', () => {
    const { container } = render(
      <ChartCard title="Layout test">
        <div />
      </ChartCard>,
    )
    expect(container.firstChild).toHaveClass('flex')
    expect(container.firstChild).toHaveClass('flex-col')
  })
})
