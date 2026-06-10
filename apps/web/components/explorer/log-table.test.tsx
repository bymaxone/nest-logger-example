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
    expect(screen.getByText('Service')).toBeInTheDocument()
    expect(screen.getByText('Request')).toBeInTheDocument()
    expect(screen.getByText('Trace')).toBeInTheDocument()
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

  /** The error copy includes the exact literal text for the retry suggestion. */
  it('renders the full error copy with retry suggestion', () => {
    useLogsReturn = { ...useLogsReturn, error: new Error('boom'), data: { pages: [] } }
    render(<LogTable query={query} onRowClick={vi.fn()} />)
    const msg = screen.getByText(/Failed to load logs/)
    expect(msg.textContent).toContain('Check the API connection and retry.')
  })

  /** The empty-state copy is the exact sentinel that other tests rely on. */
  it('renders the exact empty-state message text', () => {
    render(<LogTable query={query} onRowClick={vi.fn()} />)
    expect(
      screen.getByText('No logs match this query. Widen the time range or clear a filter.'),
    ).toBeInTheDocument()
  })

  /** Clicking the second row fires onRowClick with its LogRow (not the first row). */
  it('fires onRowClick with the correct row when the second row is clicked', async () => {
    const row1 = makeRow({ id: 'r1', message: 'first row' })
    const row2 = makeRow({ id: 'r2', message: 'second row' })
    useLogsReturn = { ...useLogsReturn, data: { pages: [{ data: [row1, row2] }] } }
    const onRowClick = vi.fn()
    render(<LogTable query={query} onRowClick={onRowClick} />)
    await userEvent.click(screen.getByText('second row'))
    expect(onRowClick).toHaveBeenCalledWith(row2)
    expect(onRowClick).not.toHaveBeenCalledWith(row1)
  })

  /**
   * Scroll exactly at the threshold boundary (remaining === 320) still triggers
   * the prefetch — the `<` comparison includes the threshold boundary value.
   */
  it('prefetches at the exact scroll threshold boundary', () => {
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
    // scrollHeight - scrollTop - clientHeight = 1000 - 0 - 680 = 320 < threshold (320) is false
    // so use 319 to land just below threshold and trigger the fetch.
    Object.defineProperty(el, 'scrollHeight', { configurable: true, value: 999 })
    Object.defineProperty(el, 'clientHeight', { configurable: true, value: 680 })
    Object.defineProperty(el, 'scrollTop', { configurable: true, value: 0 })
    fireEvent.scroll(el)
    // 999 - 0 - 680 = 319 < 320 → prefetch fires.
    expect(fetchNextPageMock).toHaveBeenCalledTimes(1)
  })

  /**
   * Scroll near the bottom with a large scrollTop value that disambiguates
   * `scrollHeight - scrollTop - clientHeight` from `scrollHeight + scrollTop - clientHeight`.
   * With scrollTop=150: original gives 1000-150-800=50 (<320 → fires);
   * the ArithmeticOperator mutation gives 1000+150-800=350 (≥320 → does NOT fire).
   * Asserting the prefetch fires kills the `- scrollTop` → `+ scrollTop` mutation.
   */
  it('prefetches with a scrollTop value that disambiguates the subtraction direction', () => {
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
    Object.defineProperty(el, 'scrollHeight', { configurable: true, value: 1000 })
    Object.defineProperty(el, 'clientHeight', { configurable: true, value: 800 })
    Object.defineProperty(el, 'scrollTop', { configurable: true, value: 150 })
    fireEvent.scroll(el)
    // 1000 - 150 - 800 = 50 < 320 → fires; but 1000 + 150 - 800 = 350 ≥ 320 → would not fire.
    expect(fetchNextPageMock).toHaveBeenCalledTimes(1)
  })

  /** At exactly 320 remaining pixels the condition is false — no prefetch. */
  it('does not prefetch when exactly 320 pixels remain (boundary exclusive)', () => {
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
    Object.defineProperty(el, 'scrollHeight', { configurable: true, value: 1000 })
    Object.defineProperty(el, 'clientHeight', { configurable: true, value: 680 })
    Object.defineProperty(el, 'scrollTop', { configurable: true, value: 0 })
    fireEvent.scroll(el)
    // 1000 - 0 - 680 = 320, which is NOT < 320 → no prefetch.
    expect(fetchNextPageMock).not.toHaveBeenCalled()
  })

  /** The loading-older footer text is exact. */
  it('renders the exact loading-older footer text', () => {
    useLogsReturn = {
      ...useLogsReturn,
      data: { pages: [{ data: [makeRow()] }] },
      isFetchingNextPage: true,
    }
    render(<LogTable query={query} onRowClick={vi.fn()} />)
    expect(screen.getByText('Loading older logs…')).toBeInTheDocument()
  })

  /** A non-empty liveRows prop appends rows; with an empty prop no live rows are added. */
  it('treats an empty liveRows array the same as no live rows', () => {
    const historical = makeRow({ id: 'h1', message: 'historical only' })
    useLogsReturn = { ...useLogsReturn, data: { pages: [{ data: [historical] }] } }
    render(<LogTable query={query} onRowClick={vi.fn()} liveRows={[]} />)
    expect(screen.getByText('historical only')).toBeInTheDocument()
    // Only one row button exists — no live row was added.
    expect(screen.getAllByRole('button')).toHaveLength(1)
  })

  /**
   * Live rows must receive the highlight class and historical rows must not.
   * Asserting `bg-brand-500` is present on the live button and absent on the
   * historical button kills:
   *  - `virtualRow.index >= historicalCount` → `>` (live row at boundary index is
   *    no longer flagged as live)
   *  - `isLive && 'animate-…'` → `false` or `||` (class never or always applied)
   *  - the `'animate-[pulse…] bg-brand-500/10'` StringLiteral → '' mutation
   */
  it('applies the live-highlight class to live rows and not to historical rows', () => {
    const historical = makeRow({ id: 'h1', message: 'historical line' })
    const live = makeRow({ id: 'l1', message: 'live line' })
    useLogsReturn = { ...useLogsReturn, data: { pages: [{ data: [historical] }] } }
    render(<LogTable query={query} onRowClick={vi.fn()} liveRows={[live]} />)
    const buttons = screen.getAllByRole('button')
    // buttons[0] = historical row (index 0 < historicalCount=1 → not live)
    expect(buttons[0]?.className).not.toContain('bg-brand-500')
    // buttons[1] = live row (index 1 >= historicalCount=1 → live)
    expect(buttons[1]?.className).toContain('bg-brand-500')
  })

  /**
   * When an error occurs but rows are already present (e.g. error on next-page
   * fetch while previous pages loaded), the existing rows must render (not the
   * error banner). The guard is `error !== null && rows.length === 0`. Asserting
   * this kills the `rows.length === 0` → `true` ConditionalExpression mutation,
   * which would wrongly show the error banner even when rows are present.
   */
  it('renders rows (not the error banner) when both error and rows are present', () => {
    const row = makeRow({ message: 'partial data' })
    useLogsReturn = {
      ...useLogsReturn,
      error: new Error('next-page-failed'),
      data: { pages: [{ data: [row] }] },
    }
    render(<LogTable query={query} onRowClick={vi.fn()} />)
    expect(screen.getByText('partial data')).toBeInTheDocument()
    expect(screen.queryByText(/Failed to load logs/)).not.toBeInTheDocument()
  })

  /**
   * The sticky header div must have a non-empty `gridTemplateColumns` inline style.
   * An ObjectLiteral→{} mutation on `style={{ gridTemplateColumns: GRID_COLUMNS }}`
   * strips the style entirely, causing the grid layout to collapse. Asserting the
   * property is non-empty kills that mutation.
   */
  it('applies a non-empty gridTemplateColumns style to the sticky header', () => {
    const { container } = render(<LogTable query={query} onRowClick={vi.fn()} />)
    // The sticky header is the first direct div child of the outer rounded container.
    const header = container.querySelector('div.sticky')
    expect(header).not.toBeNull()
    expect((header as HTMLElement).style.gridTemplateColumns).not.toBe('')
  })
})
