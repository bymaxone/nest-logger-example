/**
 * @fileoverview Component tests for {@link ExplorerContent} — the Explorer body
 * that composes the faceted rail, query bar, volume histogram, virtualized table,
 * the live-tail control bar, and the detail drawer.
 *
 * Every hook the body composes (`useLogQuery`, `useLogStream`, `useFollowMode`)
 * and every child component is mocked so each test drives one branch: Live
 * off/on, the stream status pill (connecting / streaming / failed / paused),
 * the follow pause↔resume control, the "jump to latest" pill, and the row-click
 * path that opens the drawer.
 *
 * @module components/explorer/explorer-content.test
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

import type { LogRow } from '@/lib/types'
import type { LogQueryState } from '@/lib/filters'
import type { LogStream } from '@/lib/use-event-source'
import type { FollowMode } from '@/hooks/use-follow-mode'

/** Mutable hook returns reassigned per test before render. */
let queryState: LogQueryState
let streamState: LogStream
let followState: FollowMode

const setQueryMock = vi.fn()
const clearMock = vi.fn()
const pauseMock = vi.fn()
const resumeMock = vi.fn()
const jumpMock = vi.fn()

vi.mock('@/lib/filters', () => ({
  useLogQuery: (): LogQueryState => queryState,
}))

vi.mock('@/lib/use-event-source', () => ({
  useLogStream: (): LogStream => streamState,
}))

vi.mock('@/hooks/use-follow-mode', () => ({
  useFollowMode: (): FollowMode => followState,
}))

// Child components are replaced with light probes so the body's composition and
// branches are tested in isolation. The table probe exposes a button that fires
// `onRowClick` so the drawer-open path can be exercised.
vi.mock('./facet-rail', () => ({ FacetRail: () => <div data-testid="facet-rail" /> }))
vi.mock('./query-bar', () => ({ QueryBar: () => <div data-testid="query-bar" /> }))

const sampleRow: LogRow = {
  id: 'row-1',
  time: '2024-01-01T00:00:00.000Z',
  level: 'error',
  logKey: 'PAYMENT_CHARGE_FAIL',
  message: 'boom',
  service: 'api',
}

vi.mock('./log-table', () => ({
  LogTable: ({ onRowClick }: { onRowClick: (row: LogRow) => void }) => (
    <button type="button" data-testid="open-row" onClick={() => onRowClick(sampleRow)}>
      open row
    </button>
  ),
}))

vi.mock('./detail-drawer', () => ({
  DetailDrawer: ({ open, row }: { open: boolean; row: LogRow | null }) => (
    <div data-testid="detail-drawer" data-open={open} data-row={row?.logKey ?? ''} />
  ),
}))

vi.mock('@/components/charts/chart-card', () => ({
  ChartCard: ({ title, children }: { title: string; children: React.ReactNode }) => (
    <section aria-label={title}>{children}</section>
  ),
}))

vi.mock('@/components/charts/volume-bar', () => ({
  VolumeBar: ({ onBrush }: { onBrush: (from: string, to: string) => void }) => (
    <button type="button" data-testid="brush" onClick={() => onBrush('F', 'T')}>
      brush
    </button>
  ),
}))

// Imported after the mocks so the body binds the mocked modules.
const { ExplorerContent } = await import('./explorer-content')

/** A fully off (non-live) base state. */
function baseQuery(overrides: Partial<LogQueryState> = {}): LogQueryState {
  return {
    query: { source: 'loki', role: 'admin' },
    setQuery: setQueryMock,
    live: false,
    isRelative: true,
    ...overrides,
  } as unknown as LogQueryState
}

/** A stream state with all flags off and no rows. */
function baseStream(overrides: Partial<LogStream> = {}): LogStream {
  return { rows: [], clear: clearMock, connected: false, failed: false, ...overrides }
}

/** A follow state that is following (not paused) with no pending rows. */
function baseFollow(overrides: Partial<FollowMode> = {}): FollowMode {
  return {
    paused: false,
    newCount: 0,
    jumpToLatest: jumpMock,
    pause: pauseMock,
    resume: resumeMock,
    ...overrides,
  }
}

beforeEach(() => {
  queryState = baseQuery()
  streamState = baseStream()
  followState = baseFollow()
  vi.clearAllMocks()
})

afterEach(() => {
  cleanup()
})

