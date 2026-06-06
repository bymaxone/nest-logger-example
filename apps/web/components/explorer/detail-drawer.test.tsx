/**
 * @fileoverview Component tests for {@link DetailDrawer} — the four-tab row
 * inspector. Covers the closed / no-row guard, the Overview "filter for" pivots,
 * the redacted Raw JSON view, the Context tab's loading / empty / populated
 * branches, the Trace tab's deep-link + cross-service pivot, and the
 * `traceUrl` base-URL validation (valid origin, invalid string, non-http scheme).
 *
 * The nuqs URL boundary (`@/lib/filters`) and the context network call
 * (`@/lib/api-client`) are mocked; TanStack Query is real (per-test client). The
 * JSON viewer is stubbed to a deterministic tree so the redacted value asserts.
 *
 * @module components/explorer/detail-drawer.test
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import type { ReactElement } from 'react'

import type { ContextResult, LogRow } from '@/lib/types'
import type { LogQueryState } from '@/lib/filters'

/** Captures the URL writes the drawer's pivots emit. */
const setQueryMock = vi.fn()

vi.mock('@/lib/filters', () => ({
  useLogQuery: (): LogQueryState =>
    ({
      query: { source: 'loki', role: 'admin' },
      setQuery: setQueryMock,
      live: false,
      isRelative: true,
    }) as unknown as LogQueryState,
}))

const getContextMock = vi.fn<(params: unknown, q: unknown) => Promise<ContextResult>>()

vi.mock('@/lib/api-client', () => ({
  getContext: getContextMock,
}))

// Deterministic stub for the third-party JSON viewer: render the value as text so
// the already-redacted `[REDACTED]` token (and other fields) can be asserted.
vi.mock('@uiw/react-json-view', () => ({
  default: ({ value }: { value: Record<string, unknown> }) => (
    <pre data-testid="json-view">{JSON.stringify(value)}</pre>
  ),
}))

vi.mock('@uiw/react-json-view/dark', () => ({ darkTheme: {} }))

// Imported after the mocks so the component binds the mocked modules.
const { DetailDrawer } = await import('./detail-drawer')

/** A fully populated row exercising every Overview field and the Trace deep-link. */
const fullRow: LogRow = {
  id: 'row-1',
  time: '2024-01-01T00:00:00.000Z',
  level: 'error',
  logKey: 'PAYMENT_CHARGE_FAIL',
  message: 'charge declined',
  service: 'api',
  tenantId: 'acme',
  requestId: 'req-1',
  traceId: 'trace-1',
  spanId: 'span-1',
  status: 500,
  durationMs: 42,
  payload: { msg: 'charge declined', card: '[REDACTED]' },
}

/** Wrap a tree in a fresh QueryClient (retries off so failures surface at once). */
function renderWithClient(ui: ReactElement): void {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  render(<QueryClientProvider client={queryClient}>{ui}</QueryClientProvider>)
}

beforeEach(() => {
  setQueryMock.mockReset()
  getContextMock.mockReset()
  getContextMock.mockResolvedValue({ before: [], match: null, after: [] })
})

afterEach(() => {
  cleanup()
})

