/**
 * @fileoverview Component tests for {@link RequestsLine} — the RED "Rate" panel.
 *
 * The TanStack Query data hook (`@/hooks/use-aggregate`) is the mocked network
 * boundary; each test drives one of the hook's branches (loading skeleton,
 * empty data, populated series) and asserts the real rendered output via
 * Testing Library queries — never on fabricated class names.
 *
 * @module components/charts/requests-line.test
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import type { ReactElement } from 'react'

import type { LogQuery, StatusMixRow } from '@/lib/types'
import { formatBucket } from '@/lib/metrics'

/** Mutable value the mocked `useAggregate` returns; set per test before render. */
let aggregateState: { data: StatusMixRow[] | undefined; isLoading: boolean } = {
  data: [],
  isLoading: false,
}

vi.mock('@/hooks/use-aggregate', () => ({
  useAggregate: () => aggregateState,
}))

// Imported after the mock so the component binds the mocked hook.
const { RequestsLine } = await import('./requests-line')

/** A stable query object; its contents are irrelevant because the hook is mocked. */
const query: LogQuery = { source: 'postgres' }

/** Wrap a tree in a fresh QueryClient (retries off so failures surface at once). */
function renderWithClient(ui: ReactElement): ReturnType<typeof render> {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(<QueryClientProvider client={queryClient}>{ui}</QueryClientProvider>)
}

beforeEach(() => {
  aggregateState = { data: [], isLoading: false }
})

afterEach(() => {
  cleanup()
  vi.clearAllMocks()
})

describe('RequestsLine', () => {
  /** While the aggregate is loading, the panel shows the skeleton, not a chart. */
  it('renders a loading skeleton while the aggregate is loading', () => {
    aggregateState = { data: undefined, isLoading: true }
    const { container } = renderWithClient(<RequestsLine query={query} />)
    expect(container.querySelector('.animate-pulse')).toBeInTheDocument()
    expect(container.querySelector('.recharts-line')).toBeNull()
  })

  /** With no data the chart still mounts (empty series — the `data ?? []` branch). */
  it('renders the chart container with an empty series', () => {
    aggregateState = { data: [], isLoading: false }
    const { container } = renderWithClient(<RequestsLine query={query} />)
    expect(container.querySelector('.recharts-surface')).toBeInTheDocument()
    expect(container.querySelector('.animate-pulse')).toBeNull()
  })

  /**
   * With populated buckets the requests line and its bucket tick labels render,
   * and activating the Tooltip runs its `labelFormatter` — proving `statusTotals`
   * and the `formatBucket` tick/label formatters are wired through.
   */
  it('renders the requests line and the formatted tooltip label for populated data', () => {
    aggregateState = {
      data: [
        { bucket: '2026-06-05T10:00:00.000Z', s2xx: 5, s3xx: 1, s4xx: 2, s5xx: 0 },
        { bucket: '2026-06-05T10:05:00.000Z', s2xx: 8, s3xx: 0, s4xx: 1, s5xx: 1 },
      ],
      isLoading: false,
    }
    const { container } = renderWithClient(<RequestsLine query={query} />)
    expect(container.querySelector('.recharts-line')).toBeInTheDocument()
    // formatBucket renders an HH:MM tick for each bucket; at least one tick is shown.
    expect(container.querySelectorAll('.recharts-cartesian-axis-tick').length).toBeGreaterThan(0)
    // Keyboard navigation activates the Tooltip deterministically (recharts a11y
    // layer), which runs the `labelFormatter` over the focused bucket.
    const surface = container.querySelector('.recharts-surface')
    expect(surface).not.toBeNull()
    fireEvent.focus(surface as Element)
    fireEvent.keyDown(surface as Element, { key: 'ArrowRight' })
    const label = container.querySelector('.recharts-tooltip-label')
    expect(label).not.toBeNull()
    expect(label).toHaveTextContent(formatBucket('2026-06-05T10:05:00.000Z'))
  })
})
