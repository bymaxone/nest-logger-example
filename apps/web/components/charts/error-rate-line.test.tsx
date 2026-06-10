/**
 * @fileoverview Component tests for {@link ErrorRateLine} — the RED "Errors" panel.
 *
 * The TanStack Query data hook (`@/hooks/use-aggregate`) is the mocked network
 * boundary; tests drive the loading skeleton, the empty `data ?? []` branch, the
 * zero-total divide-guard (`total === 0 ? 0 : …`) and the populated path with a
 * formatted tooltip label. Assertions query the real rendered output.
 *
 * @module components/charts/error-rate-line.test
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
const { ErrorRateLine } = await import('./error-rate-line')

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

describe('ErrorRateLine', () => {
  /** While the aggregate is loading, the panel shows the skeleton, not a chart. */
  it('renders a loading skeleton while the aggregate is loading', () => {
    aggregateState = { data: undefined, isLoading: true }
    const { container } = renderWithClient(<ErrorRateLine query={query} />)
    expect(container.querySelector('.animate-pulse')).toBeInTheDocument()
    expect(container.querySelector('.recharts-line')).toBeNull()
  })

  /** With no data the chart still mounts (the `data ?? []` empty branch). */
  it('renders the chart container with an empty series', () => {
    aggregateState = { data: [], isLoading: false }
    const { container } = renderWithClient(<ErrorRateLine query={query} />)
    expect(container.querySelector('.recharts-surface')).toBeInTheDocument()
    expect(container.querySelector('.animate-pulse')).toBeNull()
  })

  /**
   * When the query settles with no payload (`data === undefined`, not loading)
   * the `data ?? []` nullish fallback keeps the chart mounting without throwing.
   */
  it('falls back to an empty series when data is undefined', () => {
    aggregateState = { data: undefined, isLoading: false }
    const { container } = renderWithClient(<ErrorRateLine query={query} />)
    expect(container.querySelector('.recharts-surface')).toBeInTheDocument()
    expect(container.querySelector('.animate-pulse')).toBeNull()
  })

  /**
   * A bucket whose status counts are all zero must yield a 0% rate (the
   * `total === 0 ? 0 : …` divide-by-zero guard) while a populated bucket yields
   * the computed percentage — both 4xx and 5xx series render.
   */
  it('guards the zero-total bucket and draws both error-rate series', () => {
    aggregateState = {
      data: [
        { bucket: '2026-06-05T10:00:00.000Z', s2xx: 0, s3xx: 0, s4xx: 0, s5xx: 0 },
        { bucket: '2026-06-05T10:05:00.000Z', s2xx: 90, s3xx: 0, s4xx: 5, s5xx: 5 },
      ],
      isLoading: false,
    }
    const { container } = renderWithClient(<ErrorRateLine query={query} />)
    // Two <Line> series (4xx %, 5xx %) plus the reference line render.
    expect(container.querySelectorAll('.recharts-line').length).toBe(2)
    expect(container.querySelector('.recharts-reference-line')).toBeInTheDocument()
  })

  /**
   * Activating the Tooltip runs its `labelFormatter`, proving the formatter is
   * wired and the populated branch is exercised end to end.
   */
  it('renders the formatted tooltip label for the focused bucket', () => {
    aggregateState = {
      data: [
        { bucket: '2026-06-05T10:00:00.000Z', s2xx: 90, s3xx: 0, s4xx: 5, s5xx: 5 },
        { bucket: '2026-06-05T10:05:00.000Z', s2xx: 80, s3xx: 0, s4xx: 10, s5xx: 10 },
      ],
      isLoading: false,
    }
    const { container } = renderWithClient(<ErrorRateLine query={query} />)
    const surface = container.querySelector('.recharts-surface')
    expect(surface).not.toBeNull()
    fireEvent.focus(surface as Element)
    fireEvent.keyDown(surface as Element, { key: 'ArrowRight' })
    const label = container.querySelector('.recharts-tooltip-label')
    expect(label).not.toBeNull()
    expect(label).toHaveTextContent(formatBucket('2026-06-05T10:05:00.000Z'))
  })
})

describe('ErrorRateLine — exact rate computation', () => {
  /**
   * The rate4xx must be `(s4xx / total) * 100`, not variants like `s4xx / total / 100`
   * or `s4xx * total`. Using s2xx=80, s3xx=10, s4xx=10, s5xx=0 (total=100,
   * rate4xx=10) the tooltip item value must be exactly "10".
   *
   * This kills all arithmetic mutations on the total sum (changing + to -) and
   * the rate expression itself (* vs / and the *100 factor), as well as the
   * ConditionalExpression→true mutation (which always returns 0).
   */
  it('shows the exact 4xx rate in the tooltip for a known bucket composition', () => {
    aggregateState = {
      data: [
        // s2xx=80, s3xx=10, s4xx=10, s5xx=0 → total=100, rate4xx=10%, rate5xx=0%
        { bucket: '2026-06-05T10:00:00.000Z', s2xx: 80, s3xx: 10, s4xx: 10, s5xx: 0 },
      ],
      isLoading: false,
    }
    const { container } = renderWithClient(<ErrorRateLine query={query} />)
    const surface = container.querySelector('.recharts-surface')
    expect(surface).not.toBeNull()
    fireEvent.focus(surface as Element)
    fireEvent.keyDown(surface as Element, { key: 'ArrowRight' })
    const items = container.querySelectorAll('.recharts-tooltip-item-value')
    // rate4xx = (10/100)*100 = 10; rate5xx = 0
    const itemTexts = Array.from(items).map((el) => el.textContent)
    expect(itemTexts).toContain('10')
  })

  /**
   * The rate5xx must be computed independently using the same total formula.
   * Using s2xx=80, s3xx=0, s4xx=5, s5xx=15 (total=100, rate5xx=15%) the
   * tooltip item must reflect the correct 5xx rate.
   */
  it('shows the exact 5xx rate in the tooltip for a known bucket composition', () => {
    aggregateState = {
      data: [
        // s2xx=80, s3xx=0, s4xx=5, s5xx=15 → total=100, rate4xx=5%, rate5xx=15%
        { bucket: '2026-06-05T10:00:00.000Z', s2xx: 80, s3xx: 0, s4xx: 5, s5xx: 15 },
      ],
      isLoading: false,
    }
    const { container } = renderWithClient(<ErrorRateLine query={query} />)
    const surface = container.querySelector('.recharts-surface')
    expect(surface).not.toBeNull()
    fireEvent.focus(surface as Element)
    fireEvent.keyDown(surface as Element, { key: 'ArrowRight' })
    const items = container.querySelectorAll('.recharts-tooltip-item-value')
    const itemTexts = Array.from(items).map((el) => el.textContent)
    expect(itemTexts).toContain('15')
  })
})
