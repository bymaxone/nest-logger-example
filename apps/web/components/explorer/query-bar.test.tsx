/**
 * @fileoverview Component tests for {@link QueryBar} — the field-syntax parser,
 * the inline `logKey` validity guard, the URL-sync effect, and the teaching
 * toggles that reveal the compiled SQL / LogQL.
 *
 * The nuqs URL boundary (`@/lib/filters`) is mocked so each test injects a known
 * `query` and captures the `setQuery` calls; the SQL / LogQL compilers are real.
 *
 * @module components/explorer/query-bar.test
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

import type { LogQuery } from '@/lib/types'
import type { LogQueryState } from '@/lib/filters'

/** The query the mocked `useLogQuery` returns; reassigned per test before render. */
let currentQuery: LogQuery = { source: 'loki', role: 'admin' }

/** Captures the URL writes the bar emits on submit. */
const setQueryMock = vi.fn()

vi.mock('@/lib/filters', () => ({
  useLogQuery: (): LogQueryState =>
    ({
      query: currentQuery,
      setQuery: setQueryMock,
      live: false,
      isRelative: true,
    }) as unknown as LogQueryState,
}))

// Imported after the mock so the component binds the mocked filters module.
const { QueryBar } = await import('./query-bar')

beforeEach(() => {
  currentQuery = { source: 'loki', role: 'admin' }
  setQueryMock.mockReset()
})

afterEach(() => {
  cleanup()
})

