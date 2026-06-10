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

  /**
   * Null fields must never render the string "null" or "undefined" in the Overview list.
   * Asserting this kills the ConditionalExpression→false and LogicalOperator→&&
   * mutations on the `raw === null || raw === undefined` guard at L139 — both
   * would bypass the guard and call `String(null)` or `String(undefined)`, rendering
   * those literal strings as visible text.
   */
  it('does not render the text "null" or "undefined" for absent nullable fields', () => {
    const sparse: LogRow = {
      id: 'sparse-null-check',
      time: '2024-01-01T00:00:00.000Z',
      level: 'info',
      logKey: 'ORDER_OK',
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
    expect(screen.queryByText('null')).not.toBeInTheDocument()
    expect(screen.queryByText('undefined')).not.toBeInTheDocument()
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

describe('DetailDrawer Overview field labels', () => {
  /** Every OVERVIEW_FIELDS label renders as a dt element in the Overview tab. */
  it('renders all eleven field labels in the Overview tab', () => {
    renderWithClient(<DetailDrawer row={fullRow} open onOpenChange={vi.fn()} />)
    const expectedLabels = [
      'time',
      'level',
      'logKey',
      'service',
      'tenantId',
      'requestId',
      'traceId',
      'spanId',
      'status',
      'durationMs',
      'message',
    ]
    for (const label of expectedLabels) {
      expect(screen.getByText(label)).toBeInTheDocument()
    }
  })

  /** Non-filterable fields (time, spanId, status, durationMs, message) render no "filter for" button. */
  it('renders exactly six filter-for buttons for the filterable fields', () => {
    renderWithClient(<DetailDrawer row={fullRow} open onOpenChange={vi.fn()} />)
    const buttons = screen.getAllByRole('button', { name: 'filter for' })
    // Filterable fields: level, logKey, service, tenantId, requestId, traceId — 6 total.
    expect(buttons).toHaveLength(6)
  })

  /** Clicking the logKey filter pivot calls setQuery with the exact logKey value. */
  it('applies a logKey filter pivot from the Overview tab', async () => {
    const user = userEvent.setup()
    renderWithClient(<DetailDrawer row={fullRow} open onOpenChange={vi.fn()} />)
    const pivots = screen.getAllByRole('button', { name: 'filter for' })
    // logKey is the 2nd filterable field in OVERVIEW_FIELDS order.
    await user.click(pivots[1] as HTMLElement)
    expect(setQueryMock).toHaveBeenCalledWith({ logKey: 'PAYMENT_CHARGE_FAIL' })
  })

  /** Clicking the service filter pivot calls setQuery with the exact service value. */
  it('applies a service filter pivot from the Overview tab', async () => {
    const user = userEvent.setup()
    renderWithClient(<DetailDrawer row={fullRow} open onOpenChange={vi.fn()} />)
    const pivots = screen.getAllByRole('button', { name: 'filter for' })
    // service is the 3rd filterable field.
    await user.click(pivots[2] as HTMLElement)
    expect(setQueryMock).toHaveBeenCalledWith({ service: 'api' })
  })

  /** Clicking the tenantId filter pivot calls setQuery with the exact tenantId value. */
  it('applies a tenantId filter pivot from the Overview tab', async () => {
    const user = userEvent.setup()
    renderWithClient(<DetailDrawer row={fullRow} open onOpenChange={vi.fn()} />)
    const pivots = screen.getAllByRole('button', { name: 'filter for' })
    // tenantId is the 4th filterable field.
    await user.click(pivots[3] as HTMLElement)
    expect(setQueryMock).toHaveBeenCalledWith({ tenantId: 'acme' })
  })

  /** Clicking the requestId filter pivot calls setQuery with the exact requestId value. */
  it('applies a requestId filter pivot from the Overview tab', async () => {
    const user = userEvent.setup()
    renderWithClient(<DetailDrawer row={fullRow} open onOpenChange={vi.fn()} />)
    const pivots = screen.getAllByRole('button', { name: 'filter for' })
    // requestId is the 5th filterable field.
    await user.click(pivots[4] as HTMLElement)
    expect(setQueryMock).toHaveBeenCalledWith({ requestId: 'req-1' })
  })
})

describe('DetailDrawer Trace tab content', () => {
  /**
   * The panes JSON in the Grafana href encodes the refId, queryType, range, and
   * datasource. Decoding and asserting these kills StringLiteral mutations on
   * 'A', 'traceql', 'tempo', 'now-1h', and 'now'.
   */
  it('includes the queryType, datasource, refId and range in the Grafana panes href', async () => {
    const user = userEvent.setup()
    renderWithClient(<DetailDrawer row={fullRow} open onOpenChange={vi.fn()} />)
    await user.click(screen.getByRole('tab', { name: 'Trace' }))
    const link = await screen.findByRole('link', { name: /View trace/ })
    const href = link.getAttribute('href') ?? ''
    const decoded = decodeURIComponent(href)
    expect(decoded).toContain('"traceql"')
    expect(decoded).toContain('"now-1h"')
    expect(decoded).toContain('"now"')
    expect(decoded).toContain('"tempo"')
    expect(decoded).toContain('"A"')
  })

  /** The Trace tab shows the row's traceId and spanId labels. */
  it('shows traceId and spanId labels in the Trace tab', async () => {
    const user = userEvent.setup()
    renderWithClient(<DetailDrawer row={fullRow} open onOpenChange={vi.fn()} />)
    await user.click(screen.getByRole('tab', { name: 'Trace' }))
    // The Trace tab renders "traceId" and "spanId" as mono label spans.
    const traceContent = await screen.findByRole('button', { name: 'All logs for this trace' })
    expect(traceContent).toBeInTheDocument()
    expect(screen.getByText('traceId')).toBeInTheDocument()
    expect(screen.getByText('spanId')).toBeInTheDocument()
  })

  /** When traceId is null the Trace tab shows '—' as the fallback value. */
  it('shows the dash fallback for a null traceId in the Trace tab', async () => {
    const noTrace: LogRow = { ...fullRow, traceId: null, spanId: null }
    const user = userEvent.setup()
    renderWithClient(<DetailDrawer row={noTrace} open onOpenChange={vi.fn()} />)
    await user.click(screen.getByRole('tab', { name: 'Trace' }))
    // Both traceId and spanId are null, so both render '—'.
    const dashes = await screen.findAllByText('—')
    expect(dashes.length).toBeGreaterThanOrEqual(2)
  })

  /** The "View trace" link href encodes the traceId in the Grafana panes query. */
  it('encodes the traceId in the View-trace href', async () => {
    const user = userEvent.setup()
    renderWithClient(<DetailDrawer row={fullRow} open onOpenChange={vi.fn()} />)
    await user.click(screen.getByRole('tab', { name: 'Trace' }))
    const link = await screen.findByRole('link', { name: /View trace/ })
    const href = link.getAttribute('href') ?? ''
    // The href must contain the trace id encoded in the panes JSON.
    expect(href).toContain('trace-1')
    // The href must reference the configured Grafana orgId.
    expect(href).toContain('orgId=1')
    // schemaVersion=1 must be present in the URL.
    expect(href).toContain('schemaVersion=1')
  })

  /** The "View trace" link target is _blank and has the noopener rel. */
  it('opens the View-trace link in a new tab with noopener rel', async () => {
    const user = userEvent.setup()
    renderWithClient(<DetailDrawer row={fullRow} open onOpenChange={vi.fn()} />)
    await user.click(screen.getByRole('tab', { name: 'Trace' }))
    const link = await screen.findByRole('link', { name: /View trace/ })
    expect(link).toHaveAttribute('target', '_blank')
    expect(link).toHaveAttribute('rel', 'noopener noreferrer')
  })

  /**
   * The top-level panes entry must have `"datasource":"tempo"`.
   * Asserting the exact string (without a loose `toContain('"tempo"')`)
   * kills the L70 StringLiteral→"" mutation: if the datasource field were
   * replaced with "", the decoded href would contain `"datasource":""` instead.
   */
  it('sets the top-level panes datasource to "tempo"', async () => {
    const user = userEvent.setup()
    renderWithClient(<DetailDrawer row={fullRow} open onOpenChange={vi.fn()} />)
    await user.click(screen.getByRole('tab', { name: 'Trace' }))
    const link = await screen.findByRole('link', { name: /View trace/ })
    const decoded = decodeURIComponent(link.getAttribute('href') ?? '')
    expect(decoded).toContain('"datasource":"tempo"')
  })

  /**
   * The nested query datasource object must carry both `"type":"tempo"` and
   * `"uid":"tempo"`. Asserting both kills the L74 ObjectLiteral→{} mutation
   * (which would strip the object) and both StringLiteral→"" mutations inside it.
   */
  it('sets type:"tempo" and uid:"tempo" on the nested query datasource', async () => {
    const user = userEvent.setup()
    renderWithClient(<DetailDrawer row={fullRow} open onOpenChange={vi.fn()} />)
    await user.click(screen.getByRole('tab', { name: 'Trace' }))
    const link = await screen.findByRole('link', { name: /View trace/ })
    const decoded = decodeURIComponent(link.getAttribute('href') ?? '')
    expect(decoded).toContain('"type":"tempo"')
    expect(decoded).toContain('"uid":"tempo"')
  })
})

describe('DetailDrawer Context tab — null match line', () => {
  /** When context has no match line the surrounding lines still render. */
  it('renders before/after lines without a highlighted match when match is null', async () => {
    const before: LogRow = {
      id: 'b1',
      time: '2024-01-01T00:00:00.000Z',
      level: 'info',
      logKey: 'ORDER_VALIDATE_START',
      message: 'before only',
      service: 'api',
    }
    const after: LogRow = {
      id: 'a1',
      time: '2024-01-01T00:00:00.000Z',
      level: 'warn',
      logKey: 'ORDER_VALIDATE_RETRY',
      message: 'after only',
      service: 'api',
    }
    getContextMock.mockResolvedValue({ before: [before], match: null, after: [after] })
    const user = userEvent.setup()
    renderWithClient(<DetailDrawer row={fullRow} open onOpenChange={vi.fn()} />)
    await user.click(screen.getByRole('tab', { name: 'Context' }))
    expect(await screen.findByText('before only')).toBeInTheDocument()
    expect(screen.getByText('after only')).toBeInTheDocument()
  })

  /** When context data is undefined (query not yet resolved) the loading note persists. */
  it('shows the no-correlation-id note for a row with an empty requestId (|| fallback)', async () => {
    const emptyRequestId: LogRow = { ...fullRow, requestId: '', traceId: null }
    const user = userEvent.setup()
    renderWithClient(<DetailDrawer row={emptyRequestId} open onOpenChange={vi.fn()} />)
    await user.click(screen.getByRole('tab', { name: 'Context' }))
    // requestId '' is falsy; traceId is null → correlationId becomes null → query disabled.
    expect(await screen.findByText('No correlation id on this row.')).toBeInTheDocument()
    expect(getContextMock).not.toHaveBeenCalled()
  })

  /**
   * The matched context line (line.id === rowId) must carry `bg-brand-500/15`.
   * Asserting this kills the L199 ConditionalExpression→false mutation (which would
   * remove the highlight from every line) and the L200 StringLiteral→"" mutation
   * (which would strip the brand background class). A companion assertion that
   * non-matched lines do NOT carry the brand bg kills the inverse false-positive.
   */
  it('highlights only the matched context line with the brand background class', async () => {
    const before: LogRow = {
      id: 'ctx-before',
      time: '2024-01-01T00:00:00.000Z',
      level: 'info',
      logKey: 'ORDER_START',
      message: 'before line',
      service: 'api',
    }
    const match: LogRow = { ...fullRow, message: 'matched line' }
    const after: LogRow = {
      id: 'ctx-after',
      time: '2024-01-01T00:00:00.000Z',
      level: 'warn',
      logKey: 'ORDER_RETRY',
      message: 'after line',
      service: 'api',
    }
    getContextMock.mockResolvedValue({ before: [before], match, after: [after] })
    const user = userEvent.setup()
    renderWithClient(<DetailDrawer row={fullRow} open onOpenChange={vi.fn()} />)
    await user.click(screen.getByRole('tab', { name: 'Context' }))
    await screen.findByText('before line')
    // Exactly one line in the context list carries the brand highlight.
    const highlighted = Array.from(document.querySelectorAll('div')).filter((el) =>
      el.classList.contains('bg-brand-500/15'),
    )
    expect(highlighted).toHaveLength(1)
    // The highlighted element contains the matched line's message text.
    expect(highlighted[0]).toHaveTextContent('matched line')
    // Non-highlighted lines carry the muted text class (kills L201 StringLiteral→"").
    // Filter to divs whose className DIRECTLY contains the class token, not ancestor
    // wrappers whose textContent happens to include the message text.
    const unhighlightedRows = Array.from(document.querySelectorAll('div')).filter((el) =>
      el.classList.contains('text-white/55'),
    )
    expect(unhighlightedRows.length).toBeGreaterThan(0)
    // Level spans inside each context row carry a non-empty inline color style
    // (kills L204 ObjectLiteral→{} and StringLiteral→"" mutations on the style prop).
    const coloredSpans = Array.from(document.querySelectorAll('span')).filter(
      (el) => el.style.color !== '',
    )
    expect(coloredSpans.length).toBeGreaterThan(0)
  })
})

describe('DetailDrawer Trace tab — empty traceId', () => {
  /**
   * An empty-string traceId must be treated as absent — `hasTrace` must be false.
   * `hasTrace = row.traceId != null && row.traceId !== ''`:
   *  - `'' != null` is true (kills the `!= null` → `false` mutation)
   *  - `'' !== ''` is false → hasTrace = false → "No trace context" renders
   * Asserting this kills the `row.traceId !== ''` → `row.traceId !== 'Stryker was here'`
   * StringLiteral mutation (which would make hasTrace=true for an empty traceId).
   */
  it('treats an empty-string traceId as absent in the Trace tab', async () => {
    const emptyTrace: LogRow = { ...fullRow, traceId: '', spanId: null }
    const user = userEvent.setup()
    renderWithClient(<DetailDrawer row={emptyTrace} open onOpenChange={vi.fn()} />)
    await user.click(screen.getByRole('tab', { name: 'Trace' }))
    expect(await screen.findByText('No trace context on this row.')).toBeInTheDocument()
    expect(screen.queryByRole('link', { name: /View trace/ })).not.toBeInTheDocument()
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

  /**
   * A Grafana base using `https` is a valid scheme, so the trace link is NOT
   * the `#` fallback. Asserting the non-fallback value kills the
   * `base.protocol !== 'https:'` → `!== ''` mutation (if mutated, `https:`
   * would fail the scheme check and return `#` instead of the real URL).
   */
  it('renders a real trace link when the Grafana base uses https', async () => {
    vi.stubEnv('NEXT_PUBLIC_GRAFANA_URL', 'https://grafana.example.com')
    vi.resetModules()
    const { DetailDrawer: Drawer } = await import('./detail-drawer')
    const user = userEvent.setup()
    renderWithClient(<Drawer row={fullRow} open onOpenChange={vi.fn()} />)
    await user.click(screen.getByRole('tab', { name: 'Trace' }))
    const link = await screen.findByRole('link', { name: /View trace/ })
    expect(link.getAttribute('href')).not.toBe('#')
    expect(link.getAttribute('href')).toContain('https://grafana.example.com')
  })
})
