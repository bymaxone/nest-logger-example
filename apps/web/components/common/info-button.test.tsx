/**
 * @fileoverview Component tests for {@link InfoButton} — the icon → modal explainer.
 *
 * Covers the trigger's accessible name (default `About <title>` and a custom
 * label), opening the modal to reveal the title + body, and the summary-present
 * vs summary-absent branches of the dialog header.
 *
 * @module components/common/info-button.test
 */
import { afterEach, describe, expect, it } from 'vitest'
import { cleanup, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

import { InfoButton } from '@/components/common/info-button'

afterEach(() => {
  cleanup()
})

describe('InfoButton', () => {
  /** The trigger derives its accessible name from the title by default, and the
   *  body stays out of the DOM until the modal is opened. */
  it('labels the trigger "About <title>" and keeps the body closed', () => {
    render(
      <InfoButton title="Latency">
        <p>explanation body</p>
      </InfoButton>,
    )
    expect(screen.getByRole('button', { name: 'About Latency' })).toBeInTheDocument()
    expect(screen.queryByText('explanation body')).not.toBeInTheDocument()
  })

  /** A custom label overrides the default trigger name. */
  it('uses a custom label when provided', () => {
    render(
      <InfoButton title="Latency" label="More about latency">
        <p>x</p>
      </InfoButton>,
    )
    expect(screen.getByRole('button', { name: 'More about latency' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'About Latency' })).not.toBeInTheDocument()
  })

  /** Clicking the trigger opens the modal with the title, summary, and body. */
  it('opens the modal with the title, summary, and body', async () => {
    const user = userEvent.setup()
    render(
      <InfoButton title="Latency" summary="Tail latency.">
        <p>percentiles, not averages</p>
      </InfoButton>,
    )
    await user.click(screen.getByRole('button', { name: 'About Latency' }))
    const dialog = screen.getByRole('dialog')
    expect(dialog).toHaveTextContent('Latency')
    expect(dialog).toHaveTextContent('Tail latency.')
    expect(dialog).toHaveTextContent('percentiles, not averages')
  })

  /** Without a summary, the modal still opens and shows the body (no description). */
  it('opens without a summary line when summary is omitted', async () => {
    const user = userEvent.setup()
    render(
      <InfoButton title="No summary" summary={undefined}>
        <p>body only text</p>
      </InfoButton>,
    )
    await user.click(screen.getByRole('button', { name: 'About No summary' }))
    const dialog = screen.getByRole('dialog')
    expect(dialog).toHaveTextContent('body only text')
    expect(screen.queryByText('Tail latency.')).not.toBeInTheDocument()
  })

  /**
   * When summary is omitted the description guard renders `null`, so the dialog's
   * `aria-describedby` id must resolve to no element. The mutated guard (always
   * truthy) would render an empty DialogDescription `<p>`, which this catches.
   */
  it('renders no description element when summary is omitted', async () => {
    const user = userEvent.setup()
    render(
      <InfoButton title="No summary" summary={undefined}>
        <p>body only text</p>
      </InfoButton>,
    )
    await user.click(screen.getByRole('button', { name: 'About No summary' }))
    const dialog = screen.getByRole('dialog')
    const describedBy = dialog.getAttribute('aria-describedby')
    expect(describedBy).not.toBeNull()
    expect(document.getElementById(describedBy!)).toBeNull()
  })

  /** The trigger carries its hover and focus-visible class literals from `cn(...)`. */
  it('applies the hover and focus-visible class literals to the trigger', () => {
    render(
      <InfoButton title="Latency">
        <p>x</p>
      </InfoButton>,
    )
    const trigger = screen.getByRole('button', { name: 'About Latency' })
    // Kills the StringLiteral→"" mutation on the hover class block.
    expect(trigger.className).toContain('hover:bg-white/10')
    expect(trigger.className).toContain('text-white/35')
    // Kills the StringLiteral→"" mutation on the focus-visible class block.
    expect(trigger.className).toContain('focus-visible:ring-2')
    expect(trigger.className).toContain('focus-visible:ring-ring')
  })
})
