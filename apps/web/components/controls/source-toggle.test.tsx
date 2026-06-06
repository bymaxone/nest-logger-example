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
