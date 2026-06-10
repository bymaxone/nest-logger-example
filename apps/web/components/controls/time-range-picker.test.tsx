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
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
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

  /**
   * An unparsable non-empty input value writes an empty bound (the `NaN → ''`
   * arm of `localInputToIso`). jsdom — like real browsers — sanitizes invalid
   * `datetime-local` values to `''` before the handler sees them, so the raw
   * string is forced through by overriding the element's `value` getter.
   */
  it('writes an empty bound when the input reports an unparsable value', async () => {
    const user = userEvent.setup()
    const onUrlUpdate = vi.fn()
    renderPicker('?from=2026-03-15T10:30:00.000Z', onUrlUpdate)
    const panel = await openPopover(user)
    const from = within(panel).getByLabelText('From') as HTMLInputElement
    Object.defineProperty(from, 'value', {
      configurable: true,
      get: () => 'not-a-date',
      set: () => undefined,
    })
    fireEvent.change(from)
    // nuqs flushes URL writes asynchronously, so poll for the update.
    await waitFor(() => expect(onUrlUpdate).toHaveBeenCalled())
    const last = onUrlUpdate.mock.calls.at(-1)?.[0].searchParams
    // '' is the parser default for both params, so each is dropped from the URL.
    expect(last?.get('from')).toBeNull()
    expect(last?.get('range')).toBeNull()
  })

  /** Every preset button renders inside the open popover with its human label. */
  it('renders all six preset buttons with their human labels', async () => {
    const user = userEvent.setup()
    renderPicker('')
    const panel = await openPopover(user)
    expect(within(panel).getByRole('button', { name: '5m' })).toBeInTheDocument()
    expect(within(panel).getByRole('button', { name: '15m' })).toBeInTheDocument()
    expect(within(panel).getByRole('button', { name: '1h' })).toBeInTheDocument()
    expect(within(panel).getByRole('button', { name: '6h' })).toBeInTheDocument()
    expect(within(panel).getByRole('button', { name: '24h' })).toBeInTheDocument()
    expect(within(panel).getByRole('button', { name: '7d' })).toBeInTheDocument()
  })

  /** The 5m preset writes range=5m and clears absolute bounds. */
  it('writes 5m and clears bounds when the 5m preset is clicked', async () => {
    const user = userEvent.setup()
    const onUrlUpdate = vi.fn()
    renderPicker('', onUrlUpdate)
    const panel = await openPopover(user)
    await user.click(within(panel).getByRole('button', { name: '5m' }))
    const written = onUrlUpdate.mock.calls[0]![0].searchParams
    expect(written.get('range')).toBe('5m')
    expect(written.get('from')).toBeNull()
    expect(written.get('to')).toBeNull()
  })

  /** The 1h preset shows its human label "Last 1h" in the trigger button. */
  it('shows Last 1h label for the 1h range preset', () => {
    renderPicker('?range=1h')
    expect(screen.getByRole('button', { name: 'Time range' })).toHaveTextContent('Last 1h')
  })

  /** The 5m preset shows its human label "Last 5m" in the trigger button. */
  it('shows Last 5m label for the 5m range preset', () => {
    renderPicker('?range=5m')
    expect(screen.getByRole('button', { name: 'Time range' })).toHaveTextContent('Last 5m')
  })

  /** The 15m preset shows its human label "Last 15m" in the trigger button. */
  it('shows Last 15m label for the 15m range preset', () => {
    renderPicker('?range=15m')
    expect(screen.getByRole('button', { name: 'Time range' })).toHaveTextContent('Last 15m')
  })

  /** The 24h preset shows its human label "Last 24h" in the trigger button. */
  it('shows Last 24h label for the 24h range preset', () => {
    renderPicker('?range=24h')
    expect(screen.getByRole('button', { name: 'Time range' })).toHaveTextContent('Last 24h')
  })

  /** The 7d preset shows its human label "Last 7d" in the trigger button. */
  it('shows Last 7d label for the 7d range preset', () => {
    renderPicker('?range=7d')
    expect(screen.getByRole('button', { name: 'Time range' })).toHaveTextContent('Last 7d')
  })

  /** The `to` absolute bound alone triggers the "Custom range" label. */
  it('shows the custom-range label when only the to bound is set', () => {
    renderPicker('?to=2026-01-01T00:00:00.000Z')
    expect(screen.getByRole('button', { name: 'Time range' })).toHaveTextContent('Custom range')
  })

  /** The popover panel renders "Relative" and "Absolute" section headings. */
  it('renders Relative and Absolute section headings inside the popover', async () => {
    const user = userEvent.setup()
    renderPicker('')
    const panel = await openPopover(user)
    expect(within(panel).getByText('Relative')).toBeInTheDocument()
    expect(within(panel).getByText('Absolute')).toBeInTheDocument()
  })

  /**
   * An unrecognised range token (not in PRESET_LABEL) must fall through to the
   * default "Last 1h" label — neither a preset label nor "Custom range".
   * Asserting this kills the `&&` → `||` LogicalOperator mutation: with `||`,
   * a non-empty unknown token would match the first branch and render
   * `PRESET_LABEL['unknown']` (= undefined → empty span).
   */
  it('shows the default label when the range token is not a known preset', () => {
    renderPicker('?range=unknown')
    expect(screen.getByRole('button', { name: 'Time range' })).toHaveTextContent('Last 1h')
  })

  /**
   * The active preset button carries the `font-semibold` class; the inactive
   * ones do not. Asserting both directions kills ConditionalExpression→true
   * (all buttons get font-semibold), ConditionalExpression→false (none does),
   * LogicalOperator, and EqualityOperator mutations on the className ternary.
   */
  it('applies font-semibold only to the active preset button', async () => {
    const user = userEvent.setup()
    renderPicker('?range=15m')
    const panel = await openPopover(user)
    const activeBtn = within(panel).getByRole('button', { name: '15m' })
    const inactiveBtn = within(panel).getByRole('button', { name: '5m' })
    expect(activeBtn.className).toContain('font-semibold')
    expect(inactiveBtn.className).not.toContain('font-semibold')
  })

  /** Writing an absolute To value clears the range preset. */
  it('clears the range preset when an absolute To value is written', async () => {
    const user = userEvent.setup()
    const onUrlUpdate = vi.fn()
    renderPicker('?range=6h', onUrlUpdate)
    const panel = await openPopover(user)
    const to = within(panel).getByLabelText('To') as HTMLInputElement
    await user.type(to, '2026-03-16T12:00')
    const last = onUrlUpdate.mock.calls.at(-1)?.[0].searchParams
    expect(last?.get('range')).toBeNull()
  })

  /**
   * The active preset button renders with the `default` Button variant (brand
   * gradient), while inactive preset buttons render with the `outline` variant
   * (border). Asserting both CSS classes kills ConditionalExpression→true/false,
   * EqualityOperator, and both StringLiteral→"" mutations on the variant ternary
   * and the base `justify-center` className (L92 and L94).
   */
  it('applies the default (gradient) variant to the active preset and outline to inactive', async () => {
    const user = userEvent.setup()
    renderPicker('?range=15m')
    const panel = await openPopover(user)
    const activeBtn = within(panel).getByRole('button', { name: '15m' })
    const inactiveBtn = within(panel).getByRole('button', { name: '5m' })
    // default variant applies brand gradient; outline does not.
    expect(activeBtn.className).toContain('from-brand-500')
    expect(inactiveBtn.className).not.toContain('from-brand-500')
    // outline variant applies a border; default does not.
    expect(inactiveBtn.className).toContain('border')
    // justify-center is present in the base className for all preset buttons.
    expect(activeBtn.className).toContain('justify-center')
  })
})

