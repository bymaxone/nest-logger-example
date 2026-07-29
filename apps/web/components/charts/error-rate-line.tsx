/**
 * @fileoverview ErrorRateLine — RED "Errors": 4xx and 5xx rate per bucket.
 *
 * Computes per-bucket `4xx/total` and `5xx/total` percentages from
 * `/logs/aggregate?metric=statusMix` and draws a 1% threshold reference line
 * (`DASHBOARD.md` §5). Two separate series so client vs server errors are
 * distinguishable.
 *
 * @module components/charts/error-rate-line
 */

'use client'

import {
  CartesianGrid,
  Line,
  LineChart,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'

import { useAggregate } from '@/hooks/use-aggregate'
import type { LogQuery } from '@/lib/types'
import { formatBucket } from '@/lib/metrics'
import { ERROR_RATE_SERIES } from '@/lib/chart-series'
import { Skeleton } from '@/components/ui/skeleton'
import { AXIS_TICK, CHART_TOOLTIP_STYLE, GRID_STROKE } from './chart-style'

/** Error-rate threshold line (1%). */
const THRESHOLD_PCT = 1

interface ErrorRateLineProps {
  /** The active filter. */
  query: LogQuery
}

/**
 * 4xx / 5xx error-rate lines with a 1% threshold (RED — Errors).
 *
 * @param props - {@link ErrorRateLineProps}.
 * @returns The error-rate line chart.
 */
export function ErrorRateLine({ query }: ErrorRateLineProps) {
  const { data, isLoading } = useAggregate('statusMix', query)

  if (isLoading) return <Skeleton className="h-[150px] w-full" />

  const points = (data ?? []).map((r) => {
    const total = r.s2xx + r.s3xx + r.s4xx + r.s5xx
    return {
      bucket: r.bucket,
      rate4xx: total === 0 ? 0 : (r.s4xx / total) * 100,
      rate5xx: total === 0 ? 0 : (r.s5xx / total) * 100,
    }
  })

  return (
    <ResponsiveContainer width="100%" height={150}>
      <LineChart data={points} margin={{ top: 4, right: 8, bottom: 0, left: 0 }}>
        <CartesianGrid strokeDasharray="3 3" stroke={GRID_STROKE} vertical={false} />
        <XAxis dataKey="bucket" tickFormatter={formatBucket} tick={AXIS_TICK} minTickGap={32} />
        <YAxis tick={AXIS_TICK} width={36} unit="%" />
        <Tooltip
          contentStyle={CHART_TOOLTIP_STYLE}
          labelFormatter={(label) => formatBucket(String(label))}
        />
        <ReferenceLine y={THRESHOLD_PCT} stroke="#f59e0b" strokeDasharray="4 4" />
        {ERROR_RATE_SERIES.map((s) => (
          <Line
            key={s.key}
            type="monotone"
            dataKey={s.key}
            name={s.label}
            stroke={s.color}
            dot={false}
            strokeWidth={2}
            isAnimationActive={false}
          />
        ))}
      </LineChart>
    </ResponsiveContainer>
  )
}
