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

  /** The invalid-logKey error message contains the exact expected format hint. */
  it('shows the full invalid-logKey error message text', async () => {
    const user = userEvent.setup()
    render(<QueryBar />)
    await user.type(screen.getByLabelText('Log query'), 'logKey:lowercase_key_value')
    await user.click(screen.getByRole('button', { name: 'Search' }))
    const msg = screen.getByText(/is not a valid logKey/)
    expect(msg.textContent).toContain('MODULE_ACTION_RESULT')
    expect(msg.textContent).toContain('PREFIX_*')
    expect(msg.textContent).toContain('lowercase_key_value')
  })

  /** The SQL toggle button starts with the collapsed arrow character. */
  it('shows the collapsed arrow on the SQL toggle initially', () => {
    render(<QueryBar />)
    expect(screen.getByRole('button', { name: /generated SQL/ })).toHaveTextContent('▸')
  })

  /** The LogQL toggle button starts with the collapsed arrow character. */
  it('shows the collapsed arrow on the LogQL toggle initially', () => {
    render(<QueryBar />)
    expect(screen.getByRole('button', { name: /generated LogQL/ })).toHaveTextContent('▸')
  })

  /** A traceId field renders as traceId:<value> in the bar text. */
  it('reflects a traceId in the bar text', () => {
    currentQuery = { source: 'loki', role: 'admin', traceId: 'xyz123' }
    render(<QueryBar />)
    expect(screen.getByLabelText('Log query')).toHaveValue('traceId:xyz123')
  })

  /** A q field renders as `msg ~ "..."` in the bar text. */
  it('reflects a q filter as the msg-contains syntax', () => {
    currentQuery = { source: 'loki', role: 'admin', q: 'timeout' }
    render(<QueryBar />)
    expect(screen.getByLabelText('Log query')).toHaveValue('msg ~ "timeout"')
  })

  /** Submitting a traceId token writes the exact value to setQuery. */
  it('parses a traceId token and writes it to the URL', async () => {
    const user = userEvent.setup()
    render(<QueryBar />)
    await user.type(screen.getByLabelText('Log query'), 'traceId:abc-123')
    await user.click(screen.getByRole('button', { name: 'Search' }))
    expect(setQueryMock.mock.calls[0]?.[0]).toMatchObject({ traceId: 'abc-123' })
  })

  /** Clearing all text and searching resets all structured fields to empty strings. */
  it('clears all structured fields when the input is blank and submitted', async () => {
    currentQuery = { source: 'loki', role: 'admin', service: 'api' }
    const user = userEvent.setup()
    render(<QueryBar />)
    const input = screen.getByLabelText('Log query')
    await user.clear(input)
    await user.click(screen.getByRole('button', { name: 'Search' }))
    expect(setQueryMock).toHaveBeenCalledWith({
      level: '',
      logKey: '',
      service: '',
      tenantId: '',
      traceId: '',
      q: '',
    })
  })

  /**
   * When a `msg ~ "…"` token is present AND a bare word follows, the bare word
   * must NOT overwrite `parsed.q`. The guard `parsed.q === '' && freeText.length > 0`
   * ensures free-text fallback only fires when no explicit msg~ was seen.
   * Asserting this kills the `&&` → `||` LogicalOperator mutation: with `||`,
   * `parsed.q = 'stray'` would overwrite 'boom'.
   */
  it('does not overwrite the msg~ match with a subsequent bare word', async () => {
    const user = userEvent.setup()
    render(<QueryBar />)
    await user.type(screen.getByLabelText('Log query'), 'msg ~ "boom" stray')
    await user.click(screen.getByRole('button', { name: 'Search' }))
    expect(setQueryMock.mock.calls[0]?.[0]).toMatchObject({ q: 'boom' })
  })

  /**
   * Submitting valid text must not show the invalid-logKey error message.
   * Asserting this kills the `invalidLogKey !== null` → `true` ConditionalExpression
   * mutation on the `{invalidLogKey !== null && <p>…</p>}` guard, which would
   * render the error even for clean submissions.
   */
  it('does not show the invalid-logKey error after a valid submission', async () => {
    const user = userEvent.setup()
    render(<QueryBar />)
    await user.type(screen.getByLabelText('Log query'), 'level:error')
    await user.click(screen.getByRole('button', { name: 'Search' }))
    expect(screen.queryByText(/is not a valid logKey/)).not.toBeInTheDocument()
  })

  /**
   * Leading/trailing whitespace in the input produces empty tokens from `split`.
   * The `.filter(Boolean)` call strips them so they do not pollute the free-text
   * field. Asserting `q: ''` kills the MethodExpression mutation that removes
   * `.filter(Boolean)` (which would set `q` to a whitespace string instead).
   */
  it('does not treat leading or trailing whitespace as a free-text token', async () => {
    const user = userEvent.setup()
    render(<QueryBar />)
    await user.type(screen.getByLabelText('Log query'), ' level:error ')
    await user.click(screen.getByRole('button', { name: 'Search' }))
    expect(setQueryMock.mock.calls[0]?.[0]).toMatchObject({ level: 'error', q: '' })
  })

  /**
   * The base `pl-9 font-mono text-xs` class must always be present on the input.
   * Asserting `pl-9` kills the StringLiteral→"" mutation on the base className
   * that would strip the left-padding (hiding the search icon behind text).
   */
  it('applies the pl-9 base class to the query input', () => {
    render(<QueryBar />)
    expect(screen.getByLabelText('Log query').className).toContain('pl-9')
  })

  /**
   * After submitting an invalid logKey, the input must carry `border-destructive`
   * as a standalone class (added via cn()). Using `classList.contains` distinguishes
   * the cn()-applied class from the always-present Tailwind `aria-invalid:border-destructive`
   * variant utility. Asserting presence kills the StringLiteral→"" mutation on the
   * error border class and the ConditionalExpression→false mutation.
   */
  it('adds border-destructive class to the input after an invalid logKey submission', async () => {
    const user = userEvent.setup()
    render(<QueryBar />)
    await user.type(screen.getByLabelText('Log query'), 'logKey:not_a_valid_key')
    await user.click(screen.getByRole('button', { name: 'Search' }))
    expect(screen.getByLabelText('Log query').classList.contains('border-destructive')).toBe(true)
  })

  /**
   * After a valid submission the `border-destructive` class must NOT be standalone
   * on the input (only the Tailwind variant utility string is present, not the
   * applied class). Asserting absence kills the `invalidLogKey !== null` → `true`
   * ConditionalExpression mutation that would always apply the error border.
   */
  it('does not apply standalone border-destructive class after a valid submission', async () => {
    const user = userEvent.setup()
    render(<QueryBar />)
    await user.type(screen.getByLabelText('Log query'), 'level:error')
    await user.click(screen.getByRole('button', { name: 'Search' }))
    expect(screen.getByLabelText('Log query').classList.contains('border-destructive')).toBe(false)
  })

  /**
   * After the user blurs the input, an external query change must re-sync the bar.
   * Asserting this kills the `onBlur` BlockStatement→{} mutation (which would keep
   * `isFocused.current` stuck at `true`, preventing the sync) and the
   * `isFocused.current = false` BooleanLiteral→true mutation (same effect).
   */
  it('re-syncs the input text after the user blurs the field and the query changes', async () => {
    const user = userEvent.setup()
    const { rerender } = render(<QueryBar />)
    const input = screen.getByLabelText('Log query')
    // Focus and type so isFocused.current becomes true.
    await user.click(input)
    await user.type(input, 'service:api')
    // Blur by tabbing away — should set isFocused.current = false.
    await user.tab()
    // External URL change arrives while unfocused — should overwrite typed text.
    currentQuery = { source: 'loki', role: 'admin', service: 'worker' }
    rerender(<QueryBar />)
    expect(input).toHaveValue('service:worker')
  })

  /**
   * The `msg~"…"` form without any whitespace between 'msg' and '~' must parse
   * identically to `msg ~ "…"`. The regex uses `\s*` (zero-or-more), so the
   * no-space variant must still set q='boom'.
   *
   * Asserting this kills the Regex mutation that changes `\s*` to `\s` (requires
   * exactly one whitespace): with the mutation, `msg~"boom"` has no whitespace
   * before `~`, so the regex does not match and the token falls through to
   * free-text, setting q='msg~"boom"' instead of 'boom'.
   */
  it('parses msg~"text" with no space before the tilde as a free-text query', async () => {
    const user = userEvent.setup()
    render(<QueryBar />)
    await user.type(screen.getByLabelText('Log query'), 'msg~"boom"')
    await user.click(screen.getByRole('button', { name: 'Search' }))
    expect(setQueryMock.mock.calls[0]?.[0]).toMatchObject({ q: 'boom' })
  })
})

/**
 * Re-import tests for the module-level EMPTY constant.
 *
 * The EMPTY object is initialised at module load time so Stryker's perTest
 * coverage analysis reports `coveredBy: []` for its string-literal mutations.
 * Calling vi.resetModules() and re-importing inside the test body forces the
 * module to re-evaluate with the active mutation, attributing coverage to this
 * specific test and allowing Stryker to detect the kill.
 */
describe('QueryBar — EMPTY module-level re-import', () => {
  afterEach(() => {
    vi.resetModules()
    cleanup()
  })

  it('re-imports and verifies all six EMPTY ParsedQuery fields are empty strings on submit', async () => {
    vi.resetModules()
    const { QueryBar: FreshBar } = await import('./query-bar')
    currentQuery = { source: 'loki', role: 'admin' }
    setQueryMock.mockReset()
    const user = userEvent.setup()
    render(<FreshBar />)
    const input = screen.getByLabelText('Log query')
    await user.clear(input)
    await user.click(screen.getByRole('button', { name: 'Search' }))
    expect(setQueryMock).toHaveBeenCalledWith({
      level: '',
      logKey: '',
      service: '',
      tenantId: '',
      traceId: '',
      q: '',
    })
  })
})
