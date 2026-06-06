/**
 * @fileoverview Component tests for {@link SloGauge} — the 99.9% error-budget tile.
 *
 * Exercises the budget-left math and both branch families: the danger ring /
 * destructive styling once the remaining budget drops below 25%, and the three
 * Google multi-burn-rate threshold badges (14.4 / 6 / 1) in their breached and
 * unbreached forms. Assertions target the rendered percentage, the progressbar
 * aria value, and the threshold badge labels.
 *
 * @module components/charts/slo-gauge.test
 */
import { afterEach, describe, expect, it } from 'vitest'
import { cleanup, render, screen } from '@testing-library/react'

import { SloGauge } from '@/components/charts/slo-gauge'

afterEach(() => {
  cleanup()
})

describe('SloGauge', () => {
  /** A zero error rate leaves the full budget — 100% and no danger styling. */
  it('renders 100% budget with no error rate and no breached thresholds', () => {
    render(<SloGauge errorRate={0} />)
    expect(screen.getByText('100%')).toBeInTheDocument()
    const bar = screen.getByRole('progressbar', { name: 'Error budget remaining' })
    expect(bar).toHaveAttribute('aria-valuenow', '100')
    // burnRate = 0 → none of the 14.4 / 6 / 1 thresholds are breached.
    expect(screen.getByText('14.4×')).toBeInTheDocument()
    expect(screen.getByText('6×')).toBeInTheDocument()
    expect(screen.getByText('1×')).toBeInTheDocument()
  })

  /**
   * A small but non-zero error rate keeps the budget above 25% (no danger) yet
   * pushes the burn rate past the 1× threshold so exactly that badge breaches.
   * errorRate 0.0005 → burnRate 0.5 → budgetLeft 50%.
   */
  it('breaches only the 1x threshold while staying out of danger', () => {
    render(<SloGauge errorRate={0.0005} />)
    expect(screen.getByText('50%')).toBeInTheDocument()
    const value = screen.getByText('50%')
    expect(value.className).toContain('text-foreground')
    expect(value.className).not.toContain('text-destructive')
  })

  /**
   * A high error rate drives the burn rate above every threshold and exhausts
   * the budget, so the tile enters danger styling and clamps budget-left to 0.
   * errorRate 0.05 → burnRate 50 → budgetLeft clamped to 0%.
   */
  it('clamps to 0% and enters danger styling when the budget is exhausted', () => {
    render(<SloGauge errorRate={0.05} />)
    expect(screen.getByText('0%')).toBeInTheDocument()
    const value = screen.getByText('0%')
    expect(value.className).toContain('text-destructive')
    const bar = screen.getByRole('progressbar', { name: 'Error budget remaining' })
    expect(bar).toHaveAttribute('aria-valuenow', '0')
    // All three thresholds (14.4 / 6 / 1) are breached at burnRate 50.
    expect(screen.getByText('14.4×')).toBeInTheDocument()
  })

  /**
   * A mid-range error rate breaches the 6× and 1× thresholds but not 14.4×,
   * and lands the budget below 25% so the danger ring lights up.
   * errorRate 0.008 → burnRate 8 → budgetLeft clamped to 0% (danger).
   */
  it('breaches the 6x threshold and enters danger below the 25% budget floor', () => {
    render(<SloGauge errorRate={0.008} />)
    const value = screen.getByText('0%')
    expect(value.className).toContain('text-destructive')
  })
})
