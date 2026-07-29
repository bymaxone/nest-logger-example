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
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, render, screen } from '@testing-library/react'
import { createElement, type ComponentProps } from 'react'

/** Captured per render so the data points the component feeds <LineChart> are assertable. */
let capturedData: unknown

// Wrap the real recharts so the sparkline still paints (dots / animation / stroke are
// asserted from the genuine SVG) while the mapped `data` prop is captured — the
// `series.map(...)` shape cannot be read back from the rendered DOM alone.
vi.mock('recharts', async (importOriginal) => {
  const actual = await importOriginal<typeof import('recharts')>()
  return {
    ...actual,
    LineChart: (props: ComponentProps<typeof actual.LineChart>) => {
      capturedData = props.data
      return createElement(actual.LineChart, props)
    },
  }
})

const { StatTile } = await import('@/components/charts/stat-tile')

beforeEach(() => {
  capturedData = undefined
})

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

  /** A positive delta badge uses the destructive colour class (rising = bad for error-rate tiles). */
  it('applies destructive colour class to a rising delta badge', () => {
    render(<StatTile title="errors" value="5" series={[1, 2]} delta={2.5} />)
    const badge = screen.getByText(/▲/)
    expect(badge.className).toContain('text-destructive')
    expect(badge.className).not.toContain('color-success')
  })

  /** A negative delta badge uses the success colour class (falling = good for error-rate tiles). */
  it('applies success colour class to a falling delta badge', () => {
    render(<StatTile title="errors" value="5" series={[1, 2]} delta={-1.5} />)
    const badge = screen.getByText(/▼/)
    expect(badge.className).not.toContain('text-destructive')
    expect(badge.className).toContain('color-success')
  })

  /**
   * A zero delta is non-rising (the `delta > 0` false branch) so the success
   * colour class must apply. Asserting this kills the `> 0` → `>= 0` mutation.
   */
  it('treats a zero delta as non-rising and applies the success colour class', () => {
    render(<StatTile title="errors" value="5" series={[1, 2]} delta={0} />)
    // delta=0 → `delta > 0` is false → falling glyph and success class.
    const badge = screen.getByText(/▼ 0.0%/)
    expect(badge.className).not.toContain('text-destructive')
    expect(badge.className).toContain('color-success')
  })

  /**
   * When `danger` is omitted the default is `false` (non-danger). Asserting that
   * the value carries `text-foreground` (not `text-destructive`) kills the
   * `danger = false` → `danger = true` BooleanLiteral mutation on the default
   * parameter, which would make every tile danger-styled unless explicitly opted out.
   */
  it('defaults the value to foreground styling when the danger prop is omitted', () => {
    render(<StatTile title="LATENCY" value="42ms" series={[]} />)
    const value = screen.getByText('42ms')
    expect(value.className).toContain('text-foreground')
    expect(value.className).not.toContain('text-destructive')
  })

  /**
   * When `danger` is true the card wrapper must carry `ring-destructive`.
   * Asserting this kills the StringLiteral→"" mutation on `'ring-1 ring-destructive/60'`.
   */
  it('applies the danger ring class to the card wrapper when danger is set', () => {
    const { container } = render(<StatTile title="errors" value="99" series={[]} danger />)
    expect((container.firstChild as HTMLElement).className).toContain('ring-destructive')
  })

  /**
   * The value span must carry `text-2xl font-bold` as its base class.
   * Asserting this kills the StringLiteral→"" mutation on the base value class.
   */
  it('applies text-2xl font-bold to the value span', () => {
    render(<StatTile title="errors" value="42" series={[]} />)
    const value = screen.getByText('42')
    expect(value.className).toContain('text-2xl')
    expect(value.className).toContain('font-bold')
  })

  /**
   * The title element must carry the `font-mono` class from CardTitle's className.
   * Asserting this kills the StringLiteral→"" mutation on the CardTitle className.
   */
  it('applies font-mono to the card title element', () => {
    render(<StatTile title="errors" value="42" series={[]} />)
    const title = screen.getByText('errors')
    expect(title.className).toContain('font-mono')
  })

  /**
   * The hint sub-label must carry `text-white/40`.
   * Asserting this kills the StringLiteral→"" mutation on the hint span className.
   */
  it('applies text-white/40 to the hint sub-label', () => {
    render(<StatTile title="latency" value="120ms" series={[]} hint="p95" />)
    const hint = screen.getByText('p95')
    expect(hint.className).toContain('text-white/40')
  })

  /**
   * The delta badge must carry `font-mono` as its base class.
   * Asserting this kills the StringLiteral→"" mutation on `'font-mono text-[11px]'`.
   */
  it('applies font-mono to the delta badge', () => {
    render(<StatTile title="errors" value="42" series={[]} delta={1.5} />)
    const badge = screen.getByText(/▲/)
    expect(badge.className).toContain('font-mono')
  })

  /**
   * The series maps to one `{ i, n }` point per value. Asserting the exact array kills
   * both the ArrowFunction→`() => undefined` mutation (yields `[undefined, …]`) and the
   * ObjectLiteral→`{}` mutation (yields `[{}, …]`) on the `series.map` callback.
   */
  it('maps the series into indexed sparkline points', () => {
    render(<StatTile title="errors" value="42" series={[1, 2]} />)
    expect(capturedData).toEqual([
      { i: 0, n: 1 },
      { i: 1, n: 2 },
    ])
  })

  /** The non-danger sparkline stroke is the blue accent (kills the false-branch ''-stroke mutation). */
  it('strokes the sparkline blue when not in danger', () => {
    const { container } = render(<StatTile title="latency" value="9" series={[1, 2, 3]} />)
    expect(container.querySelector('.recharts-line-curve')?.getAttribute('stroke')).toBe('#60a5fa')
  })

  /** The danger sparkline stroke is red (kills the danger-branch ''-stroke mutation). */
  it('strokes the sparkline red when in danger', () => {
    const { container } = render(<StatTile title="errors" value="9" series={[1, 2, 3]} danger />)
    expect(container.querySelector('.recharts-line-curve')?.getAttribute('stroke')).toBe('#ef4444')
  })

  /** The card root keeps its base layout classes (kills the StringLiteral→'' on the base arg of cn). */
  it('applies the base min-width and flex classes to the card root', () => {
    const { container } = render(<StatTile title="errors" value="42" series={[]} />)
    const root = container.firstChild as HTMLElement
    expect(root.className).toContain('min-w-40')
    expect(root.className).toContain('flex-1')
  })

  /**
   * With no hint, the hint sub-label element must not render at all. Asserting the
   * absence of the hint span (its unique `text-white/40` class) kills the
   * ConditionalExpression→true mutation, which would render an empty hint span.
   */
  it('renders no hint element when the hint is omitted', () => {
    const { container } = render(<StatTile title="errors" value="42" series={[1, 2]} />)
    expect(container.querySelector('[class~="text-white/40"]')).toBeNull()
  })

  /** The sparkline renders without per-point dots (kills the dot→true mutation). */
  it('renders the sparkline without dots', () => {
    const { container } = render(<StatTile title="errors" value="42" series={[1, 2, 3, 4]} />)
    expect(container.querySelectorAll('.recharts-line-dot')).toHaveLength(0)
    // Sanity: the curve renders, so the absence of dots is meaningful.
    expect(container.querySelector('.recharts-line-curve')).not.toBeNull()
  })

  /** Animation is off, so the sparkline curve has no react-smooth draw-animation dasharray. */
  it('disables sparkline animation', () => {
    const { container } = render(<StatTile title="errors" value="42" series={[1, 2, 3, 4]} />)
    const curve = container.querySelector('.recharts-line-curve')
    expect(curve?.getAttribute('stroke-dasharray')).toBeNull()
  })
})
