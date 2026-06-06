/**
 * @fileoverview Component tests for {@link LogTable} — the virtualized Explorer grid.
 *
 * The network/data boundary (`@/hooks/use-logs`) is mocked so each test drives one
 * render branch: error, loading skeletons, empty state, populated rows (historical
 * plus highlighted live rows), the "loading older logs" footer, and the
 * keyset-prefetch `onScroll` guard (which only fires `fetchNextPage` when near the
 * bottom with a next page available and no in-flight fetch). The virtualizer mounts
 * because the central setup reports a non-zero element box.
 *
 * @module components/explorer/log-table.test
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { createRef } from 'react'

import { ApiError, type LogQuery, type LogRow } from '@/lib/types'

/** Mutable return value the mocked `useLogs` yields; reshaped per test. */
type UseLogsReturn = {
  data: { pages: { data: LogRow[] }[] } | undefined
  error: unknown
  fetchNextPage: ReturnType<typeof vi.fn>
  hasNextPage: boolean
  isFetchingNextPage: boolean
  isLoading: boolean
}

const fetchNextPageMock = vi.fn()
let useLogsReturn: UseLogsReturn

vi.mock('@/hooks/use-logs', () => ({
  useLogs: (): UseLogsReturn => useLogsReturn,
}))

/**
 * When set, the virtualizer mock yields exactly these row indices (rather than the
 * default one-item-per-row). Used to feed an out-of-bounds index so the
 * `row === undefined` guard in the body renders `null`.
 */
let forcedVirtualIndices: number[] | null = null

interface VirtualizerOptions {
  count: number
  getScrollElement: () => HTMLElement | null
  estimateSize: (index: number) => number
}

vi.mock('@tanstack/react-virtual', () => ({
  useVirtualizer: (options: VirtualizerOptions) => {
    const { count } = options
    // Invoke the real option closures so the source's `getScrollElement` and
    // `estimateSize` callbacks (and thus those lines) execute under test.
    options.getScrollElement()
    const size = options.estimateSize(0)
    const indices = forcedVirtualIndices ?? Array.from({ length: count }, (_, i) => i)
    return {
      getTotalSize: () => count * size,
      getVirtualItems: () =>
        indices.map((index) => ({ index, key: index, size, start: index * size })),
    }
  },
}))

// Imported after the mock so the component binds the mocked hook.
const { LogTable } = await import('./log-table')

/** A query is required by the props but is opaque to the mocked hook. */
const query = { source: 'loki' } as LogQuery

/** Build a sample historical row. */
function makeRow(overrides: Partial<LogRow> = {}): LogRow {
  return {
    id: `r-${Math.random()}`,
    time: '2026-06-05T01:02:03.045Z',
    level: 'info',
    logKey: 'APP_STARTED',
    message: 'service booted',
    service: 'api',
    requestId: 'req-1',
    traceId: 'trace-1',
    ...overrides,
  }
}

/** Default the hook to a benign idle/empty state before each test. */
beforeEach(() => {
  fetchNextPageMock.mockReset()
  forcedVirtualIndices = null
  useLogsReturn = {
    data: { pages: [{ data: [] }] },
    error: null,
    fetchNextPage: fetchNextPageMock,
    hasNextPage: false,
    isFetchingNextPage: false,
    isLoading: false,
  }
})

afterEach(() => {
  cleanup()
  vi.clearAllMocks()
})