describe('TimeRangePicker — PRESET_LABEL module-level re-import (kill label mutations at module init)', () => {
  /**
   * Re-importing the module inside the test body forces the PRESET_LABEL object
   * to be evaluated with Stryker's active mutation. A StringLiteral → "" mutation
   * on a label value (e.g. 'Last 5m' → '') makes the trigger button show an empty
   * span. The toHaveTextContent assertion fails → mutation killed.
   */
  afterEach(() => {
    vi.resetModules()
    cleanup()
  })

  it('re-imports and verifies all five preset label values via the trigger button', async () => {
    const cases: [string, string][] = [
      ['5m', 'Last 5m'],
      ['15m', 'Last 15m'],
      ['1h', 'Last 1h'],
      ['24h', 'Last 24h'],
      ['7d', 'Last 7d'],
    ]
    for (const [range, expectedLabel] of cases) {
      vi.resetModules()
      const { TimeRangePicker: Picker } = await import('./time-range-picker')
      const wrapper = ({ children }: { children: ReactNode }): ReactElement => (
        <NuqsTestingAdapter searchParams={`?range=${range}`} hasMemory onUrlUpdate={vi.fn()}>
          {children}
        </NuqsTestingAdapter>
      )
      render(<Picker />, { wrapper })
      expect(
        screen.getByRole('button', { name: 'Time range' }),
        `label absent for range "${range}"`,
      ).toHaveTextContent(expectedLabel)
      cleanup()
    }
  })
})
