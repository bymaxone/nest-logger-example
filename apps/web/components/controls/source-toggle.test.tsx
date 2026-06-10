/**
 * @fileoverview Component tests for {@link SourceToggle} — the active-pressed
 * reflection of the current source, the teaching callout copy that swaps with the
 * source, and the URL writes on both `loki` and `postgres` selections.
 *
 * The control is driven purely by the nuqs URL state, so each test seeds a
 * `NuqsTestingAdapter` and asserts the rendered branch and the `onUrlUpdate` write.
 *
 * @module components/controls/source-toggle.test
 */
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { NuqsTestingAdapter } from 'nuqs/adapters/testing'
import type { OnUrlUpdateFunction } from 'nuqs/adapters/testing'
import type { ReactElement, ReactNode } from 'react'

import { SourceToggle } from './source-toggle'

/**
 * Render the toggle under a memory-backed nuqs adapter seeded from `search`.
 * `onUrlUpdate` is always a concrete spy so the adapter never receives `undefined`.
 */
function renderToggle(search: string, onUrlUpdate: OnUrlUpdateFunction = vi.fn()): void {
  const wrapper = ({ children }: { children: ReactNode }): ReactElement => (
    <NuqsTestingAdapter searchParams={search} hasMemory onUrlUpdate={onUrlUpdate}>
      {children}
    </NuqsTestingAdapter>
  )
  render(<SourceToggle />, { wrapper })
}

afterEach(() => {
  cleanup()
  vi.clearAllMocks()
})

describe('SourceToggle', () => {
  /** The default source is Loki: its button is pressed and the Loki callout copy shows. */
  it('marks Loki active and shows the Loki callout by default', () => {
    renderToggle('')
    expect(screen.getByRole('button', { name: 'Loki' })).toHaveAttribute('aria-pressed', 'true')
    expect(screen.getByRole('button', { name: 'Postgres' })).toHaveAttribute(
      'aria-pressed',
      'false',
    )
    expect(
      screen.getByText('Loki = info+ full fidelity · warn+ audit lives in Postgres'),
    ).toBeInTheDocument()
  })

  /** With source=postgres the Postgres button is pressed and the Postgres callout copy shows (the other branch). */
  it('marks Postgres active and shows the Postgres callout when selected', () => {
    renderToggle('?source=postgres')
    expect(screen.getByRole('button', { name: 'Postgres' })).toHaveAttribute('aria-pressed', 'true')
    expect(screen.getByRole('button', { name: 'Loki' })).toHaveAttribute('aria-pressed', 'false')
    expect(
      screen.getByText('Postgres = warn+ durable tier · info/debug live in Loki'),
    ).toBeInTheDocument()
  })

  /** Clicking Postgres writes `source=postgres` to the URL. */
  it('writes source=postgres on click', async () => {
    const onUrlUpdate = vi.fn()
    renderToggle('', onUrlUpdate)
    await userEvent.click(screen.getByRole('button', { name: 'Postgres' }))
    expect(onUrlUpdate).toHaveBeenCalledTimes(1)
    expect(onUrlUpdate.mock.calls[0]![0].searchParams.get('source')).toBe('postgres')
  })

  /** Clicking Loki from a Postgres state writes `source` back to the default (cleared from the URL). */
  it('writes source back to loki on click', async () => {
    const onUrlUpdate = vi.fn()
    renderToggle('?source=postgres', onUrlUpdate)
    await userEvent.click(screen.getByRole('button', { name: 'Loki' }))
    expect(onUrlUpdate).toHaveBeenCalledTimes(1)
    // `loki` is the parser default, so nuqs clears it from the query string.
    expect(onUrlUpdate.mock.calls[0]![0].searchParams.get('source')).toBeNull()
  })
})

