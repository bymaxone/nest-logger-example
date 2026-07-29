/**
 * @fileoverview Component tests for {@link LiveToggle} — the relative-only
 * enablement guard, the on/off label + `aria-pressed` reflection, and the URL
 * write that flips the `live` boolean.
 *
 * The toggle is a thin wrapper over the nuqs URL state, so the tests wrap it in a
 * `NuqsTestingAdapter`: the `searchParams` seed drives the rendered branch and the
 * `onUrlUpdate` spy asserts the boolean it writes back.
 *
 * @module components/controls/live-toggle.test
 */
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { NuqsTestingAdapter } from 'nuqs/adapters/testing'
import type { OnUrlUpdateFunction } from 'nuqs/adapters/testing'
import type { ReactElement, ReactNode } from 'react'

import { LiveToggle } from './live-toggle'

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
  render(<LiveToggle />, { wrapper })
}

afterEach(() => {
  cleanup()
  vi.clearAllMocks()
})

describe('LiveToggle', () => {
  /** With no range or absolute window the range is relative, so the toggle is enabled and reads "Live off". */
  it('renders enabled and off on a relative (default) range', () => {
    renderToggle('')
    const button = screen.getByRole('button', { name: /live/i })
    expect(button).toBeEnabled()
    expect(button).toHaveAttribute('aria-pressed', 'false')
    expect(button).toHaveAttribute('title', 'Toggle live tail')
    expect(screen.getByText('Live off')).toBeInTheDocument()
  })

  /** An active live tail reflects `aria-pressed=true` and the "Live" label (the on branch). */
  it('reflects the on state when live=true', () => {
    renderToggle('?live=true')
    const button = screen.getByRole('button', { name: /live/i })
    expect(button).toHaveAttribute('aria-pressed', 'true')
    expect(screen.getByText('Live')).toBeInTheDocument()
  })

  /** An absolute window (from/to set, no range) is non-relative, so the toggle is disabled with the explanatory title. */
  it('disables the toggle on an absolute range', () => {
    renderToggle('?from=2026-01-01T00:00:00.000Z&to=2026-01-02T00:00:00.000Z')
    const button = screen.getByRole('button', { name: /live/i })
    expect(button).toBeDisabled()
    expect(button).toHaveAttribute('title', 'Live tail is available on relative ranges only')
  })

  /** Clicking when off writes `live=true` to the URL (the setQuery toggle path). */
  it('writes live=true when toggled on', async () => {
    const onUrlUpdate = vi.fn()
    renderToggle('', onUrlUpdate)
    await userEvent.click(screen.getByRole('button', { name: /live/i }))
    expect(onUrlUpdate).toHaveBeenCalledTimes(1)
    expect(onUrlUpdate.mock.calls[0]![0].searchParams.get('live')).toBe('true')
  })

  /** Clicking when on writes `live` back off (covers the `!live` inversion in the on direction). */
  it('writes live off when toggled from on', async () => {
    const onUrlUpdate = vi.fn()
    renderToggle('?live=true', onUrlUpdate)
    await userEvent.click(screen.getByRole('button', { name: /live/i }))
    expect(onUrlUpdate).toHaveBeenCalledTimes(1)
    // Flipping a default-false boolean back off clears it from the URL.
    expect(onUrlUpdate.mock.calls[0]![0].searchParams.get('live')).toBeNull()
  })

  /**
   * When live, the icon carries its sizing classes (`h-3.5 w-3.5`) and the spin
   * animation, and the button uses the brand-gradient default variant. Asserting
   * the icon classes kills the `cn` base-string mutation and the spin
   * mutations (`live && 'animate-spin'` → true/false and `'animate-spin'` → '').
   */
  it('renders the spinning sized icon when live', () => {
    renderToggle('?live=true')
    const button = screen.getByRole('button', { name: /live/i })
    const iconClass = button.querySelector('svg')?.getAttribute('class') ?? ''
    expect(iconClass).toContain('h-3.5')
    expect(iconClass).toContain('w-3.5')
    expect(iconClass).toContain('animate-spin')
    expect(button.className).toContain('from-brand-500')
  })

  /**
   * When not live, the icon keeps its sizing classes but does NOT spin, and the
   * button uses the outline variant (border, no gradient). The absence of
   * `animate-spin` kills the `&&` → `||` logical-operator mutation; the outline
   * classes kill the `'outline'` → '' variant mutation (which would otherwise
   * fall back to the brand-gradient default variant via cva).
   */
  it('renders a static sized icon and outline button when not live', () => {
    renderToggle('')
    const button = screen.getByRole('button', { name: /live/i })
    const iconClass = button.querySelector('svg')?.getAttribute('class') ?? ''
    expect(iconClass).toContain('h-3.5')
    expect(iconClass).toContain('w-3.5')
    expect(iconClass).not.toContain('animate-spin')
    expect(button.className).toContain('border')
    expect(button.className).not.toContain('from-brand-500')
  })
})