describe('DetailDrawer', () => {
  /** A closed drawer renders no dialog content — the open gate must hold. */
  it('renders nothing when closed', () => {
    renderWithClient(<DetailDrawer row={fullRow} open={false} onOpenChange={vi.fn()} />)
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })

  /** Open with a null row renders the dialog shell but no tabs (the `row !== null` guard). */
  it('renders the dialog shell with no tabs when the row is null', () => {
    renderWithClient(<DetailDrawer row={null} open onOpenChange={vi.fn()} />)
    expect(screen.getByRole('dialog')).toBeInTheDocument()
    expect(screen.queryByRole('tab', { name: 'Overview' })).not.toBeInTheDocument()
  })

  /** The header shows the row's logKey and the Overview tab lists every field. */
  it('shows the logKey header and the Overview field list', () => {
    renderWithClient(<DetailDrawer row={fullRow} open onOpenChange={vi.fn()} />)
    expect(screen.getByRole('dialog')).toHaveTextContent('PAYMENT_CHARGE_FAIL')
    // Overview is the default tab; a representative field value is rendered.
    expect(screen.getByText('charge declined')).toBeInTheDocument()
    expect(screen.getByText('acme')).toBeInTheDocument()
  })

  /** A null/undefined field is skipped in the Overview list (the `raw == null` guard). */
  it('omits absent fields from the Overview list', () => {
    const sparse: LogRow = {
      id: 'row-2',
      time: '2024-01-01T00:00:00.000Z',
      level: 'info',
      logKey: 'ORDER_CREATE_SUCCESS',
      message: 'ok',
      service: 'api',
      tenantId: null,
      requestId: null,
      traceId: null,
      spanId: null,
      status: null,
      durationMs: null,
    }
    renderWithClient(<DetailDrawer row={sparse} open onOpenChange={vi.fn()} />)
    // tenantId is null here, so its "filter for" pivot is not in the field list.
    expect(screen.queryByText('acme')).not.toBeInTheDocument()
    // The filterable level field still renders a pivot.
    const filterButtons = screen.getAllByRole('button', { name: 'filter for' })
    expect(filterButtons.length).toBeGreaterThan(0)
  })

  /** Clicking a field's "filter for" pivots the URL state for that field. */
  it('applies a level filter pivot from the Overview tab', async () => {
    const user = userEvent.setup()
    renderWithClient(<DetailDrawer row={fullRow} open onOpenChange={vi.fn()} />)
    // The first filterable field in OVERVIEW_FIELDS is `level`.
    const pivots = screen.getAllByRole('button', { name: 'filter for' })
    await user.click(pivots[0] as HTMLElement)
    expect(setQueryMock).toHaveBeenCalledWith({ level: 'error' })
  })

  /** Each filterable field maps to its own URL key (covers the pivot switch arms). */
  it('maps every filterable Overview field to its URL key', async () => {
    const user = userEvent.setup()
    renderWithClient(<DetailDrawer row={fullRow} open onOpenChange={vi.fn()} />)
    const pivots = screen.getAllByRole('button', { name: 'filter for' })
    // Order follows OVERVIEW_FIELDS' filterable entries:
    // level, logKey, service, tenantId, requestId, traceId.
    for (const pivot of pivots) {
      await user.click(pivot)
    }
    expect(setQueryMock).toHaveBeenCalledWith({ level: 'error' })
    expect(setQueryMock).toHaveBeenCalledWith({ logKey: 'PAYMENT_CHARGE_FAIL' })
    expect(setQueryMock).toHaveBeenCalledWith({ service: 'api' })
    expect(setQueryMock).toHaveBeenCalledWith({ tenantId: 'acme' })
    expect(setQueryMock).toHaveBeenCalledWith({ requestId: 'req-1' })
    expect(setQueryMock).toHaveBeenCalledWith({ traceId: 'trace-1' })
  })

  /** The Raw JSON tab renders the already-redacted entry (no unmask). */
  it('shows the redacted entry in the Raw JSON tab', async () => {
    const user = userEvent.setup()
    renderWithClient(<DetailDrawer row={fullRow} open onOpenChange={vi.fn()} />)
    await user.click(screen.getByRole('tab', { name: 'Raw JSON' }))
    const view = await screen.findByTestId('json-view')
    expect(view).toHaveTextContent('[REDACTED]')
  })

  /** With no payload, the Raw JSON tab falls back to rendering the row itself. */
  it('falls back to the row when there is no payload', async () => {
    // A row with no `payload` key so the `row.payload ?? row` fallback fires.
    const noPayload: LogRow = {
      id: 'row-1',
      time: '2024-01-01T00:00:00.000Z',
      level: 'error',
      logKey: 'PAYMENT_CHARGE_FAIL',
      message: 'charge declined',
      service: 'api',
    }
    const user = userEvent.setup()
    renderWithClient(<DetailDrawer row={noPayload} open onOpenChange={vi.fn()} />)
    await user.click(screen.getByRole('tab', { name: 'Raw JSON' }))
    const view = await screen.findByTestId('json-view')
    expect(view).toHaveTextContent('PAYMENT_CHARGE_FAIL')
  })

  /** The Context tab shows a loading state while the query is in flight. */
  it('shows the Context loading state while fetching', async () => {
    // A never-resolving promise keeps the query pending so the loading branch renders.
    getContextMock.mockReturnValue(new Promise<ContextResult>(() => {}))
    const user = userEvent.setup()
    renderWithClient(<DetailDrawer row={fullRow} open onOpenChange={vi.fn()} />)
    await user.click(screen.getByRole('tab', { name: 'Context' }))
    expect(await screen.findByText('Loading context…')).toBeInTheDocument()
  })

  /** With no correlation id the Context query is disabled and shows the empty note. */
  it('shows the no-correlation-id note when the row has no requestId/traceId', async () => {
    const noCorrelation: LogRow = { ...fullRow, requestId: null, traceId: null }
    const user = userEvent.setup()
    renderWithClient(<DetailDrawer row={noCorrelation} open onOpenChange={vi.fn()} />)
    await user.click(screen.getByRole('tab', { name: 'Context' }))
    expect(await screen.findByText('No correlation id on this row.')).toBeInTheDocument()
    expect(getContextMock).not.toHaveBeenCalled()
  })

  /** Populated context renders surrounding lines, highlighting the matched row. */
  it('renders the surrounding context lines with the match highlighted', async () => {
    const before: LogRow = {
      id: 'b1',
      time: '2024-01-01T00:00:00.000Z',
      level: 'info',
      logKey: 'ORDER_VALIDATE_START',
      message: 'before line',
      service: 'api',
    }
    const match: LogRow = { ...fullRow, message: 'matched line' }
    const after: LogRow = {
      id: 'a1',
      time: '2024-01-01T00:00:00.000Z',
      level: 'warn',
      logKey: 'ORDER_VALIDATE_RETRY',
      message: 'after line',
      service: 'api',
    }
    getContextMock.mockResolvedValue({ before: [before], match, after: [after] })
    const user = userEvent.setup()
    renderWithClient(<DetailDrawer row={fullRow} open onOpenChange={vi.fn()} />)
    await user.click(screen.getByRole('tab', { name: 'Context' }))
    expect(await screen.findByText('before line')).toBeInTheDocument()
    expect(screen.getByText('matched line')).toBeInTheDocument()
    expect(screen.getByText('after line')).toBeInTheDocument()
    // The context query was issued with the row's requestId.
    expect(getContextMock).toHaveBeenCalledWith({ requestId: 'req-1' }, expect.anything())
  })

  /** When only a traceId is present, Context fetches by traceId (the else branch). */
  it('fetches context by traceId when there is no requestId', async () => {
    const traceOnly: LogRow = { ...fullRow, requestId: null }
    getContextMock.mockResolvedValue({ before: [], match: null, after: [] })
    const user = userEvent.setup()
    renderWithClient(<DetailDrawer row={traceOnly} open onOpenChange={vi.fn()} />)
    await user.click(screen.getByRole('tab', { name: 'Context' }))
    await waitFor(() =>
      expect(getContextMock).toHaveBeenCalledWith({ traceId: 'trace-1' }, expect.anything()),
    )
  })

  /** The Trace tab renders the Tempo deep-link and the cross-service pivot. */
  it('shows the Trace deep-link and pivot when a traceId is present', async () => {
    const user = userEvent.setup()
    renderWithClient(<DetailDrawer row={fullRow} open onOpenChange={vi.fn()} />)
    await user.click(screen.getByRole('tab', { name: 'Trace' }))
    const link = await screen.findByRole('link', { name: /View trace/ })
    expect(link).toHaveAttribute('href', expect.stringContaining('/explore'))
    expect(link).toHaveAttribute('target', '_blank')
    expect(screen.getByRole('button', { name: 'All logs for this trace' })).toBeInTheDocument()
  })

  /** "All logs for this trace" pivots to the whole trace and closes the drawer. */
  it('pivots to the full trace and closes the drawer', async () => {
    const onOpenChange = vi.fn()
    const user = userEvent.setup()
    renderWithClient(<DetailDrawer row={fullRow} open onOpenChange={onOpenChange} />)
    await user.click(screen.getByRole('tab', { name: 'Trace' }))
    await user.click(await screen.findByRole('button', { name: 'All logs for this trace' }))
    expect(setQueryMock).toHaveBeenCalledWith({ traceId: 'trace-1' })
    expect(onOpenChange).toHaveBeenCalledWith(false)
  })

  /** With no trace context the Trace tab shows the empty note (the `hasTrace` else). */
  it('shows the no-trace note when the row has no traceId', async () => {
    const noTrace: LogRow = { ...fullRow, traceId: null, spanId: null }
    const user = userEvent.setup()
    renderWithClient(<DetailDrawer row={noTrace} open onOpenChange={vi.fn()} />)
    await user.click(screen.getByRole('tab', { name: 'Trace' }))
    expect(await screen.findByText('No trace context on this row.')).toBeInTheDocument()
  })
})

