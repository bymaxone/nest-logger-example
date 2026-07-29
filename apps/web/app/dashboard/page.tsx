/**
 * @fileoverview Overview page — the on-call landing dashboard.
 *
 * A thin server-component shell that renders the `'use client'`
 * {@link OverviewContent} (health strip → brushable volume → RED row →
 * breakdown row → pipeline health) inside the app chrome.
 *
 * @module app/page
 */

import { AppShell } from '@/components/layout/app-shell'
import { OverviewContent } from '@/components/charts/overview-content'

// URL-driven dashboard: the global controls and panels read live search params,
// so the page renders dynamically rather than being statically prerendered.
export const dynamic = 'force-dynamic'

/**
 * Overview dashboard page.
 *
 * @returns The Overview content inside the app shell.
 */
export default function OverviewPage() {
  return (
    <AppShell>
      <OverviewContent />
    </AppShell>
  )
}
