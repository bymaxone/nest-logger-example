/**
 * @fileoverview Component tests for {@link IncidentTimeline} — the read-only,
 * newest-first transition history.
 *
 * Covers the empty-state note, the newest-first ordering (the source array is
 * reversed without mutation), and that each entry renders its actor, action, and
 * a formatted timestamp. No network or RBAC — the timeline is a pure presenter.
 *
 * @module components/alerts/incident-timeline.test
 */
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, render, screen, within } from '@testing-library/react'

import type { IncidentEvent } from '@/lib/alerts-api'
import { IncidentTimeline } from './incident-timeline'

afterEach(() => {
  cleanup()
})

describe('IncidentTimeline', () => {
  /** An empty timeline shows the "no transitions" note (the empty-state branch). */
  it('renders the empty-state note when there are no transitions', () => {
    render(<IncidentTimeline timeline={[]} />)
    expect(screen.getByText('No transitions yet.')).toBeInTheDocument()
    expect(screen.queryByRole('list')).not.toBeInTheDocument()
  })

  /** A populated timeline lists entries newest-first without mutating the source. */
  it('renders entries newest-first leaving the source array untouched', () => {
    const timeline: IncidentEvent[] = [
      { actor: 'alice', action: 'acknowledged', at: '2026-01-01T10:00:00.000Z' },
      { actor: 'bob', action: 'resolved', at: '2026-01-01T11:00:00.000Z' },
    ]
    const original = [...timeline]
    render(<IncidentTimeline timeline={timeline} />)

    const items = screen.getAllByRole('listitem')
    expect(items).toHaveLength(2)
    // Newest (bob/resolved) renders first, oldest (alice/acknowledged) last.
    expect(within(items[0]!).getByText('bob')).toBeInTheDocument()
    expect(within(items[0]!).getByText('resolved')).toBeInTheDocument()
    expect(within(items[1]!).getByText('alice')).toBeInTheDocument()
    expect(within(items[1]!).getByText('acknowledged')).toBeInTheDocument()
    // The presenter copies before reversing — the caller's array order is intact.
    expect(timeline).toEqual(original)
  })

  /**
   * Each entry gets a unique React key (`${event.at}-${index}`). Mutating the key
   * to an empty template literal collides two sibling entries, which React reports
   * via a `console.error` duplicate-key warning. Asserting no such warning fires
   * kills the StringLiteral→`` mutation on the key.
   */
  it('assigns unique keys so React emits no duplicate-key warning', () => {
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    // Two entries that share the same `at` — only the appended index keeps the
    // keys distinct, so an empty-template-literal mutation would collide them.
    const timeline: IncidentEvent[] = [
      { actor: 'alice', action: 'acknowledged', at: '2026-01-01T10:00:00.000Z' },
      { actor: 'bob', action: 'resolved', at: '2026-01-01T10:00:00.000Z' },
    ]
    render(<IncidentTimeline timeline={timeline} />)
    expect(screen.getAllByRole('listitem')).toHaveLength(2)
    const warnedAboutKeys = errorSpy.mock.calls.some((call) => String(call[0]).includes('same key'))
    expect(warnedAboutKeys).toBe(false)
    errorSpy.mockRestore()
  })

  /** Each entry exposes a machine-readable dateTime on its <time> element. */
  it('renders a time element carrying the raw ISO dateTime', () => {
    const at = '2026-01-01T10:00:00.000Z'
    render(<IncidentTimeline timeline={[{ actor: 'alice', action: 'snoozed', at }]} />)
    const item = screen.getByRole('listitem')
    const time = within(item).getByText(new Date(at).toLocaleString())
    expect(time.tagName).toBe('TIME')
    expect(time).toHaveAttribute('dateTime', at)
  })
})
