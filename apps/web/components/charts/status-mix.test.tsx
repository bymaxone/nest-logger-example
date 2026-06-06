/**
 * @fileoverview Component tests for {@link StatusMix} — the loading skeleton and
 * the stacked status-class bar chart over populated and undefined (`data ?? []`)
 * aggregate payloads.
 *
 * The aggregate hook (`@/hooks/use-aggregate`) is mocked so each test drives one
 * branch; recharts renders under the polyfilled element box from the global setup.
 *
 * @module components/charts/status-mix.test
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, render, screen } from '@testing-library/react'
import type { ReactNode } from 'react'

import type { StatusMixRow } from '@/lib/types'

/** Mutable hook return; reset per test before render. */
let aggregateReturn: { data: StatusMixRow[] | undefined; isLoading: boolean } = {
  data: [],
  isLoading: false,
}

vi.mock('@/hooks/use-aggregate', () => ({
  useAggregate: () => aggregateReturn,
}))

// Recharts axes/tooltip only invoke their formatter props when their ticks/content
// actually paint, which jsdom does not do reliably. Stub the surface so `XAxis`
// runs its `tickFormatter` and `Tooltip` runs its `labelFormatter` deterministically,
// surfacing the formatted bucket labels as plain text for assertion.
vi.mock('recharts', () => ({
  ResponsiveContainer: ({ children }: { children: ReactNode }) => <div>{children}</div>,
  BarChart: ({ children, data }: { children: ReactNode; data: StatusMixRow[] }) => (
    <div data-testid="bar-chart" data-rows={data.length}>
      {children}
    </div>
  ),
  Bar: ({ name }: { name: string }) => <div data-testid="bar">{name}</div>,
  CartesianGrid: () => <div data-testid="grid" />,
  XAxis: ({
    tickFormatter,
    dataKey,
  }: {
    tickFormatter?: (v: string) => string
    dataKey: string
  }) => (
    <div data-testid="x-axis">
      {tickFormatter ? tickFormatter('2026-06-05T10:00:00.000Z') : dataKey}
    </div>
  ),
  YAxis: () => <div data-testid="y-axis" />,
  Tooltip: ({ labelFormatter }: { labelFormatter?: (label: unknown) => string }) => (
    <div data-testid="tooltip">
      {labelFormatter ? labelFormatter('2026-06-05T10:00:00.000Z') : ''}
    </div>
  ),
}))

const { StatusMix } = await import('./status-mix')

/** The hook is mocked, so the query only needs to satisfy the prop type. */
const query = { source: 'loki' } as const

beforeEach(() => {
  aggregateReturn = { data: [], isLoading: false }
})

afterEach(() => {
  cleanup()
  vi.clearAllMocks()
})

describe('StatusMix', () => {
  /** While the aggregate is loading, only the skeleton renders (no chart surface). */
  it('renders the skeleton while loading', () => {
    aggregateReturn = { data: undefined, isLoading: true }
    render(<StatusMix query={query} />)
    expect(screen.queryByTestId('bar-chart')).not.toBeInTheDocument()
  })

  /**
   * Populated buckets render the stacked bar chart with the four status series; the
   * axis tick and tooltip label formatters reshape the ISO bucket to an `HH:MM` label.
   */
  it('renders the stacked bar chart for populated buckets', () => {
    aggregateReturn = {
      data: [
        { bucket: '2026-06-05T10:00:00.000Z', s2xx: 10, s3xx: 2, s4xx: 1, s5xx: 3 },
        { bucket: '2026-06-05T10:01:00.000Z', s2xx: 5, s3xx: 0, s4xx: 4, s5xx: 1 },
      ],
      isLoading: false,
    }
    render(<StatusMix query={query} />)
    expect(screen.getByTestId('bar-chart')).toHaveAttribute('data-rows', '2')
    // The four status classes each get a labelled bar.
    expect(screen.getByText('2xx')).toBeInTheDocument()
    expect(screen.getByText('3xx')).toBeInTheDocument()
    expect(screen.getByText('4xx')).toBeInTheDocument()
    expect(screen.getByText('5xx')).toBeInTheDocument()
    // The bucket formatter produced a short time label (not the raw ISO string).
    const formatted = new Date('2026-06-05T10:00:00.000Z').toLocaleTimeString([], {
      hour: '2-digit',
      minute: '2-digit',
    })
    expect(screen.getByTestId('x-axis')).toHaveTextContent(formatted)
    expect(screen.getByTestId('tooltip')).toHaveTextContent(formatted)
  })

  /** An undefined data payload falls back to an empty series (`data ?? []`). */
  it('falls back to an empty series when data is undefined', () => {
    aggregateReturn = { data: undefined, isLoading: false }
    render(<StatusMix query={query} />)
    expect(screen.getByTestId('bar-chart')).toHaveAttribute('data-rows', '0')
  })
})
