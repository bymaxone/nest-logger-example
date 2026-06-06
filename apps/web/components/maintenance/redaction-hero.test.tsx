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
  default: ({ value }: { value: unknown }) => (
    <pre data-testid="json-view">{JSON.stringify(value)}</pre>
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
})
