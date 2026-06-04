/**
 * @fileoverview LatencyLines — RED "Duration": p50/p95/p99 latency lines.
 *
 * Reads `/logs/aggregate?metric=latency` (`percentile_cont` server-side) and
 * draws percentile lines — never an average (`DASHBOARD.md` §2 principle 4).
 *
 * @module components/charts/latency-lines
 */

'use client'

import {
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'

import { useAggregate } from '@/hooks/use-aggregate'
import type { LogQuery } from '@/lib/types'
import { formatBucket } from '@/lib/metrics'
import { Skeleton } from '@/components/ui/skeleton'
import { AXIS_TICK, CHART_TOOLTIP_STYLE, GRID_STROKE } from './chart-style'

interface LatencyLinesProps {
  /** The active filter. */
  query: LogQuery
}

/**
 * p50 / p95 / p99 latency lines (RED — Duration).
 *
 * @param props - {@link LatencyLinesProps}.
 * @returns The latency percentile line chart.
 */
export function LatencyLines({ query }: LatencyLinesProps) {
  const { data, isLoading } = useAggregate('latency', query)

  if (isLoading) return <Skeleton className="h-[150px] w-full" />

  return (
    <ResponsiveContainer width="100%" height={150}>
      <LineChart data={data ?? []} margin={{ top: 4, right: 8, bottom: 0, left: 0 }}>
        <CartesianGrid strokeDasharray="3 3" stroke={GRID_STROKE} vertical={false} />
        <XAxis dataKey="bucket" tickFormatter={formatBucket} tick={AXIS_TICK} minTickGap={32} />
        <YAxis tick={AXIS_TICK} width={40} unit="ms" />
        <Tooltip
          contentStyle={CHART_TOOLTIP_STYLE}
          labelFormatter={(label) => formatBucket(String(label))}
        />
        <Line
          type="monotone"
          dataKey="p50"
          name="p50"
          stroke="#60a5fa"
          dot={false}
          strokeWidth={1.5}
          isAnimationActive={false}
        />
        <Line
          type="monotone"
          dataKey="p95"
          name="p95"
          stroke="#f59e0b"
          dot={false}
          strokeWidth={1.5}
          isAnimationActive={false}
        />
        <Line
          type="monotone"
          dataKey="p99"
          name="p99"
          stroke="#ef4444"
          dot={false}
          strokeWidth={1.5}
          isAnimationActive={false}
        />
      </LineChart>
    </ResponsiveContainer>
  )
}
