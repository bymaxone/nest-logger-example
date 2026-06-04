/**
 * @fileoverview VolumeBar — the signature brushable log-volume panel.
 *
 * Stacked bar by level per bucket (fed by `/logs/aggregate?metric=volume`).
 * Dragging the Recharts brush lifts the selected window to the URL `from`/`to`
 * via `onBrush`, which drives every other panel and the Explorer — the core
 * "brush → filter" payoff (`DASHBOARD.md` §5).
 *
 * @module components/charts/volume-bar
 */

'use client'

import {
  Bar,
  BarChart,
  Brush,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import type { LogLevel } from '@bymax-one/nest-logger/shared'

import { useAggregate } from '@/hooks/use-aggregate'
import type { LogQuery } from '@/lib/types'
import { formatBucket, pivotVolume } from '@/lib/metrics'
import { SEVERITY } from '@/lib/severity'
import { Skeleton } from '@/components/ui/skeleton'
import { AXIS_TICK, CHART_TOOLTIP_STYLE, GRID_STROKE } from './chart-style'

/** Stack order, lowest severity at the base. Colours reuse `lib/severity.ts`. */
const STACK_LEVELS: readonly LogLevel[] = ['trace', 'debug', 'info', 'warn', 'error', 'fatal']

interface VolumeBarProps {
  /** The active filter (time window + source). */
  query: LogQuery
  /** Called with the ISO `from`/`to` of the brushed range. */
  onBrush: (from: string, to: string) => void
}

/**
 * Brushable stacked-bar volume timeseries.
 *
 * @param props - {@link VolumeBarProps}.
 * @returns The volume panel with a range brush.
 */
export function VolumeBar({ query, onBrush }: VolumeBarProps) {
  const { data, isLoading } = useAggregate('volume', query)
  const points = pivotVolume(data ?? [])

  if (isLoading) return <Skeleton className="h-[200px] w-full" />

  return (
    <ResponsiveContainer width="100%" height={200}>
      <BarChart data={points} margin={{ top: 4, right: 8, bottom: 0, left: 0 }}>
        <CartesianGrid strokeDasharray="3 3" stroke={GRID_STROKE} vertical={false} />
        <XAxis dataKey="bucket" tickFormatter={formatBucket} tick={AXIS_TICK} minTickGap={32} />
        <YAxis tick={AXIS_TICK} width={32} allowDecimals={false} />
        <Tooltip
          contentStyle={CHART_TOOLTIP_STYLE}
          labelFormatter={(label) => formatBucket(String(label))}
        />
        {STACK_LEVELS.map((level) => (
          <Bar key={level} dataKey={level} stackId="volume" fill={SEVERITY[level].color} />
        ))}
        <Brush
          dataKey="bucket"
          height={22}
          stroke="#ff6224"
          fill="rgba(255,98,36,0.08)"
          travellerWidth={8}
          tickFormatter={formatBucket}
          onChange={(range: { startIndex?: number; endIndex?: number }) => {
            const start = points[range.startIndex ?? 0]
            const end = points[range.endIndex ?? points.length - 1]
            if (start !== undefined && end !== undefined) onBrush(start.bucket, end.bucket)
          }}
        />
      </BarChart>
    </ResponsiveContainer>
  )
}