describe('ExplorerContent', () => {
  /** With Live off, the live-tail control bar and jump pill are absent. */
  it('hides the live-tail bar when Live is off', () => {
    render(<ExplorerContent />)
    expect(screen.getByTestId('facet-rail')).toBeInTheDocument()
    expect(screen.getByTestId('query-bar')).toBeInTheDocument()
    expect(screen.queryByText('Streaming')).not.toBeInTheDocument()
    expect(screen.queryByText('Paused (absolute range)')).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /Pause/ })).not.toBeInTheDocument()
  })

  /** Brushing the volume histogram writes the absolute range and clears the preset. */
  it('writes an absolute range when the volume brush fires', async () => {
    const user = userEvent.setup()
    render(<ExplorerContent />)
    await user.click(screen.getByTestId('brush'))
    expect(setQueryMock).toHaveBeenCalledWith({ from: 'F', to: 'T', range: '' })
  })

  /** Clicking a table row opens the detail drawer with that row. */
  it('opens the drawer with the clicked row', async () => {
    const user = userEvent.setup()
    render(<ExplorerContent />)
    expect(screen.getByTestId('detail-drawer')).toHaveAttribute('data-open', 'false')
    await user.click(screen.getByTestId('open-row'))
    const drawer = screen.getByTestId('detail-drawer')
    expect(drawer).toHaveAttribute('data-open', 'true')
    expect(drawer).toHaveAttribute('data-row', 'PAYMENT_CHARGE_FAIL')
  })

  /** Live on + connected renders the "Streaming" status pill. */
  it('shows the Streaming pill when connected', () => {
    queryState = baseQuery({ live: true })
    streamState = baseStream({ connected: true, rows: [sampleRow] })
    render(<ExplorerContent />)
    expect(screen.getByText('Streaming')).toBeInTheDocument()
    expect(screen.getByText('1 live')).toBeInTheDocument()
  })

  /** Live on + stream enabled but not yet connected renders "Connecting…". */
  it('shows the Connecting pill while the stream is opening', () => {
    queryState = baseQuery({ live: true, isRelative: true })
    streamState = baseStream({ connected: false, failed: false })
    render(<ExplorerContent />)
    expect(screen.getByText('Connecting…')).toBeInTheDocument()
  })

  /** Live on with an absolute range disables the stream → "Paused (absolute range)". */
  it('shows the Paused pill when Live is on but the range is absolute', () => {
    queryState = baseQuery({ live: true, isRelative: false })
    streamState = baseStream({ connected: false, failed: false })
    render(<ExplorerContent />)
    expect(screen.getByText('Paused (absolute range)')).toBeInTheDocument()
  })

  /** A terminal stream failure renders the "Live tail failed — retry" pill. */
  it('shows the failure pill when the stream fails', () => {
    queryState = baseQuery({ live: true })
    streamState = baseStream({ failed: true })
    render(<ExplorerContent />)
    expect(screen.getByText('Live tail failed — retry')).toBeInTheDocument()
  })

  /** While following, the bar shows Pause; clicking it pauses follow-mode. */
  it('renders the Pause control while following and invokes pause', async () => {
    queryState = baseQuery({ live: true })
    followState = baseFollow({ paused: false })
    const user = userEvent.setup()
    render(<ExplorerContent />)
    const pauseButton = screen.getByRole('button', { name: /Pause/ })
    await user.click(pauseButton)
    expect(pauseMock).toHaveBeenCalledTimes(1)
  })

  /** While paused, the bar shows Resume; clicking it resumes follow-mode. */
  it('renders the Resume control while paused and invokes resume', async () => {
    queryState = baseQuery({ live: true })
    followState = baseFollow({ paused: true })
    const user = userEvent.setup()
    render(<ExplorerContent />)
    const resumeButton = screen.getByRole('button', { name: /Resume/ })
    await user.click(resumeButton)
    expect(resumeMock).toHaveBeenCalledTimes(1)
  })

  /** The Clear control empties the live buffer. */
  it('invokes clear from the live-tail bar', async () => {
    queryState = baseQuery({ live: true })
    const user = userEvent.setup()
    render(<ExplorerContent />)
    await user.click(screen.getByRole('button', { name: /Clear/ }))
    expect(clearMock).toHaveBeenCalledTimes(1)
  })

  /** When new rows arrive while paused, the "jump to latest" pill appears and jumps. */
  it('shows the jump-to-latest pill and jumps when there are new rows', async () => {
    queryState = baseQuery({ live: true })
    followState = baseFollow({ paused: true, newCount: 3 })
    const user = userEvent.setup()
    render(<ExplorerContent />)
    const jumpButton = screen.getByRole('button', { name: /3 new logs/ })
    await user.click(jumpButton)
    expect(jumpMock).toHaveBeenCalledTimes(1)
  })

  /** With Live on but no pending rows, the jump-to-latest pill is absent. */
  it('hides the jump-to-latest pill when there are no new rows', () => {
    queryState = baseQuery({ live: true })
    followState = baseFollow({ newCount: 0 })
    render(<ExplorerContent />)
    expect(screen.queryByRole('button', { name: /new logs/ })).not.toBeInTheDocument()
  })

  /** The live count label renders the exact row count (the `{stream.rows.length} live` format). */
  it('shows the exact live row count in the bar', () => {
    queryState = baseQuery({ live: true })
    streamState = baseStream({ connected: true, rows: [sampleRow, sampleRow] })
    render(<ExplorerContent />)
    expect(screen.getByText('2 live')).toBeInTheDocument()
  })

  /** The jump-to-latest button contains the exact count and label text. */
  it('renders the jump button with the exact count and label text', () => {
    queryState = baseQuery({ live: true })
    followState = baseFollow({ paused: true, newCount: 5 })
    render(<ExplorerContent />)
    const btn = screen.getByRole('button', { name: /5 new logs/ })
    expect(btn.textContent).toContain('5 new logs')
    expect(btn.textContent).toContain('Jump to latest')
  })

  /**
   * The jump-to-latest pill must NOT appear when Live is off, even when pending
   * rows are present. This kills the `live && newCount > 0` → `live || newCount > 0`
   * mutation: with `||`, `false || true` = true and the button would incorrectly show.
   */
  it('hides the jump-to-latest pill when Live is off even with pending rows', () => {
    queryState = baseQuery({ live: false })
    followState = baseFollow({ paused: true, newCount: 5 })
    render(<ExplorerContent />)
    expect(screen.queryByRole('button', { name: /new logs/ })).not.toBeInTheDocument()
  })

  /**
   * A single new row (newCount=1) is the minimum that shows the jump button.
   * Asserting this kills the `newCount > 0` → `newCount > 1` ArithmeticOperator mutation.
   */
  it('shows the jump-to-latest pill when exactly one new row is pending', () => {
    queryState = baseQuery({ live: true })
    followState = baseFollow({ paused: true, newCount: 1 })
    render(<ExplorerContent />)
    expect(screen.getByRole('button', { name: /1 new logs/ })).toBeInTheDocument()
  })
})
