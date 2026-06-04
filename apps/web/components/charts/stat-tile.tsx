/**
 * @fileoverview StatTile — a golden-signal stat tile: value + sparkline + Δ badge.
 *
 * Reusable glass card used across the Overview health strip. Blue = good,
 * red = bad: the `danger` flag rings the tile and the Δ badge colours by
 * direction (rising = red, falling = green for error-like metrics).
 *
 * @module components/charts/stat-tile
 */

'use client'

import { Line, LineChart, ResponsiveContainer } from 'recharts'

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { cn } from '@/lib/utils'

interface StatTileProps {
  /** Tile heading (mono). */
  title: string
  /** Big headline value (already formatted). */
  value: string
  /** Signed percent change vs the earlier part of the window; omit to hide the badge. */
  delta?: number
  /** Sparkline series (one number per bucket). */
  series: number[]
  /** When true, ring the tile red (threshold breached). */
  danger?: boolean
  /** Optional sub-label under the value (e.g. "p95", "req/min"). */
  hint?: string
}

/**
 * A single golden-signal stat tile.
 *
 * @param props - {@link StatTileProps}.
 * @returns The stat tile card.
 */
export function StatTile({ title, value, delta, series, danger = false, hint }: StatTileProps) {
  const data = series.map((n, i) => ({ i, n }))
  const stroke = danger ? '#ef4444' : '#60a5fa'

  return (
    <Card className={cn('min-w-40 flex-1', danger && 'ring-1 ring-destructive/60')}>
      <CardHeader className="pb-2">
        <CardTitle className="font-mono text-xs font-medium text-white/55">{title}</CardTitle>
      </CardHeader>
      <CardContent className="space-y-1">
        <div className="flex items-baseline gap-2">
          <span
            className={cn('text-2xl font-bold', danger ? 'text-destructive' : 'text-foreground')}
          >
            {value}
          </span>
          {hint !== undefined && <span className="text-[11px] text-white/40">{hint}</span>}
        </div>
        <div className="h-9">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={data}>
              <Line
                type="monotone"
                dataKey="n"
                stroke={stroke}
                dot={false}
                strokeWidth={2}
                isAnimationActive={false}
              />
            </LineChart>
          </ResponsiveContainer>
        </div>
        {delta !== undefined && Number.isFinite(delta) && (
          <span
            className={cn(
              'font-mono text-[11px]',
              delta > 0 ? 'text-destructive' : 'text-(--color-success)',
            )}
          >
            {delta > 0 ? '▲' : '▼'} {Math.abs(delta).toFixed(1)}%
          </span>
        )}
      </CardContent>
    </Card>
  )
}
