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
/**
 * The three decorative glow layers that sit behind the whole dashboard.
 *
 * They are what makes the cards' `backdrop-blur` visible: a blur filter over a
 * flat near-black page samples a uniform color and renders identically to no
 * blur at all. These wide, heavily blurred color fields give the glass surfaces
 * something to pick up, so the effect reads as depth rather than as a tint.
 * Purely presentational and never interactive.
 */
function AmbientGlow() {
  return (
    <div aria-hidden="true" className="pointer-events-none fixed inset-0 -z-10 overflow-hidden">
      <div className="animate-glow-float absolute -left-32 -top-32 h-[500px] w-[500px] rounded-full bg-[#ff6224] opacity-15 blur-[120px]" />
      <div className="animate-glow-drift absolute -right-20 -top-20 h-[400px] w-[400px] rounded-full bg-[#60a5fa] opacity-10 blur-[100px]" />
      <div className="animate-glow-float absolute bottom-0 left-1/2 h-[300px] w-[300px] -translate-x-1/2 rounded-full bg-[#f97316] opacity-[0.05] blur-[80px]" />
    </div>
  )
}

export function AppShell({ children }: { children: ReactNode }) {
  const [isOpen, setIsOpen] = useState(false)
  return (
    <>
      <AmbientGlow />

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
