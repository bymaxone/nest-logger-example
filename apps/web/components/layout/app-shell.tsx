/**
 * @fileoverview App chrome — fixed topbar + sticky sidebar + the page content well.
 *
 * Owns the mobile sidebar open/close state. The content well uses `max-w-7xl`
 * to accommodate chart-heavy pages (Overview, Explorer).
 */

'use client'

import { type ReactNode, useState } from 'react'
import { Topbar } from './topbar'
import { Sidebar } from './sidebar'

/** App chrome — fixed topbar + sticky sidebar + the page content well. */
export function AppShell({ children }: { children: ReactNode }) {
  const [isOpen, setIsOpen] = useState(false)
  return (
    <>
      <Topbar onMenuOpen={() => setIsOpen(true)} />
      <div className="flex pt-16">
        <Sidebar isOpen={isOpen} onNavClick={() => setIsOpen(false)} />
        <main className="min-w-0 flex-1 px-6 py-8">
          <div className="mx-auto max-w-7xl">{children}</div>
        </main>
      </div>
    </>
  )
}