describe('QueryBar', () => {
  /** An empty query renders a blank input — the placeholder teaches the syntax. */
  it('renders an empty input for a query with no filter fields', () => {
    render(<QueryBar />)
    const input = screen.getByLabelText('Log query')
    expect(input).toHaveValue('')
  })

  /** The bar reconstructs the field-syntax text from every populated query field. */
  it('reflects the active query as field-syntax text', () => {
    currentQuery = {
      source: 'loki',
      role: 'admin',
      level: { gte: 'warn' },
      logKey: 'PAYMENT_CHARGE_SUCCESS',
      service: 'api',
      tenantId: 'acme',
      traceId: 'abc',
      q: 'refund',
    }
    render(<QueryBar />)
    expect(screen.getByLabelText('Log query')).toHaveValue(
      'level>=warn logKey:PAYMENT_CHARGE_SUCCESS service:api tenantId:acme traceId:abc msg ~ "refund"',
    )
  })

  /** An exact level renders as `level:<value>` (not the `>=` comparison form). */
  it('reflects an exact level as level:<value>', () => {
    currentQuery = { source: 'loki', role: 'admin', level: 'error' }
    render(<QueryBar />)
    expect(screen.getByLabelText('Log query')).toHaveValue('level:error')
  })

  /** Submitting parses each structured token into the URL state exactly once. */
  it('writes the parsed structured fields to the URL on submit', async () => {
    const user = userEvent.setup()
    render(<QueryBar />)
    const input = screen.getByLabelText('Log query')
    await user.type(
      input,
      'level:error logKey:PAYMENT_CHARGE_SUCCESS service:api tenantId:acme traceId:t1 msg ~ "boom"',
    )
    await user.click(screen.getByRole('button', { name: 'Search' }))
    expect(setQueryMock).toHaveBeenCalledTimes(1)
    expect(setQueryMock).toHaveBeenCalledWith({
      level: 'error',
      logKey: 'PAYMENT_CHARGE_SUCCESS',
      service: 'api',
      tenantId: 'acme',
      traceId: 't1',
      q: 'boom',
    })
  })

  /** Pressing Enter in the input submits the same way the Search button does. */
  it('submits when Enter is pressed in the input', async () => {
    const user = userEvent.setup()
    render(<QueryBar />)
    const input = screen.getByLabelText('Log query')
    await user.type(input, 'service:api{Enter}')
    expect(setQueryMock).toHaveBeenCalledTimes(1)
    expect(setQueryMock.mock.calls[0]?.[0]).toMatchObject({ service: 'api', q: '' })
  })

  /** A non-Enter keystroke must not submit — only Enter triggers the query write. */
  it('does not submit on a non-Enter keystroke', async () => {
    const user = userEvent.setup()
    render(<QueryBar />)
    const input = screen.getByLabelText('Log query')
    await user.type(input, 'service:api')
    // Typing alone (no Enter, no Search click) must not write the URL.
    expect(setQueryMock).not.toHaveBeenCalled()
  })

  /** An invalid logKey surfaces the inline error and is not written as a logKey. */
  it('flags an invalid logKey and excludes it from the URL write', async () => {
    const user = userEvent.setup()
    render(<QueryBar />)
    const input = screen.getByLabelText('Log query')
    await user.type(input, 'logKey:not-a-key')
    await user.click(screen.getByRole('button', { name: 'Search' }))
    expect(screen.getByText(/is not a valid logKey/)).toBeInTheDocument()
    expect(setQueryMock.mock.calls[0]?.[0]).toMatchObject({ logKey: '' })
  })

  /** A `level>=warn` token parses into the at-or-above comparison form. */
  it('parses the level>= comparison token from typed text', async () => {
    const user = userEvent.setup()
    render(<QueryBar />)
    const input = screen.getByLabelText('Log query')
    await user.type(input, 'level>=warn')
    await user.click(screen.getByRole('button', { name: 'Search' }))
    expect(setQueryMock.mock.calls[0]?.[0]).toMatchObject({ level: '>=warn' })
  })

  /** An unknown `key:value` token (not a bar field) falls through to free-text. */
  it('routes an unrecognized key:value token to free-text', async () => {
    const user = userEvent.setup()
    render(<QueryBar />)
    const input = screen.getByLabelText('Log query')
    await user.type(input, 'foo:bar')
    await user.click(screen.getByRole('button', { name: 'Search' }))
    expect(setQueryMock.mock.calls[0]?.[0]).toMatchObject({ q: 'foo:bar' })
  })

  /** A bare word with no `key:value` shape becomes the free-text message contains. */
  it('treats bare words as the free-text message query', async () => {
    const user = userEvent.setup()
    render(<QueryBar />)
    const input = screen.getByLabelText('Log query')
    await user.type(input, 'timeout error')
    await user.click(screen.getByRole('button', { name: 'Search' }))
    expect(setQueryMock.mock.calls[0]?.[0]).toMatchObject({ q: 'timeout error' })
  })

  /** A `requestId:` token is not a bar field — it falls through to free-text. */
  it('routes a requestId token to free-text rather than a structured field', async () => {
    const user = userEvent.setup()
    render(<QueryBar />)
    const input = screen.getByLabelText('Log query')
    await user.type(input, 'requestId:req-1')
    await user.click(screen.getByRole('button', { name: 'Search' }))
    expect(setQueryMock.mock.calls[0]?.[0]).toMatchObject({ q: 'requestId:req-1' })
  })

  /** The `q:"…"` free-text form is parsed identically to `msg ~ "…"`. */
  it('parses the q:"…" quoted free-text form', async () => {
    const user = userEvent.setup()
    render(<QueryBar />)
    const input = screen.getByLabelText('Log query')
    await user.type(input, 'q:"db pool" service:api')
    await user.click(screen.getByRole('button', { name: 'Search' }))
    expect(setQueryMock.mock.calls[0]?.[0]).toMatchObject({ q: 'db pool', service: 'api' })
  })

  /** The SQL toggle reveals and hides the compiled WHERE clause beside the form. */
  it('toggles the generated SQL panel', async () => {
    const user = userEvent.setup()
    render(<QueryBar />)
    const toggle = screen.getByRole('button', { name: /generated SQL/ })
    expect(toggle).toHaveTextContent('▸ generated SQL')
    await user.click(toggle)
    expect(screen.getByRole('button', { name: /generated SQL/ })).toHaveTextContent(
      '▾ generated SQL',
    )
    expect(screen.getByText(/WHERE/i)).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: /generated SQL/ }))
    expect(screen.getByRole('button', { name: /generated SQL/ })).toHaveTextContent(
      '▸ generated SQL',
    )
  })

  /** The LogQL toggle reveals and hides the compiled LogQL beside the form. */
  it('toggles the generated LogQL panel', async () => {
    currentQuery = { source: 'loki', role: 'admin', service: 'api' }
    const user = userEvent.setup()
    render(<QueryBar />)
    const toggle = screen.getByRole('button', { name: /generated LogQL/ })
    expect(toggle).toHaveTextContent('▸ generated LogQL')
    await user.click(toggle)
    expect(screen.getByRole('button', { name: /generated LogQL/ })).toHaveTextContent(
      '▾ generated LogQL',
    )
    // The compiled LogQL stream selector is rendered in the panel.
    expect(screen.getByText(/service=/)).toBeInTheDocument()
  })

  /** A URL change from elsewhere (facet click / brush) re-syncs the unfocused input. */
  it('re-syncs the input text when the query changes and the input is unfocused', () => {
    const { rerender } = render(<QueryBar />)
    expect(screen.getByLabelText('Log query')).toHaveValue('')
    currentQuery = { source: 'loki', role: 'admin', service: 'api' }
    rerender(<QueryBar />)
    expect(screen.getByLabelText('Log query')).toHaveValue('service:api')
  })

  /** While the input is focused, an external URL change must not clobber typing. */
  it('does not overwrite the input while the user is actively typing', async () => {
    const user = userEvent.setup()
    const { rerender } = render(<QueryBar />)
    const input = screen.getByLabelText('Log query')
    await user.click(input)
    await user.type(input, 'service:api')
    // Simulate an external URL change arriving while focused.
    currentQuery = { source: 'loki', role: 'admin', tenantId: 'acme' }
    rerender(<QueryBar />)
    // The focused input keeps what the user typed; it is not replaced by the sync.
    expect(input).toHaveValue('service:api')
  })
})
