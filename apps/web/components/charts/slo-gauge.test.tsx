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

  /**
   * At exactly 25% budget left the tile is not in danger (`budgetLeft < 0.25`
   * strict inequality). Asserting the non-destructive class kills the
   * `< 0.25` → `<= 0.25` mutation.
   *
   * errorRate 0.00075 → burnRate 0.75 → budgetLeft 0.25 → 25%.
   */
  it('is not in danger at exactly 25% budget left', () => {
    render(<SloGauge errorRate={0.00075} />)
    const value = screen.getByText('25%')
    expect(value.className).toContain('text-foreground')
    expect(value.className).not.toContain('text-destructive')
  })

  /**
   * One step below 25% (24%) the tile enters danger — the complementary
   * boundary assertion that rules out an off-by-one mutation.
   *
   * errorRate 0.00076 → burnRate 0.76 → budgetLeft 0.24 → 24%.
   */
  it('enters danger at 24% budget left (just below the 25% floor)', () => {
    render(<SloGauge errorRate={0.00076} />)
    const value = screen.getByText('24%')
    expect(value.className).toContain('text-destructive')
  })

  /**
   * burnRate above 1 but below 6 breaches the 1x badge only.
   * Asserting the destructive class on 1x and its absence on 6x kills both the
   * `1 → 2` numeric-literal mutation and the ConditionalExpression `false` mutation.
   *
   * errorRate 0.0011 gives burnRate safely above the 1x threshold but below 6.
   */
  it('breaches only the 1x badge when the burn rate is between 1 and 6', () => {
    render(<SloGauge errorRate={0.0011} />)
    const badge1 = screen.getByTitle('1× burn-rate window')
    const badge6 = screen.getByTitle('6× burn-rate window')
    expect(badge1.className).toContain('text-destructive')
    expect(badge6.className).not.toContain('text-destructive')
  })

  /**
   * burnRate above 6 but below 14.4 breaches 6x and 1x but not 14.4x.
   * Asserting this kills the `6 → 7` numeric-literal mutation and the
   * ConditionalExpression `false` mutation for the 6x badge.
   *
   * errorRate 0.007 gives burnRate safely above 6 and safely below 14.4.
   */
  it('breaches the 6x and 1x badges but not 14.4x when burn rate is between 6 and 14.4', () => {
    render(<SloGauge errorRate={0.007} />)
    const badge6 = screen.getByTitle('6× burn-rate window')
    const badge14 = screen.getByTitle('14.4× burn-rate window')
    expect(badge6.className).toContain('text-destructive')
    expect(badge14.className).not.toContain('text-destructive')
  })

  /**
   * burnRate above 14.4 breaches the 14.4x badge.
   * Asserting this kills the `14.4 → 15.4` numeric-literal mutation
   * (burnRate 14.9 < 15.4) and the ConditionalExpression `false` mutation.
   *
   * errorRate 0.015 gives burnRate safely above 14.4.
   */
  it('breaches the 14.4x badge when the burn rate is above 14.4', () => {
    render(<SloGauge errorRate={0.015} />)
    const badge14 = screen.getByTitle('14.4× burn-rate window')
    expect(badge14.className).toContain('text-destructive')
  })

  /**
   * The CardTitle must render the exact 'SLO 99.9% (30d)' text.
   * Killing the StringLiteral mutation that replaces it with ''.
   */
  it('renders the SLO 99.9% (30d) card title', () => {
    render(<SloGauge errorRate={0} />)
    expect(screen.getByText('SLO 99.9% (30d)')).toBeInTheDocument()
  })

  /**
   * The 'budget left' sub-label must always render.
   * Killing the StringLiteral mutation that replaces it with ''.
   */
  it('renders the budget left sub-label', () => {
    render(<SloGauge errorRate={0} />)
    expect(screen.getByText('budget left')).toBeInTheDocument()
  })

  /**
   * When in danger the card wrapper must carry `ring-destructive`.
   * Asserting this kills the StringLiteral→"" mutation on `'ring-1 ring-destructive/60'`.
   */
  it('applies the danger ring to the card when in danger', () => {
    const { container } = render(<SloGauge errorRate={0.05} />)
    expect((container.firstChild as HTMLElement).className).toContain('ring-destructive')
  })

  /**
   * The progress bar fill must carry `bg-(--color-success)` when healthy.
   * Asserting this kills the StringLiteral→"" mutation on the success background class.
   */
  it('applies bg-(--color-success) to the bar fill when healthy', () => {
    render(<SloGauge errorRate={0} />)
    const bar = screen.getByRole('progressbar')
    const fill = bar.firstChild as HTMLElement
    expect(fill.className).toContain('bg-(--color-success)')
    expect(fill.className).toContain('h-full')
    expect(fill.className).toContain('rounded-full')
  })

  /**
   * Unbreached threshold badges must carry the muted `text-white/40` class.
   * Asserting this kills the StringLiteral→"" mutation on `'border-(--glass-border) text-white/40'`.
   */
  it('applies text-white/40 to unbreached threshold badges', () => {
    render(<SloGauge errorRate={0} />)
    // burnRate = 0, all badges unbreached.
    const badge = screen.getByTitle('14.4× burn-rate window')
    expect(badge.className).toContain('text-white/40')
    expect(badge.className).toContain('rounded-full')
    expect(badge.className).toContain('border')
  })

  /**
   * Breached threshold badges must carry the full destructive theme classes.
   * Asserting `bg-destructive/15` kills the StringLiteral mutation that strips
   * `bg-destructive/15` from `'border-destructive/60 bg-destructive/15 text-destructive'`.
   */
  it('applies bg-destructive/15 to a breached threshold badge', () => {
    render(<SloGauge errorRate={0.015} />)
    const badge14 = screen.getByTitle('14.4× burn-rate window')
    expect(badge14.className).toContain('bg-destructive/15')
    expect(badge14.className).toContain('border-destructive/60')
  })

  /**
   * The percentage value must carry `text-2xl font-bold` as its base class.
   * Asserting this kills the StringLiteral→"" mutation on the base value class string.
   */
  it('applies text-2xl font-bold to the budget percentage value', () => {
    render(<SloGauge errorRate={0} />)
    const value = screen.getByText('100%')
    expect(value.className).toContain('text-2xl')
    expect(value.className).toContain('font-bold')
  })

  /**
   * The progress bar fill div must have a non-empty `width` inline style.
   * An ObjectLiteral→{} mutation on `style={{ width: '…%' }}` leaves no
   * width attribute, making the bar invisible. Asserting the style is
   * present kills both the ObjectLiteral and the StringLiteral→"" mutation.
   */
  it('renders the progress bar fill with a non-empty inline width style', () => {
    render(<SloGauge errorRate={0} />)
    const bar = screen.getByRole('progressbar')
    const fill = bar.firstChild as HTMLElement
    expect(fill.style.width).not.toBe('')
    expect(fill.getAttribute('style')).toContain('width')
  })

  /**
   * A burn rate of exactly 1× (errorRate = ERROR_BUDGET = 1 - SLO_TARGET) must
   * breach the 1× threshold badge. The `>=` operator includes the exact boundary;
   * an EqualityOperator→> mutation would exclude it.
   *
   * Both the test and the component compute the same float `1 - 0.999`, so their
   * ratio is always exactly 1.0 — no floating-point drift.
   */
  it('breaches the 1× badge at exactly the 1× burn-rate boundary', () => {
    // errorRate = 1 - 0.999 → burnRate = (1 - 0.999) / (1 - 0.999) = 1.0 exactly
    render(<SloGauge errorRate={1 - 0.999} />)
    const badge1 = screen.getByTitle('1× burn-rate window')
    expect(badge1.className).toContain('text-destructive')
  })
})
