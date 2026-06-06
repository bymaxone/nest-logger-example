/**
 * @fileoverview Component tests for {@link StatTile} — the golden-signal tile.
 *
 * Drives every visible branch: the danger ring on/off, the optional hint
 * sub-label, and the Δ badge in its present/absent/positive/negative forms.
 * The sparkline mounts via the centrally-polyfilled ResponsiveContainer; the
 * assertions target the rendered value, hint, and badge glyph + text.
 *
 * @module components/charts/stat-tile.test
 */
import { afterEach, describe, expect, it } from 'vitest'
import { cleanup, render, screen } from '@testing-library/react'

import { StatTile } from '@/components/charts/stat-tile'

afterEach(() => {
  cleanup()
})

describe('StatTile', () => {
  /** The title and headline value must render so the tile reads at a glance. */
  it('renders the title and value', () => {
    render(<StatTile title="errors" value="42" series={[1, 2, 3]} />)
    expect(screen.getByText('errors')).toBeInTheDocument()
    expect(screen.getByText('42')).toBeInTheDocument()
  })

  /** A defined hint renders as the sub-label next to the value. */
  it('renders the hint when provided', () => {
    render(<StatTile title="latency" value="120ms" series={[1, 2]} hint="p95" />)
    expect(screen.getByText('p95')).toBeInTheDocument()
  })

  /** An omitted hint must not render any sub-label text. */
  it('omits the hint sub-label when not provided', () => {
    render(<StatTile title="latency" value="120ms" series={[1, 2]} />)
    expect(screen.queryByText('p95')).not.toBeInTheDocument()
  })

  /** A positive delta renders the rising glyph and the absolute percentage. */
  it('renders a rising delta badge for a positive delta', () => {
    render(<StatTile title="errors" value="42" series={[1, 2]} delta={3.25} />)
    expect(screen.getByText('▲ 3.3%')).toBeInTheDocument()
  })

  /** A negative delta renders the falling glyph and the absolute percentage. */
  it('renders a falling delta badge for a negative delta', () => {
    render(<StatTile title="errors" value="42" series={[1, 2]} delta={-4.75} />)
    expect(screen.getByText('▼ 4.8%')).toBeInTheDocument()
  })

  /** An omitted delta hides the badge entirely (no glyph in the DOM). */
  it('omits the delta badge when delta is undefined', () => {
    render(<StatTile title="errors" value="42" series={[1, 2]} />)
    expect(screen.queryByText(/▲|▼/)).not.toBeInTheDocument()
  })

  /** A non-finite delta is treated as absent — the badge must not render. */
  it('omits the delta badge when delta is not finite', () => {
    render(<StatTile title="errors" value="42" series={[1, 2]} delta={Number.NaN} />)
    expect(screen.queryByText(/▲|▼/)).not.toBeInTheDocument()
  })

  /** The danger flag is reflected in a destructive value class without changing the value text. */
  it('renders the value in destructive styling when danger is set', () => {
    render(<StatTile title="errors" value="99" series={[1, 2]} danger />)
    const value = screen.getByText('99')
    expect(value).toBeInTheDocument()
    expect(value.className).toContain('text-destructive')
  })

  /** With danger off the value keeps the default (non-destructive) foreground styling. */
  it('renders the value in default styling when danger is off', () => {
    render(<StatTile title="errors" value="7" series={[1, 2]} danger={false} />)
    const value = screen.getByText('7')
    expect(value.className).toContain('text-foreground')
    expect(value.className).not.toContain('text-destructive')
  })
})
