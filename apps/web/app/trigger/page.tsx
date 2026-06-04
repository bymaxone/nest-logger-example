/**
 * @fileoverview Trigger Center (Log Playground) page — a grid of cards that fire
 * each `apps/api` demo endpoint to emit a specific kind of log, then deep-link
 * the result into the Explorer.
 *
 * A thin server-component shell that renders the `'use client'` {@link TriggerGrid}
 * inside the app chrome (`DASHBOARD.md` §8).
 *
 * @module app/trigger/page
 */

import { AppShell } from '@/components/layout/app-shell'
import { TriggerGrid } from '@/components/trigger/trigger-grid'

// The grid holds per-card fire state and reads the active tenant from the URL,
// so render dynamically rather than statically prerendering.
export const dynamic = 'force-dynamic'

/**
 * Trigger Center page.
 *
 * @returns The playground header + the trigger card grid inside the app shell.
 */
export default function TriggerPage() {
  return (
    <AppShell>
      <div className="space-y-6">
        <header className="space-y-1">
          <h1 className="text-2xl font-semibold text-foreground">Trigger Center</h1>
          <p className="text-sm text-white/55">
            Fire each library feature to emit a specific kind of log, then jump straight to the
            Explorer to see what landed.
          </p>
        </header>
        <TriggerGrid />
      </div>
    </AppShell>
  )
}