describe('DetailDrawer traceUrl base-URL validation', () => {
  afterEach(() => {
    // Restore the real env and drop the freshly-evaluated module so the next
    // import re-reads the default Grafana base.
    vi.unstubAllEnvs()
    vi.resetModules()
    cleanup()
  })

  /**
   * A non-http(s) Grafana base falls back to `#` (the protocol guard). Stub the
   * env, reset the module registry, and re-import so the module-load
   * `GRAFANA_URL` reads the stubbed `javascript:` value.
   */
  it('uses a "#" href when the Grafana base is a non-http scheme', async () => {
    vi.stubEnv('NEXT_PUBLIC_GRAFANA_URL', 'javascript:alert(1)')
    vi.resetModules()
    const { DetailDrawer: Drawer } = await import('./detail-drawer')
    const user = userEvent.setup()
    renderWithClient(<Drawer row={fullRow} open onOpenChange={vi.fn()} />)
    await user.click(screen.getByRole('tab', { name: 'Trace' }))
    const link = await screen.findByRole('link', { name: /View trace/ })
    expect(link).toHaveAttribute('href', '#')
  })

  /**
   * An unparseable Grafana base falls back to `#` (the `new URL` catch). The
   * `'::::'` value has no valid scheme, so `new URL` throws on module load.
   */
  it('uses a "#" href when the Grafana base is unparseable', async () => {
    vi.stubEnv('NEXT_PUBLIC_GRAFANA_URL', '::::')
    vi.resetModules()
    const { DetailDrawer: Drawer } = await import('./detail-drawer')
    const user = userEvent.setup()
    renderWithClient(<Drawer row={fullRow} open onOpenChange={vi.fn()} />)
    await user.click(screen.getByRole('tab', { name: 'Trace' }))
    const link = await screen.findByRole('link', { name: /View trace/ })
    expect(link).toHaveAttribute('href', '#')
  })
})
