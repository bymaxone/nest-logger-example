/**
 * @fileoverview Component tests for {@link RedactionHero} — the requestId picker
 * gate, the same-record query lifecycle (loading / error / success), the
 * side-by-side record views (present row vs empty per backend), and the active
 * redact-paths dialog (loading / error / populated).
 *
 * The TanStack Query layer is real (wrapped in a per-test `QueryClientProvider`);
 * the URL filter (`@/lib/filters`), the RBAC identity (`@/hooks/use-rbac`), the
 * network boundary (`@/lib/maintenance-api`), and the heavy JSON viewer
 * (`@uiw/react-json-view`) are mocked so each test drives one behaviour.
 *
 * @module components/maintenance/redaction-hero.test
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import type { ReactElement } from 'react'

import type { LogQuery, LogRow, RbacContext } from '@/lib/types'
import type { LogQueryState } from '@/lib/filters'
import type { SameRecord } from '@/lib/maintenance-api'

/** The compiled query the mocked `useLogQuery` returns. */
const currentQuery: LogQuery = { source: 'loki', role: 'admin' }

vi.mock('@/lib/filters', () => ({
  useLogQuery: (): LogQueryState =>
    ({
      query: currentQuery,
      setQuery: vi.fn(),
      live: false,
      isRelative: true,
    }) as unknown as LogQueryState,
}))

vi.mock('@/hooks/use-rbac', () => ({
  useRbac: (): RbacContext => ({ role: 'admin', tenantId: '' }),
}))

const getSameRecordMock = vi.fn<(id: unknown, query: unknown) => Promise<SameRecord>>()
const getActiveRedactPathsMock = vi.fn<(rbac: unknown) => Promise<string[]>>()

vi.mock('@/lib/maintenance-api', () => ({
  getSameRecord: getSameRecordMock,
  getActiveRedactPaths: getActiveRedactPathsMock,
}))

// The JSON viewer is replaced with a trivial stub that renders the serialized
// value so tests can assert the redacted payload reached the view, without the
// viewer's heavy DOM. The mock factory must be self-contained.
vi.mock('@uiw/react-json-view', () => ({
  default: ({
    value,
    displayDataTypes,
    enableClipboard,
  }: {
    value: unknown
    displayDataTypes?: boolean
    enableClipboard?: boolean
  }) => (
    <pre
      data-testid="json-view"
      data-display-data-types={String(displayDataTypes)}
      data-enable-clipboard={String(enableClipboard)}
    >
      {JSON.stringify(value)}
    </pre>
  ),
}))

vi.mock('@uiw/react-json-view/dark', () => ({ darkTheme: {} }))

// Imported after the mocks so the component binds the mocked modules.
const { RedactionHero } = await import('./redaction-hero')

/** Wrap a tree in a fresh QueryClient (retries off so failures surface at once). */
function renderWithClient(ui: ReactElement): void {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  render(<QueryClientProvider client={queryClient}>{ui}</QueryClientProvider>)
}

/** A minimal redacted log row for the side-by-side proof. */
function makeRow(overrides: Partial<LogRow> = {}): LogRow {
  return {
    id: 'row-1',
    time: '2026-06-05T00:00:00.000Z',
    level: 'info',
    logKey: 'PII_DEMO_SIGNUP',
    message: 'signup',
    service: 'api',
    payload: { email: '[REDACTED]' },
    ...overrides,
  }
}

beforeEach(() => {
  getSameRecordMock.mockReset()
  getActiveRedactPathsMock.mockReset()
  getActiveRedactPathsMock.mockResolvedValue([])
})

afterEach(() => {
  cleanup()
  vi.clearAllMocks()
})

