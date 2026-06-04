/**
 * @fileoverview IncidentTimeline — the immutable, read-only transition history.
 *
 * Renders an incident's `timeline` entries newest-first as `{actor} {action} ·
 * {time}`. The list is strictly read-only: there are no edit/delete affordances
 * because transitions are append-only (they pair with the audit trail).
 *
 * @module components/alerts/incident-timeline
 */

'use client'

import type { IncidentEvent } from '@/lib/alerts-api'

/**
 * Read-only, newest-first incident transition timeline.
 *
 * @param props - The immutable timeline entries.
 * @returns The rendered transition list (or an empty-state note).
 */
export function IncidentTimeline({ timeline }: { timeline: IncidentEvent[] }) {
  if (timeline.length === 0) {
    return <p className="text-[11px] text-white/40">No transitions yet.</p>
  }
  // Copy before reversing so the immutable source array is never mutated in place.
  const newestFirst = [...timeline].reverse()
  return (
    <ol className="space-y-1">
      {newestFirst.map((event, index) => (
        <li
          key={`${event.at}-${index}`}
          className="flex items-center gap-2 font-mono text-[11px] text-white/60"
        >
          <span className="text-white/80">{event.actor}</span>
          <span className="text-brand-500">{event.action}</span>
          <span className="text-white/30">·</span>
          <time dateTime={event.at}>{new Date(event.at).toLocaleString()}</time>
        </li>
      ))}
    </ol>
  )
}
