/**
 * @fileoverview LiveToggle — `⟳` switch enabling the SSE live tail.
 *
 * Writes the global `live` boolean to the URL; the Explorer's stream subscribes
 * when it is on. Disabled on absolute time ranges (the live tail is relative-only
 * per `DASHBOARD.md` §7).
 *
 * @module components/controls/live-toggle
 */

'use client'

import { RefreshCw } from 'lucide-react'

import { useLogQuery } from '@/lib/filters'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'

/**
 * Icon toggle that turns the SSE live tail on/off.
 *
 * @returns The live-tail toggle button.
 */
export function LiveToggle() {
  const { setQuery, live, isRelative } = useLogQuery()

  return (
    <Button
      type="button"
      variant={live ? 'default' : 'outline'}
      size="sm"
      disabled={!isRelative}
      aria-pressed={live}
      title={isRelative ? 'Toggle live tail' : 'Live tail is available on relative ranges only'}
      onClick={() => void setQuery({ live: !live })}
    >
      <RefreshCw className={cn('h-3.5 w-3.5', live && 'animate-spin')} />
      {live ? 'Live' : 'Live off'}
    </Button>
  )
}
