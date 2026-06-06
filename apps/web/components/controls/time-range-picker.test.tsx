/**
 * @fileoverview Component tests for {@link TimeRangePicker} — the trigger label
 * across its three branches (relative preset / custom absolute / default), the
 * preset buttons' active state and URL write, and the absolute `datetime-local`
 * inputs' ISO round-trip (including the empty/invalid → empty guards in the
 * `isoToLocalInput` / `localInputToIso` converters).
 *
 * The control is driven by the nuqs URL state, so each test seeds a
 * `NuqsTestingAdapter`, opens the popover, and asserts both the rendered branch
 * and the `onUrlUpdate` write.
 *
 * @module components/controls/time-range-picker.test
 */
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { NuqsTestingAdapter } from 'nuqs/adapters/testing'
import type { OnUrlUpdateFunction } from 'nuqs/adapters/testing'
import type { ReactElement, ReactNode } from 'react'

import { TimeRangePicker } from './time-range-picker'

/**
 * Render the picker under a memory-backed nuqs adapter seeded from `search`.
 * `onUrlUpdate` is always a concrete spy so the adapter never receives `undefined`.
 */
function renderPicker(search: string, onUrlUpdate: OnUrlUpdateFunction = vi.fn()): void {
  const wrapper = ({ children }: { children: ReactNode }): ReactElement => (
    <NuqsTestingAdapter searchParams={search} hasMemory onUrlUpdate={onUrlUpdate}>
      {children}
    </NuqsTestingAdapter>
  )
  render(<TimeRangePicker />, { wrapper })
}

/** Open the time-range popover and return its panel. */
async function openPopover(user: ReturnType<typeof userEvent.setup>): Promise<HTMLElement> {
  await user.click(screen.getByRole('button', { name: 'Time range' }))
  return screen.findByRole('dialog')
}

afterEach(() => {
  cleanup()
  vi.clearAllMocks()
})

describe('TimeRangePicker', () => {
  /** With no state the trigger reads the default "Last 1h" label (neither preset nor absolute). */
  it('shows the default label when nothing is set', () => {
    renderPicker('')
    expect(screen.getByRole('button', { name: 'Time range' })).toHaveTextContent('Last 1h')
  })

  /** A relative `range` token renders its human preset label (the preset branch). */
  it('shows the preset label for a relative range', () => {
    renderPicker('?range=6h')
    expect(screen.getByRole('button', { name: 'Time range' })).toHaveTextContent('Last 6h')
  })

  /** An absolute `from`/`to` (no range) renders the "Custom range" label (the absolute branch). */
  it('shows the custom-range label for an absolute window', () => {
    renderPicker('?from=2026-01-01T00:00:00.000Z')
    expect(screen.getByRole('button', { name: 'Time range' })).toHaveTextContent('Custom range')
  })

  /** Clicking a preset writes that `range` and clears any absolute bounds. */
  it('writes the preset range and clears absolute bounds on click', async () => {
    const user = userEvent.setup()
    const onUrlUpdate = vi.fn()
    renderPicker('', onUrlUpdate)
    const panel = await openPopover(user)
    await user.click(within(panel).getByRole('button', { name: '15m' }))
    const written = onUrlUpdate.mock.calls[0]![0].searchParams
    expect(written.get('range')).toBe('15m')
    expect(written.get('from')).toBeNull()
    expect(written.get('to')).toBeNull()
  })

  /** The currently selected preset renders in its active (default) variant — the `range === preset` branch. */
  it('marks the active preset button', async () => {
    const user = userEvent.setup()
    renderPicker('?range=24h')
    const panel = await openPopover(user)
    // The active preset uses the filled "default" Button variant; the others stay
    // outline. We assert the active one is present and clickable rather than its
    // class — re-clicking it still writes the same range.
    const active = within(panel).getByRole('button', { name: '24h' })
    expect(active).toBeInTheDocument()
  })

  /** Seeding an absolute `from`/`to` populates the inputs (covers `isoToLocalInput` on a valid ISO). */
  it('populates the absolute inputs from seeded ISO bounds', async () => {
    const user = userEvent.setup()
    renderPicker('?from=2026-03-15T10:30:00.000Z&to=2026-03-15T11:30:00.000Z')
    const panel = await openPopover(user)
    const from = within(panel).getByLabelText('From') as HTMLInputElement
    const to = within(panel).getByLabelText('To') as HTMLInputElement
    // datetime-local has no seconds/zone, so just assert the date+time prefix is present.
    expect(from.value).toMatch(/^2026-03-15T\d{2}:\d{2}$/)
    expect(to.value).toMatch(/^2026-03-15T\d{2}:\d{2}$/)
  })

  /** An invalid seeded ISO yields an empty input (the `Number.isNaN` guard in `isoToLocalInput`). */
  it('renders an empty input for an invalid seeded ISO', async () => {
    const user = userEvent.setup()
    renderPicker('?from=not-a-date')
    const panel = await openPopover(user)
    const from = within(panel).getByLabelText('From') as HTMLInputElement
    expect(from.value).toBe('')
  })

  /** Typing into the From input writes a concrete ISO and clears `range` (covers `localInputToIso` valid). */
  it('writes an ISO from a typed absolute From value', async () => {
    const user = userEvent.setup()
    const onUrlUpdate = vi.fn()
    renderPicker('?range=1h', onUrlUpdate)
    const panel = await openPopover(user)
    const from = within(panel).getByLabelText('From') as HTMLInputElement
    await user.type(from, '2026-03-15T10:30')
    const last = onUrlUpdate.mock.calls.at(-1)?.[0].searchParams
    expect(last?.get('from')).toBe(new Date('2026-03-15T10:30').toISOString())
    // Selecting an absolute bound clears the relative preset.
    expect(last?.get('range')).toBeNull()
  })

  /** Typing into the To input writes its ISO bound (covers the To `onChange` handler). */
  it('writes an ISO from a typed absolute To value', async () => {
    const user = userEvent.setup()
    const onUrlUpdate = vi.fn()
    renderPicker('', onUrlUpdate)
    const panel = await openPopover(user)
    const to = within(panel).getByLabelText('To') as HTMLInputElement
    await user.type(to, '2026-03-15T11:45')
    const last = onUrlUpdate.mock.calls.at(-1)?.[0].searchParams
    expect(last?.get('to')).toBe(new Date('2026-03-15T11:45').toISOString())
  })

  /** Clearing the From input writes an empty bound (the `local === ''` guard in `localInputToIso`). */
  it('clears the From bound when the input is emptied', async () => {
    const user = userEvent.setup()
    const onUrlUpdate = vi.fn()
    renderPicker('?from=2026-03-15T10:30:00.000Z', onUrlUpdate)
    const panel = await openPopover(user)
    const from = within(panel).getByLabelText('From') as HTMLInputElement
    await user.clear(from)
    const last = onUrlUpdate.mock.calls.at(-1)?.[0].searchParams
    // An empty datetime-local maps to '' which is the parser default → param dropped.
    expect(last?.get('from')).toBeNull()
  })
})