describe('SourceToggle — button className, icon colour class, and title attribute', () => {
  /**
   * These tests kill the CSS string and icon/title conditional mutations that the
   * aria-pressed and text-content assertions in the main describe block leave
   * untouched.
   */

  /**
   * The active button must carry the brand CSS classes from the active branch of
   * the className ternary. Asserting these kills the StringLiteral→"" mutation on
   * the active class string (L51) and confirms the right branch fires.
   */
  it('applies active brand classes to the Postgres button when postgres is selected', () => {
    renderToggle('?source=postgres')
    const activeBtn = screen.getByRole('button', { name: 'Postgres' })
    expect(activeBtn.className).toContain('bg-brand-500/20')
    expect(activeBtn.className).toContain('font-semibold')
    expect(activeBtn.className).toContain('text-brand-500')
  })

  /**
   * The inactive button must carry the muted text class from the inactive branch.
   * Asserting presence kills the StringLiteral→"" mutation on the inactive class
   * string (L52); asserting absence kills the ConditionalExpression→true mutation.
   */
  it('applies the inactive text class to the Loki button when postgres is selected', () => {
    renderToggle('?source=postgres')
    const inactiveBtn = screen.getByRole('button', { name: 'Loki' })
    expect(inactiveBtn.className).toContain('text-white/55')
    expect(inactiveBtn.className).not.toContain('bg-brand-500/20')
  })

  /**
   * All source buttons share the base `rounded-full` layout class regardless of
   * active state. Asserting it kills the StringLiteral→"" mutation on the base
   * class string (L49) that is present in both branches.
   */
  it('applies the base rounded-full class to all source buttons', () => {
    renderToggle('')
    expect(screen.getByRole('button', { name: 'Loki' }).className).toContain('rounded-full')
    expect(screen.getByRole('button', { name: 'Postgres' }).className).toContain('rounded-full')
  })

  /**
   * With `source=postgres` the Database icon (text-amber-400) is rendered.
   * Asserting its presence kills the ConditionalExpression→false and
   * EqualityOperator mutations on the icon conditional (L68), as well as the
   * StringLiteral→"" mutation on the icon colour class (L68:21).
   */
  it('renders the amber-coloured database icon when postgres is selected', () => {
    renderToggle('?source=postgres')
    expect(document.querySelector('svg[class*="text-amber-400"]')).not.toBeNull()
  })

  /**
   * With `source=loki` the GraduationCap icon is rendered; the amber Database
   * icon must be absent. Asserting absence kills the ConditionalExpression→true
   * mutation that always renders the Database icon regardless of source.
   */
  it('does not render the amber database icon when loki is selected', () => {
    renderToggle('')
    expect(document.querySelector('svg[class*="text-amber-400"]')).toBeNull()
  })

  /**
   * The title attribute on the teaching callout span must describe the Postgres
   * source when postgres is active. The postgres title uniquely mentions
   * "warn+, durable" and "info/debug lines". Asserting both these substrings
   * kills ConditionalExpression→false (always Loki title), EqualityOperator
   * (inverted comparison), and the StringLiteral mutations on the postgres title.
   * Note: both titles cross-reference the other source by name, so a plain
   * `not.toContain('Loki')` assertion would fail against the real title.
   */
  it('shows the postgres title attribute when postgres is selected', () => {
    renderToggle('?source=postgres')
    const span = document.querySelector('[title]') as HTMLElement | null
    expect(span?.title).toContain('Postgres')
    expect(span?.title).toContain('info/debug lines')
  })

  /**
   * The title attribute must describe the Loki source when loki is active.
   * The Loki title uniquely mentions "full fidelity". Asserting this kills
   * ConditionalExpression→true (always Postgres title) and the StringLiteral
   * mutation on the loki title text.
   * Note: both titles cross-reference the other source, so a plain
   * `not.toContain('Postgres')` assertion would fail against the real title.
   */
  it('shows the loki title attribute when loki is selected', () => {
    renderToggle('')
    const span = document.querySelector('[title]') as HTMLElement | null
    expect(span?.title).toContain('Loki')
    expect(span?.title).toContain('full fidelity')
  })
})