describe('RedactionHero', () => {
  /** With no requestId typed, the load button is disabled and no query fires. */
  it('disables the load button until a requestId is entered', () => {
    renderWithClient(<RedactionHero />)
    expect(screen.getByRole('button', { name: 'Load record' })).toBeDisabled()
    expect(getSameRecordMock).not.toHaveBeenCalled()
  })

  /** A whitespace-only requestId is trimmed to empty and keeps the button disabled. */
  it('keeps the load button disabled for whitespace-only input', async () => {
    const user = userEvent.setup()
    renderWithClient(<RedactionHero />)
    await user.type(screen.getByLabelText(/requestId/), '   ')
    expect(screen.getByRole('button', { name: 'Load record' })).toBeDisabled()
  })

  /** Loading a record runs the same-record query and shows the loading hint first. */
  it('shows the loading hint while the same-record query is in flight', async () => {
    let resolve!: (value: SameRecord) => void
    getSameRecordMock.mockReturnValue(
      new Promise<SameRecord>((r) => {
        resolve = r
      }),
    )
    const user = userEvent.setup()
    renderWithClient(<RedactionHero />)
    await user.type(screen.getByLabelText(/requestId/), 'req_42')
    await user.click(screen.getByRole('button', { name: 'Load record' }))
    expect(await screen.findByText('Loading record…')).toBeInTheDocument()
    expect(getSameRecordMock).toHaveBeenCalledWith({ requestId: 'req_42' }, currentQuery)
    resolve({ postgres: [], loki: [] })
  })

  /** A rejected same-record query surfaces the error message. */
  it('shows an error message when the same-record query rejects', async () => {
    getSameRecordMock.mockRejectedValue(new Error('boom'))
    const user = userEvent.setup()
    renderWithClient(<RedactionHero />)
    await user.type(screen.getByLabelText(/requestId/), 'req_42')
    await user.click(screen.getByRole('button', { name: 'Load record' }))
    expect(await screen.findByText('Failed to load the record.')).toBeInTheDocument()
  })

  /** A successful load renders both backends; a present row renders its payload. */
  it('renders the redacted payload for both backends when a row is present', async () => {
    getSameRecordMock.mockResolvedValue({ postgres: [makeRow()], loki: [makeRow()] })
    const user = userEvent.setup()
    renderWithClient(<RedactionHero />)
    await user.type(screen.getByLabelText(/requestId/), 'req_42')
    await user.click(screen.getByRole('button', { name: 'Load record' }))
    expect(await screen.findByText('Postgres')).toBeInTheDocument()
    expect(screen.getByText('Loki')).toBeInTheDocument()
    const views = await screen.findAllByTestId('json-view')
    expect(views).toHaveLength(2)
    expect(views[0]).toHaveTextContent('[REDACTED]')
  })

  /** A row without a payload falls back to rendering the row object itself. */
  it('renders the row object when the payload field is absent', async () => {
    // Build a row with no `payload` key so the absent-payload fallback is exercised.
    const row: LogRow = {
      id: 'row-1',
      time: '2026-06-05T00:00:00.000Z',
      level: 'info',
      logKey: 'PII_DEMO_SIGNUP',
      message: 'signup',
      service: 'api',
    }
    getSameRecordMock.mockResolvedValue({ postgres: [row], loki: [] })
    const user = userEvent.setup()
    renderWithClient(<RedactionHero />)
    await user.type(screen.getByLabelText(/requestId/), 'req_42')
    await user.click(screen.getByRole('button', { name: 'Load record' }))
    const view = await screen.findByTestId('json-view')
    expect(view).toHaveTextContent('PII_DEMO_SIGNUP')
  })

  /** An empty backend result shows the per-label "no matching record" fallback. */
  it('shows the empty fallback for a backend with no matching record', async () => {
    getSameRecordMock.mockResolvedValue({ postgres: [], loki: [] })
    const user = userEvent.setup()
    renderWithClient(<RedactionHero />)
    await user.type(screen.getByLabelText(/requestId/), 'req_42')
    await user.click(screen.getByRole('button', { name: 'Load record' }))
    expect(await screen.findByText('No matching record in Postgres.')).toBeInTheDocument()
    expect(screen.getByText('No matching record in Loki.')).toBeInTheDocument()
  })

  /** The redact-paths dialog opens and lists the fetched paths with a count. */
  it('opens the redact-paths dialog and lists the fetched paths', async () => {
    getActiveRedactPathsMock.mockResolvedValue(['email', 'password'])
    const user = userEvent.setup()
    renderWithClient(<RedactionHero />)
    const trigger = await screen.findByRole('button', {
      name: 'View active redact paths (2)',
    })
    await user.click(trigger)
    expect(await screen.findByText('Active redact paths')).toBeInTheDocument()
    expect(screen.getByText('email')).toBeInTheDocument()
    expect(screen.getByText('password')).toBeInTheDocument()
  })

  /** While the paths query is pending, the dialog shows its loading row. */
  it('shows the loading row in the dialog while paths are loading', async () => {
    let resolvePaths!: (value: string[]) => void
    getActiveRedactPathsMock.mockReturnValue(
      new Promise<string[]>((r) => {
        resolvePaths = r
      }),
    )
    const user = userEvent.setup()
    renderWithClient(<RedactionHero />)
    await user.click(screen.getByRole('button', { name: 'View active redact paths' }))
    expect(await screen.findByText('Loading…')).toBeInTheDocument()
    resolvePaths([])
  })

  /** A rejected paths query shows the dialog error row. */
  it('shows the error row in the dialog when the paths query rejects', async () => {
    getActiveRedactPathsMock.mockRejectedValue(new Error('nope'))
    const user = userEvent.setup()
    renderWithClient(<RedactionHero />)
    await waitFor(() => expect(getActiveRedactPathsMock).toHaveBeenCalled())
    await user.click(screen.getByRole('button', { name: 'View active redact paths' }))
    expect(await screen.findByText('Failed to load redact paths.')).toBeInTheDocument()
  })

  /**
   * The JSON viewer is rendered with `displayDataTypes` and `enableClipboard`
   * both false. Kills the BooleanLiteral→true mutations on those two props.
   */
  it('renders the JSON viewer with data types and clipboard disabled', async () => {
    getSameRecordMock.mockResolvedValue({ postgres: [makeRow()], loki: [makeRow()] })
    const user = userEvent.setup()
    renderWithClient(<RedactionHero />)
    await user.type(screen.getByLabelText(/requestId/), 'req_42')
    await user.click(screen.getByRole('button', { name: 'Load record' }))
    const views = await screen.findAllByTestId('json-view')
    expect(views[0]).toHaveAttribute('data-display-data-types', 'false')
    expect(views[0]).toHaveAttribute('data-enable-clipboard', 'false')
  })

  /**
   * The redact-paths query registers under `['redact-paths', role, tenantId]`.
   * Kills the ArrayDeclaration→[] and `'redact-paths'`→"" mutations on its key.
   */
  it('registers the redact-paths query under the role/tenant-scoped key', async () => {
    getActiveRedactPathsMock.mockResolvedValue([])
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
    render(
      <QueryClientProvider client={client}>
        <RedactionHero />
      </QueryClientProvider>,
    )
    await waitFor(() => {
      const keys = client
        .getQueryCache()
        .getAll()
        .map((q) => q.queryKey)
      expect(keys).toContainEqual(['redact-paths', 'admin', ''])
    })
  })

  /**
   * Once a record is loaded the same-record query registers under a key whose
   * first two entries are the literal `'same-record'` tag and the active
   * requestId. Kills the ArrayDeclaration→[] and `'same-record'`→"" mutations.
   */
  it('registers the same-record query under a key carrying the active requestId', async () => {
    getSameRecordMock.mockResolvedValue({ postgres: [], loki: [] })
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
    const user = userEvent.setup()
    render(
      <QueryClientProvider client={client}>
        <RedactionHero />
      </QueryClientProvider>,
    )
    await user.type(screen.getByLabelText(/requestId/), 'req_42')
    await user.click(screen.getByRole('button', { name: 'Load record' }))
    await waitFor(() => {
      const keys = client
        .getQueryCache()
        .getAll()
        .map((q) => q.queryKey)
      expect(
        keys.some((k) => Array.isArray(k) && k[0] === 'same-record' && k[1] === 'req_42'),
      ).toBe(true)
    })
  })

  /**
   * The same-record query is gated by `enabled`, so it must not fire on mount
   * while `active` is null. Kills the ConditionalExpression→true mutation that
   * would always enable the query. The always-on redact-paths call confirms
   * effects have flushed before asserting `getSameRecord` was never called.
   */
  it('does not run the same-record query before a requestId is loaded', async () => {
    renderWithClient(<RedactionHero />)
    // The redact-paths query resolving to [] (the "(0)" count rendering) proves the
    // initial query cycle elapsed; the gated same-record query must stay untouched.
    await screen.findByRole('button', { name: 'View active redact paths (0)' })
    expect(getSameRecordMock).not.toHaveBeenCalled()
  })

  /**
   * The empty-string guard only blocks `''`, so any other non-empty requestId
   * enables the query. Kills the StringLiteral mutation that swaps `''` for a
   * sentinel (which would wrongly disable the query for that exact value).
   */
  it('enables the same-record query for any non-empty requestId', async () => {
    getSameRecordMock.mockResolvedValue({ postgres: [], loki: [] })
    const user = userEvent.setup()
    renderWithClient(<RedactionHero />)
    await user.type(screen.getByLabelText(/requestId/), 'Stryker was here!')
    await user.click(screen.getByRole('button', { name: 'Load record' }))
    await waitFor(() =>
      expect(getSameRecordMock).toHaveBeenCalledWith(
        { requestId: 'Stryker was here!' },
        currentQuery,
      ),
    )
  })

  /**
   * Leading/trailing whitespace is trimmed before the requestId becomes active.
   * Kills the MethodExpression mutation that drops the `.trim()` call.
   */
  it('trims surrounding whitespace from the requestId before loading', async () => {
    getSameRecordMock.mockResolvedValue({ postgres: [], loki: [] })
    const user = userEvent.setup()
    renderWithClient(<RedactionHero />)
    await user.type(screen.getByLabelText(/requestId/), '  req_padded  ')
    await user.click(screen.getByRole('button', { name: 'Load record' }))
    await waitFor(() =>
      expect(getSameRecordMock).toHaveBeenCalledWith({ requestId: 'req_padded' }, currentQuery),
    )
  })

  /**
   * The bottom callout renders the Datadog/OTel comparison copy, and the `{' '}`
   * before `<strong>after</strong>` keeps "scrub" and "after" separate. Kills the
   * StringLiteral→"" mutation on that whitespace literal (yielding "scrubafter").
   */
  it('renders the bottom Datadog-comparison explainer copy with spacing intact', () => {
    renderWithClient(<RedactionHero />)
    const paragraph = screen.getByText(/this redaction is real and irreversible/)
    expect(paragraph.textContent).toContain(
      'Unlike Datadog Sensitive Data Scanner or OTel-collector redaction',
    )
    expect(paragraph.textContent).toContain('which scrub after')
  })
})
