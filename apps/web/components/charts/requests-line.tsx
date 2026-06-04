/**
 * @fileoverview RequestsLine — RED "Rate": HTTP requests per bucket.
 *
 * Derives request volume per bucket from `/logs/aggregate?metric=statusMix`
 * (the sum of status classes equals the count of HTTP rows). Server-fed; no
 * client-side aggregation of raw rows.
 *
 * @module components/charts/requests-line
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
import { formatBucket, statusTotals } from '@/lib/metrics'
import { Skeleton } from '@/components/ui/skeleton'
import { AXIS_TICK, CHART_TOOLTIP_STYLE, GRID_STROKE } from './chart-style'

interface RequestsLineProps {
  /** The active filter. */
  query: LogQuery
}

/**
 * Requests-per-bucket line (RED — Rate).
 *
 * @param props - {@link RequestsLineProps}.
 * @returns The requests line chart.
 */
export function RequestsLine({ query }: RequestsLineProps) {
  const { data, isLoading } = useAggregate('statusMix', query)
  const points = statusTotals(data ?? [])

  if (isLoading) return <Skeleton className="h-[150px] w-full" />

  return (
    <ResponsiveContainer width="100%" height={150}>
      <LineChart data={points} margin={{ top: 4, right: 8, bottom: 0, left: 0 }}>
        <CartesianGrid strokeDasharray="3 3" stroke={GRID_STROKE} vertical={false} />
        <XAxis dataKey="bucket" tickFormatter={formatBucket} tick={AXIS_TICK} minTickGap={32} />
        <YAxis tick={AXIS_TICK} width={32} allowDecimals={false} />
        <Tooltip
          contentStyle={CHART_TOOLTIP_STYLE}
          labelFormatter={(label) => formatBucket(String(label))}
        />
        <Line
          type="monotone"
          dataKey="total"
          name="requests"
          stroke="#60a5fa"
          dot={false}
          strokeWidth={2}
          isAnimationActive={false}
        />
      </LineChart>
    </ResponsiveContainer>
  )
}
