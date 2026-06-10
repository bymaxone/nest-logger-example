/**
 * @fileoverview Component tests for {@link LevelDonut} — the loading skeleton, the
 * empty "No data" message, the server-side `count() by level` summation (bounded to
 * the six known levels), and the click-to-filter that pivots the Explorer by level.
 *
 * The filter hook (`@/lib/filters`) and the aggregate hook (`@/hooks/use-aggregate`)
 * are mocked; recharts is stubbed so the per-slice `Cell.onClick` is reachable and
 * coloured by `lib/severity.ts`.
 *
 * @module components/charts/level-donut.test
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { ReactNode } from 'react'

import type { VolumeRow } from '@/lib/types'

/** Captures the `setQuery` calls the donut makes on a slice click. */
const setQueryMock = vi.fn<(patch: unknown) => void>()

/** Mutable hook return; reset per test before render. */
let aggregateReturn: { data: VolumeRow[] | undefined; isLoading: boolean } = {
  data: [],
  isLoading: false,
}

vi.mock('@/lib/filters', () => ({
  useLogQuery: () => ({
    query: { source: 'loki' },
    setQuery: setQueryMock,
    live: false,
    isRelative: true,
  }),
}))

vi.mock('@/hooks/use-aggregate', () => ({
  useAggregate: () => aggregateReturn,
}))

// Recharts does not paint <Cell> click targets in jsdom, so the slice `onClick`
// would be unreachable. Stub `Pie` to render its children and `Cell` as a real
// button carrying the slice fill — exercising the colour mapping and click-to-filter.
type CellProps = { fill: string; onClick?: () => void; children?: ReactNode }
vi.mock('recharts', () => ({
  ResponsiveContainer: ({ children }: { children: ReactNode }) => <div>{children}</div>,
  PieChart: ({ children }: { children: ReactNode }) => (
    <div data-testid="pie-chart">{children}</div>
  ),
  Pie: ({ children }: { children: ReactNode }) => <div data-testid="pie">{children}</div>,
  Tooltip: () => <div data-testid="tooltip" />,
  Cell: ({ fill, onClick }: CellProps) => (
    <button type="button" data-fill={fill} onClick={onClick}>
      slice
    </button>
  ),
}))

const { LevelDonut } = await import('./level-donut')
const { SEVERITY } = await import('@/lib/severity')

beforeEach(() => {
  aggregateReturn = { data: [], isLoading: false }
  setQueryMock.mockReset()
})

afterEach(() => {
  cleanup()
  vi.clearAllMocks()
})

describe('LevelDonut', () => {
  /** While the aggregate is loading, only the skeleton renders (no donut, no message). */
  it('renders the skeleton while loading', () => {
    aggregateReturn = { data: undefined, isLoading: true }
    render(<LevelDonut />)
    expect(screen.queryByTestId('pie-chart')).not.toBeInTheDocument()
    expect(screen.queryByText('No data')).not.toBeInTheDocument()
  })

  /** With no rows the slice list is empty, so the "No data" message shows. */
  it('shows the empty message when there are no rows', () => {
    aggregateReturn = { data: [], isLoading: false }
    render(<LevelDonut />)
    expect(screen.getByText('No data')).toBeInTheDocument()
  })

  /** An undefined (loaded) payload also yields the empty message (`data ?? []`). */
  it('shows the empty message when loaded data is undefined', () => {
    aggregateReturn = { data: undefined, isLoading: false }
    render(<LevelDonut />)
    expect(screen.getByText('No data')).toBeInTheDocument()
  })

  /** Rows that carry only unknown levels are filtered out, leaving no slices. */
  it('ignores rows with levels outside the known set', () => {
    aggregateReturn = {
      data: [{ bucket: '2026-06-05T10:00:00.000Z', level: 'unknown', n: 5 }],
      isLoading: false,
    }
    render(<LevelDonut />)
    expect(screen.getByText('No data')).toBeInTheDocument()
  })

  /**
   * All six known levels with exactly n=1 each produce six slices.
   * Asserting six slices kills StringLiteral mutations to every LEVELS entry
   * ('fatal', 'warn', 'debug', 'trace') and the `s.n > 0` → `s.n > 1`
   * ArithmeticOperator mutation (since n=1 would be excluded if the threshold
   * were > 1).
   */
  it('renders a slice for each of the six known levels when all have n=1', () => {
    aggregateReturn = {
      data: [
        { bucket: 'b1', level: 'fatal', n: 1 },
        { bucket: 'b1', level: 'error', n: 1 },
        { bucket: 'b1', level: 'warn', n: 1 },
        { bucket: 'b1', level: 'info', n: 1 },
        { bucket: 'b1', level: 'debug', n: 1 },
        { bucket: 'b1', level: 'trace', n: 1 },
      ],
      isLoading: false,
    }
    render(<LevelDonut />)
    const slices = screen.getAllByRole('button', { name: 'slice' })
    expect(slices).toHaveLength(6)
    // Each slice is coloured per SEVERITY — verify fatal and trace are wired.
    const fills = slices.map((s) => s.getAttribute('data-fill'))
    expect(fills).toContain(SEVERITY.fatal.color)
    expect(fills).toContain(SEVERITY.warn.color)
    expect(fills).toContain(SEVERITY.trace.color)
  })

  /**
   * Known-level rows are summed across buckets into one slice per non-zero level,
   * coloured per `lib/severity.ts`; clicking a slice pivots the Explorer to that level.
   */
  it('renders one coloured slice per non-zero level and filters on click', async () => {
    aggregateReturn = {
      data: [
        { bucket: 'b1', level: 'error', n: 3 },
        { bucket: 'b2', level: 'error', n: 2 },
        { bucket: 'b1', level: 'info', n: 7 },
        { bucket: 'b1', level: 'debug', n: 0 },
      ],
      isLoading: false,
    }
    render(<LevelDonut />)

    // Only error and info produced slices (debug summed to zero, so it is dropped).
    const slices = screen.getAllByRole('button', { name: 'slice' })
    expect(slices).toHaveLength(2)
    const fills = slices.map((s) => s.getAttribute('data-fill'))
    expect(fills).toContain(SEVERITY.error.color)
    expect(fills).toContain(SEVERITY.info.color)

    // Clicking the error slice pivots the filter to that level.
    const errorSlice = slices.find((s) => s.getAttribute('data-fill') === SEVERITY.error.color)
    await userEvent.click(errorSlice as HTMLElement)
    expect(setQueryMock).toHaveBeenCalledWith({ level: 'error' })
  })
})
