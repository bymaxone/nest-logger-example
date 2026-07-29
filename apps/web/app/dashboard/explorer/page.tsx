/**
 * @fileoverview Log Explorer page — facet rail, query bar, volume, table, drawer.
 *
 * A thin server-component shell that renders the `'use client'`
 * {@link ExplorerContent} inside the app chrome.
 *
 * @module app/explorer/page
 */

import { AppShell } from '@/components/layout/app-shell'
import { ExplorerContent } from '@/components/explorer/explorer-content'

// URL-driven dashboard: the rail, query bar, and table read live search params,
// so the page renders dynamically rather than being statically prerendered.
export const dynamic = 'force-dynamic'

/**
 * Log Explorer page.
 *
 * @returns The Explorer content inside the app shell.
 */
export default function ExplorerPage() {
  return (
    <AppShell>
      <ExplorerContent />
    </AppShell>
  )
}
