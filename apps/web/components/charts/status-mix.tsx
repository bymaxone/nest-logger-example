/**
 * @fileoverview StatusMix — stacked status-class bar (2xx/3xx/4xx/5xx).
 *
 * Reads `/logs/aggregate?metric=statusMix` and stacks the four status classes per
 * bucket (`DASHBOARD.md` §11). Server-fed; bounded dimension (status class).
 *
 * @module components/charts/status-mix
 */

'use client'

import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'

import { useAggregate } from '@/hooks/use-aggregate'
import type { LogQuery } from '@/lib/types'
import { formatBucket } from '@/lib/metrics'
import { Skeleton } from '@/components/ui/skeleton'
import { AXIS_TICK, CHART_TOOLTIP_STYLE, GRID_STROKE } from './chart-style'

/** Status class → fill colour (green/blue/amber/red). */
const STATUS_FILL: Record<'s2xx' | 's3xx' | 's4xx' | 's5xx', string> = {
  s2xx: '#22c55e',
  s3xx: '#60a5fa',
  s4xx: '#f59e0b',
  s5xx: '#ef4444',
}

interface StatusMixProps {
  /** The active filter. */
  query: LogQuery
}

/**
 * Stacked status-class bar chart.
 *
 * @param props - {@link StatusMixProps}.
 * @returns The status-mix panel.
 */
export function StatusMix({ query }: StatusMixProps) {
  const { data, isLoading } = useAggregate('statusMix', query)

  if (isLoading) return <Skeleton className="h-[180px] w-full" />

  return (
    <ResponsiveContainer width="100%" height={180}>
      <BarChart data={data ?? []} margin={{ top: 4, right: 8, bottom: 0, left: 0 }}>
        <CartesianGrid strokeDasharray="3 3" stroke={GRID_STROKE} vertical={false} />
        <XAxis dataKey="bucket" tickFormatter={formatBucket} tick={AXIS_TICK} minTickGap={32} />
        <YAxis tick={AXIS_TICK} width={32} allowDecimals={false} />
        <Tooltip
          contentStyle={CHART_TOOLTIP_STYLE}
          labelFormatter={(label) => formatBucket(String(label))}
        />
        <Bar dataKey="s2xx" name="2xx" stackId="s" fill={STATUS_FILL.s2xx} />
        <Bar dataKey="s3xx" name="3xx" stackId="s" fill={STATUS_FILL.s3xx} />
        <Bar dataKey="s4xx" name="4xx" stackId="s" fill={STATUS_FILL.s4xx} />
        <Bar dataKey="s5xx" name="5xx" stackId="s" fill={STATUS_FILL.s5xx} />
      </BarChart>
    </ResponsiveContainer>
  )
}
