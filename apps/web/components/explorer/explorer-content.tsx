/**
 * @fileoverview ExplorerContent — the client body of the Log Explorer.
 *
 * Two-pane layout: faceted rail (left) + query bar, brushable volume histogram,
 * and the virtualized table (right). Row click opens the detail drawer. All
 * filter state is the nuqs URL state, so a brushed range from the Overview lands
 * here pre-filtered. When Live is on (relative ranges only), the SSE tail appends
 * new rows at the bottom with follow-mode (`DASHBOARD.md` §6–§7).
 *
 * @module components/explorer/explorer-content
 */

'use client'

import { useRef, useState } from 'react'
import { ArrowDownToLine, Eraser, Pause, Play, Radio } from 'lucide-react'

import { useLogQuery } from '@/lib/filters'
import { useLogStream } from '@/lib/use-event-source'
import { useFollowMode } from '@/hooks/use-follow-mode'
import type { LogRow } from '@/lib/types'
import { Button } from '@/components/ui/button'
import { ChartCard } from '@/components/charts/chart-card'
import { VolumeBar } from '@/components/charts/volume-bar'
import { cn } from '@/lib/utils'
import { FacetRail } from './facet-rail'
import { QueryBar } from './query-bar'
import { LogTable } from './log-table'
import { DetailDrawer } from './detail-drawer'

/**
 * The Log Explorer page body.
 *
 * @returns The composed Explorer (rail + query bar + volume + table + drawer + live tail).
 */
export function ExplorerContent() {
  const { query, setQuery, live, isRelative } = useLogQuery()
  const [selected, setSelected] = useState<LogRow | null>(null)
  const [drawerOpen, setDrawerOpen] = useState(false)

  const scrollRef = useRef<HTMLDivElement | null>(null)
  const streamEnabled = live && isRelative
  const stream = useLogStream(query, streamEnabled)
  const follow = useFollowMode(scrollRef, stream.rows.length)

  const openRow = (row: LogRow): void => {
    setSelected(row)
    setDrawerOpen(true)
  }

  return (
    <div className="grid gap-4 lg:grid-cols-[260px_minmax(0,1fr)]">
      <FacetRail />
      <div className="min-w-0 space-y-4">
        <QueryBar />
        <ChartCard title="Volume — drag the brush to filter the time range">
          <VolumeBar query={query} onBrush={(from, to) => void setQuery({ from, to, range: '' })} />
        </ChartCard>

        {/* Live-tail control bar (only when Live is on). */}
        {live && (
          <div className="flex flex-wrap items-center gap-2 rounded-lg border border-(--glass-border) bg-(--glass-bg) px-3 py-2 text-xs">
            <span
              className={cn(
                'flex items-center gap-1.5 font-mono',
                stream.failed
                  ? 'text-destructive'
                  : stream.connected
                    ? 'text-(--color-success)'
                    : 'text-white/40',
              )}
            >
              <Radio className={cn('h-3.5 w-3.5', stream.connected && 'animate-pulse')} />
              {stream.failed
                ? 'Live tail failed — retry'
                : stream.connected
                  ? 'Streaming'
                  : streamEnabled
                    ? 'Connecting…'
                    : 'Paused (absolute range)'}
            </span>
            <span className="text-white/30">·</span>
            <span className="font-mono text-white/45">{stream.rows.length} live</span>
            <div className="ml-auto flex items-center gap-1.5">
              {follow.paused ? (
                <Button type="button" size="sm" variant="outline" onClick={follow.resume}>
                  <Play className="h-3.5 w-3.5" /> Resume
                </Button>
              ) : (
                <Button type="button" size="sm" variant="outline" onClick={follow.pause}>
                  <Pause className="h-3.5 w-3.5" /> Pause
                </Button>
              )}
              <Button type="button" size="sm" variant="outline" onClick={stream.clear}>
                <Eraser className="h-3.5 w-3.5" /> Clear
              </Button>
            </div>
          </div>
        )}

        <div className="relative">
          <LogTable
            query={query}
            onRowClick={openRow}
            liveRows={live ? stream.rows : []}
            scrollRef={scrollRef}
          />
          {live && follow.newCount > 0 && (
            <button
              type="button"
              onClick={follow.jumpToLatest}
              className="absolute bottom-4 left-1/2 -translate-x-1/2 rounded-full bg-brand-500 px-4 py-1.5 font-mono text-xs font-semibold text-white shadow-(--shadow-primary)"
            >
              <ArrowDownToLine className="mr-1 inline h-3.5 w-3.5" />
              {follow.newCount} new logs — Jump to latest
            </button>
          )}
        </div>

        <DetailDrawer row={selected} open={drawerOpen} onOpenChange={setDrawerOpen} />
      </div>
    </div>
  )
}
