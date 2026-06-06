/**
 * @fileoverview TimeRangePicker — relative presets + an absolute range.
 *
 * Relative presets (5m…7d) write a `range` token (resolved to a live, quantized
 * window by `useLogQuery`); the absolute inputs write concrete ISO `from`/`to`
 * and clear `range`. All state lives in the URL (`DASHBOARD.md` §4).
 *
 * The design system does not ship the shadcn `Calendar`; the absolute range uses
 * native `datetime-local` inputs to stay dependency-free while still writing ISO.
 *
 * @module components/controls/time-range-picker
 */

'use client'

import { useQueryStates } from 'nuqs'
import { CalendarClock } from 'lucide-react'

import { logQueryParsers, RANGE_PRESETS } from '@/lib/filters'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { cn } from '@/lib/utils'

/** Human labels for each relative preset token. */
const PRESET_LABEL: Record<(typeof RANGE_PRESETS)[number], string> = {
  '5m': 'Last 5m',
  '15m': 'Last 15m',
  '1h': 'Last 1h',
  '6h': 'Last 6h',
  '24h': 'Last 24h',
  '7d': 'Last 7d',
}

/**
 * Convert an ISO timestamp to a `datetime-local` input value (local time, minutes).
 *
 * @param iso - An ISO-8601 string, or empty.
 * @returns The `YYYY-MM-DDTHH:mm` local value, or empty when unset/invalid.
 */
function isoToLocalInput(iso: string): string {
  if (iso === '') return ''
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return ''
  const pad = (n: number): string => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`
}

/**
 * Convert a `datetime-local` input value to an ISO-8601 string.
 *
 * @param local - The `YYYY-MM-DDTHH:mm` local value.
 * @returns The ISO string, or empty when the value is blank/invalid.
 */
function localInputToIso(local: string): string {
  if (local === '') return ''
  const d = new Date(local)
  return Number.isNaN(d.getTime()) ? '' : d.toISOString()
}

/**
 * Time-range control: relative presets and an absolute range, persisted in the URL.
 *
 * @returns The time-range popover trigger and panel.
 */
export function TimeRangePicker() {
  const [{ range, from, to }, setQuery] = useQueryStates(logQueryParsers)

  const label =
    range !== '' && range in PRESET_LABEL
      ? PRESET_LABEL[range as (typeof RANGE_PRESETS)[number]]
      : from !== '' || to !== ''
        ? 'Custom range'
        : 'Last 1h'

  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button type="button" variant="outline" size="sm" aria-label="Time range">
          <CalendarClock className="h-3.5 w-3.5" />
          <span className="font-mono">{label}</span>
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-72 space-y-4">
        <div>
          <p className="mb-2 font-mono text-xs text-white/55">Relative</p>
          <div className="grid grid-cols-3 gap-1.5">
            {RANGE_PRESETS.map((preset) => (
              <Button
                key={preset}
                type="button"
                variant={range === preset ? 'default' : 'outline'}
                size="sm"
                className={cn('justify-center', range === preset && 'font-semibold')}
                onClick={() => void setQuery({ range: preset, from: '', to: '' })}
              >
                {preset}
              </Button>
            ))}
          </div>
        </div>
        <div>
          <p className="mb-2 font-mono text-xs text-white/55">Absolute</p>
          <div className="space-y-2">
            <label className="block text-[11px] text-white/45">
              From
              <Input
                type="datetime-local"
                value={isoToLocalInput(from)}
                onChange={(e) =>
                  void setQuery({ from: localInputToIso(e.target.value), range: '' })
                }
                className="mt-1 h-8 font-mono text-xs"
              />
            </label>
            <label className="block text-[11px] text-white/45">
              To
              <Input
                type="datetime-local"
                value={isoToLocalInput(to)}
                onChange={(e) => void setQuery({ to: localInputToIso(e.target.value), range: '' })}
                className="mt-1 h-8 font-mono text-xs"
              />
            </label>
          </div>
        </div>
      </PopoverContent>
    </Popover>
  )
}
