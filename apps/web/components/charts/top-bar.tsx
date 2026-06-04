/**
 * @fileoverview TopBar — reusable horizontal top-N bar panel (click-to-filter).
 *
 * Renders bounded-dimension facet rows (logKey, tenantId, …) as horizontal bars.
 * Clicking a bar calls `onPick(value)` so the caller can pivot the filter to the
 * Explorer (`DASHBOARD.md` §5). Server-fed; the browser never derives counts.
 *
 * @module components/charts/top-bar
 */

'use client'

import { Bar, BarChart, Rectangle, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import type { BarShapeProps } from 'recharts'

import type { FacetValue } from '@/lib/types'
import { Skeleton } from '@/components/ui/skeleton'
import { AXIS_TICK, CHART_TOOLTIP_STYLE } from './chart-style'

interface TopBarProps {
  /** Panel heading (mono). */
  title: string
  /** Top-N facet rows to render. */
  rows: FacetValue[]
  /** Called with the picked value when a bar is clicked. */
  onPick: (value: string) => void
  /** Bar fill colour (defaults to brand orange). */
  fill?: string
  /** Whether the data is still loading. */
  loading?: boolean
}

/**
 * Reusable horizontal top-N bar chart with click-to-filter.
 *
 * @param props - {@link TopBarProps}.
 * @returns The top-N bar panel.
 */
export function TopBar({ title, rows, onPick, fill = '#ff6224', loading = false }: TopBarProps) {
  return (
    <div className="flex h-full flex-col">
      <h3 className="mb-2 font-mono text-sm font-medium text-white/70">{title}</h3>
      {loading ? (
        <Skeleton className="h-[160px] w-full" />
      ) : rows.length === 0 ? (
        <p className="flex h-[160px] items-center justify-center text-xs text-white/40">No data</p>
      ) : (
        <ResponsiveContainer width="100%" height={160}>
          <BarChart data={rows} layout="vertical" margin={{ left: 4, right: 8, top: 0, bottom: 0 }}>
            <XAxis type="number" hide allowDecimals={false} />
            <YAxis
              type="category"
              dataKey="value"
              width={120}
              tick={{ ...AXIS_TICK, fontFamily: 'var(--font-mono)' }}
              tickFormatter={(v: string) => (v.length > 18 ? `${v.slice(0, 17)}…` : v)}
            />
            <Tooltip
              contentStyle={CHART_TOOLTIP_STYLE}
              cursor={{ fill: 'rgba(255,255,255,0.04)' }}
            />
            <Bar
              dataKey="count"
              fill={fill}
              radius={[0, 4, 4, 0]}
              isAnimationActive={false}
              shape={(props: BarShapeProps) => {
                const row = props.payload as FacetValue | undefined
                return (
                  <Rectangle
                    {...props}
                    fill={fill}
                    cursor="pointer"
                    onClick={() => {
                      if (row !== undefined) onPick(row.value)
                    }}
                  />
                )
              }}
            />
          </BarChart>
        </ResponsiveContainer>
      )}
    </div>
  )
}
