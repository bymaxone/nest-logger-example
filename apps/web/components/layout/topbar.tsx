/**
 * @fileoverview Fixed 64px dark-glass top bar — brand identity + global controls.
 *
 * Shows the orange-bordered stacked-layers brand mark and the gradient
 * `nest-logger-example` wordmark on the left. The right cluster holds the four
 * global controls (time range, source, tenant/role, live) — all of which write
 * to the URL — plus the hamburger that toggles the mobile sidebar overlay.
 */

'use client'

import { Menu } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { TimeRangePicker } from '@/components/controls/time-range-picker'
import { SourceToggle } from '@/components/controls/source-toggle'
import { TenantRoleSwitcher } from '@/components/controls/tenant-role-switcher'
import { LiveToggle } from '@/components/controls/live-toggle'

interface TopbarProps {
  /** Called when the hamburger button is pressed to toggle the sidebar. */
  onMenuOpen: () => void
}

/** Fixed 64px dark-glass top bar — brand identity (left) + controls slot (right). */
export function Topbar({ onMenuOpen }: TopbarProps) {
  return (
    <header className="fixed left-0 right-0 top-0 z-200 flex h-16 items-center justify-between border-b border-white/7 bg-black/85 px-4 backdrop-blur-md lg:px-6">
      {/* ── Left: brand ── */}
      <div className="flex items-center gap-3">
        <div
          className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-brand-500/40 bg-brand-500/15"
          aria-hidden="true"
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
            <path
              d="M12 2L2 7l10 5 10-5-10-5ZM2 17l10 5 10-5M2 12l10 5 10-5"
              stroke="var(--color-brand-500)"
              strokeWidth="1.5"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        </div>
        <span className="select-none bg-linear-to-r from-brand-500 to-amber-200 bg-clip-text font-mono text-sm font-bold leading-tight text-transparent">
          nest-logger-example
        </span>
      </div>

      {/* ── Right: global controls + hamburger (mobile) ── */}
      <div className="flex items-center gap-2">
        <div className="hidden items-center gap-2 md:flex">
          <TimeRangePicker />
          <SourceToggle />
          <TenantRoleSwitcher />
          <LiveToggle />
        </div>
        <Button
          variant="ghost"
          size="icon"
          aria-label="Open navigation menu"
          className="flex lg:hidden"
          onClick={onMenuOpen}
        >
          <Menu className="h-4 w-4 text-white/70" />
        </Button>
      </div>
    </header>
  )
}