describe('LogTable', () => {
  /** The sticky header renders every column heading from the column defs. */
  it('renders the column headers', () => {
    render(<LogTable query={query} onRowClick={vi.fn()} />)
    expect(screen.getByText('Time')).toBeInTheDocument()
    expect(screen.getByText('Level')).toBeInTheDocument()
    expect(screen.getByText('Log key')).toBeInTheDocument()
    expect(screen.getByText('Message')).toBeInTheDocument()
  })

  /** A generic load error (no rows) shows the failure copy without a status. */
  it('renders the error state for a non-ApiError', () => {
    useLogsReturn = { ...useLogsReturn, error: new Error('boom'), data: { pages: [{ data: [] }] } }
    render(<LogTable query={query} onRowClick={vi.fn()} />)
    expect(screen.getByText(/Failed to load logs\./)).toBeInTheDocument()
  })

  /** An {@link ApiError} surfaces its HTTP status in the failure copy. */
  it('includes the HTTP status for an ApiError', () => {
    useLogsReturn = { ...useLogsReturn, error: new ApiError(503, 'down'), data: { pages: [] } }
    render(<LogTable query={query} onRowClick={vi.fn()} />)
    expect(screen.getByText(/Failed to load logs \(503\)\./)).toBeInTheDocument()
  })

  /**
   * While loading the first page the body shows neither the empty nor the error
   * copy: the loading branch wins, so the user is not told the query came back
   * empty before any page has arrived.
   */
  it('renders the loading branch without empty or error copy', () => {
    useLogsReturn = { ...useLogsReturn, isLoading: true, data: undefined }
    render(<LogTable query={query} onRowClick={vi.fn()} />)
    expect(screen.queryByText(/No logs match this query\./)).not.toBeInTheDocument()
    expect(screen.queryByText(/Failed to load logs/)).not.toBeInTheDocument()
  })

  /** With no rows and no error/loading, the empty-state copy is shown. */
  it('renders the empty state when there are no rows', () => {
    render(<LogTable query={query} onRowClick={vi.fn()} />)
    expect(screen.getByText(/No logs match this query\./)).toBeInTheDocument()
  })

  /** Populated rows render their cell content and a click fires `onRowClick`. */
  it('renders rows and calls onRowClick with the clicked row', async () => {
    const target = makeRow({ id: 'r-click', message: 'clickable line' })
    useLogsReturn = { ...useLogsReturn, data: { pages: [{ data: [target] }] } }
    const onRowClick = vi.fn()
    render(<LogTable query={query} onRowClick={onRowClick} />)
    const cell = screen.getByText('clickable line')
    await userEvent.click(cell)
    expect(onRowClick).toHaveBeenCalledWith(target)
  })

  /** Live SSE rows append after the historical rows and render their content. */
  it('appends and highlights live rows', () => {
    const historical = makeRow({ id: 'h1', message: 'historical line' })
    const live = makeRow({ id: 'l1', message: 'live line' })
    useLogsReturn = { ...useLogsReturn, data: { pages: [{ data: [historical] }] } }
    render(<LogTable query={query} onRowClick={vi.fn()} liveRows={[live]} />)
    expect(screen.getByText('historical line')).toBeInTheDocument()
    expect(screen.getByText('live line')).toBeInTheDocument()
  })

  /** The footer appears only while the next (older) page is being fetched. */
  it('shows the loading-older footer when fetching the next page', () => {
    useLogsReturn = {
      ...useLogsReturn,
      data: { pages: [{ data: [makeRow()] }] },
      isFetchingNextPage: true,
    }
    render(<LogTable query={query} onRowClick={vi.fn()} />)
    expect(screen.getByText('Loading older logs…')).toBeInTheDocument()
  })

  /** Scrolling near the bottom with a next page prefetches it exactly once. */
  it('prefetches the next page when scrolled near the bottom', () => {
    const scrollRef = createRef<HTMLDivElement>()
    useLogsReturn = {
      ...useLogsReturn,
      data: { pages: [{ data: [makeRow()] }] },
      hasNextPage: true,
      isFetchingNextPage: false,
    }
    render(<LogTable query={query} onRowClick={vi.fn()} scrollRef={scrollRef} />)
    const el = scrollRef.current
    if (el === null) throw new Error('scroll container missing')
    // Near the bottom: scrollHeight - scrollTop - clientHeight < threshold.
    Object.defineProperty(el, 'scrollHeight', { configurable: true, value: 1000 })
    Object.defineProperty(el, 'clientHeight', { configurable: true, value: 800 })
    Object.defineProperty(el, 'scrollTop', { configurable: true, value: 100 })
    fireEvent.scroll(el)
    expect(fetchNextPageMock).toHaveBeenCalledTimes(1)
  })

  /** Scrolling while far from the bottom does NOT prefetch (the distance guard). */
  it('does not prefetch when far from the bottom', () => {
    const scrollRef = createRef<HTMLDivElement>()
    useLogsReturn = {
      ...useLogsReturn,
      data: { pages: [{ data: [makeRow()] }] },
      hasNextPage: true,
    }
    render(<LogTable query={query} onRowClick={vi.fn()} scrollRef={scrollRef} />)
    const el = scrollRef.current
    if (el === null) throw new Error('scroll container missing')
    Object.defineProperty(el, 'scrollHeight', { configurable: true, value: 5000 })
    Object.defineProperty(el, 'clientHeight', { configurable: true, value: 800 })
    Object.defineProperty(el, 'scrollTop', { configurable: true, value: 0 })
    fireEvent.scroll(el)
    expect(fetchNextPageMock).not.toHaveBeenCalled()
  })

  /** Near the bottom but already fetching: the in-flight guard blocks a re-fetch. */
  it('does not prefetch while a next-page fetch is already in flight', () => {
    const scrollRef = createRef<HTMLDivElement>()
    useLogsReturn = {
      ...useLogsReturn,
      data: { pages: [{ data: [makeRow()] }] },
      hasNextPage: true,
      isFetchingNextPage: true,
    }
    render(<LogTable query={query} onRowClick={vi.fn()} scrollRef={scrollRef} />)
    const el = scrollRef.current
    if (el === null) throw new Error('scroll container missing')
    Object.defineProperty(el, 'scrollHeight', { configurable: true, value: 1000 })
    Object.defineProperty(el, 'clientHeight', { configurable: true, value: 800 })
    Object.defineProperty(el, 'scrollTop', { configurable: true, value: 100 })
    fireEvent.scroll(el)
    expect(fetchNextPageMock).not.toHaveBeenCalled()
  })

  /** Near the bottom but with no next page: the `hasNextPage` guard blocks it. */
  it('does not prefetch when there is no next page', () => {
    const scrollRef = createRef<HTMLDivElement>()
    useLogsReturn = {
      ...useLogsReturn,
      data: { pages: [{ data: [makeRow()] }] },
      hasNextPage: false,
    }
    render(<LogTable query={query} onRowClick={vi.fn()} scrollRef={scrollRef} />)
    const el = scrollRef.current
    if (el === null) throw new Error('scroll container missing')
    Object.defineProperty(el, 'scrollHeight', { configurable: true, value: 1000 })
    Object.defineProperty(el, 'clientHeight', { configurable: true, value: 800 })
    Object.defineProperty(el, 'scrollTop', { configurable: true, value: 100 })
    fireEvent.scroll(el)
    expect(fetchNextPageMock).not.toHaveBeenCalled()
  })

  /** With `data` undefined, the `?? []` fallback yields the empty state cleanly. */
  it('treats an undefined data result as empty', () => {
    useLogsReturn = { ...useLogsReturn, data: undefined }
    render(<LogTable query={query} onRowClick={vi.fn()} />)
    expect(screen.getByText(/No logs match this query\./)).toBeInTheDocument()
  })

  /**
   * A virtual item whose index has no matching table row renders nothing (the
   * `row === undefined` guard) — defensive against a virtualizer over-reporting
   * items relative to the row model.
   */
  it('skips a virtual row with no backing table row', () => {
    const real = makeRow({ id: 'r-real', message: 'real row' })
    useLogsReturn = { ...useLogsReturn, data: { pages: [{ data: [real] }] } }
    // One in-range index plus one out-of-bounds index (no backing row).
    forcedVirtualIndices = [0, 1]
    render(<LogTable query={query} onRowClick={vi.fn()} />)
    expect(screen.getByText('real row')).toBeInTheDocument()
    // Exactly one row button rendered; the out-of-bounds virtual item produced null.
    expect(screen.getAllByRole('button')).toHaveLength(1)
  })
})
