/**
 * @fileoverview LevelDonut — `count() by level` donut (click-to-filter).
 *
 * Sums the server-side volume aggregate by level (bounded, 6 slices) and renders
 * a donut coloured per `lib/severity.ts`. Clicking a slice pivots the Explorer to
 * that level via `setQuery` — a shareable deep-link (`DASHBOARD.md` §5).
 *
 * @module components/charts/level-donut
 */

'use client'

import { Cell, Pie, PieChart, ResponsiveContainer, Tooltip } from 'recharts'
import type { LogLevel } from '@bymax-one/nest-logger/shared'

import { useAggregate } from '@/hooks/use-aggregate'
import { useLogQuery } from '@/lib/filters'
import { SEVERITY } from '@/lib/severity'
import { Skeleton } from '@/components/ui/skeleton'
import { CHART_TOOLTIP_STYLE } from './chart-style'

/** Levels in legend order. */
const LEVELS: readonly LogLevel[] = ['fatal', 'error', 'warn', 'info', 'debug', 'trace']

/**
 * Level-distribution donut with click-to-filter.
 *
 * @returns The level donut panel.
 */
export function LevelDonut() {
  const { query, setQuery } = useLogQuery()
  const { data, isLoading } = useAggregate('volume', query)

  if (isLoading) return <Skeleton className="h-[180px] w-full" />

  const byLevel = new Map<LogLevel, number>()
  for (const row of data ?? []) {
    if ((LEVELS as readonly string[]).includes(row.level)) {
      const level = row.level as LogLevel
      byLevel.set(level, (byLevel.get(level) ?? 0) + row.n)
    }
  }
  const slices = LEVELS.map((level) => ({ level, n: byLevel.get(level) ?? 0 })).filter(
    (s) => s.n > 0,
  )

  if (slices.length === 0) {
    return (
      <p className="flex h-[180px] items-center justify-center text-xs text-white/40">No data</p>
    )
  }

  return (
    <ResponsiveContainer width="100%" height={180}>
      <PieChart>
        <Tooltip contentStyle={CHART_TOOLTIP_STYLE} />
        <Pie
          data={slices}
          dataKey="n"
          nameKey="level"
          innerRadius={42}
          outerRadius={72}
          paddingAngle={2}
          isAnimationActive={false}
        >
          {slices.map((slice) => (
            <Cell
              key={slice.level}
              fill={SEVERITY[slice.level].color}
              cursor="pointer"
              onClick={() => void setQuery({ level: slice.level })}
            />
          ))}
        </Pie>
      </PieChart>
    </ResponsiveContainer>
  )
}
