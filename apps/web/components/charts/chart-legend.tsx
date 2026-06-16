/**
 * @fileoverview ChartLegend — a compact, consistent legend for the dashboard
 * panels.
 *
 * Renders one colour swatch + label (+ optional unit) per series so a viewer can
 * read what each colour means without hovering. Series metadata comes from
 * `lib/chart-series.ts`, shared with the chart itself, so the swatch always
 * matches the line/bar it describes.
 *
 * @module components/charts/chart-legend
 */

'use client'

import type { ChartSeries } from '@/lib/chart-series'
import { cn } from '@/lib/utils'

interface ChartLegendProps {
  /** Series to describe, in render order. */
  items: readonly ChartSeries[]
  /** Optional extra classes. */
  className?: string
}

/**
 * A horizontal, wrapping legend row of colour swatches + labels.
 *
 * @param props - {@link ChartLegendProps}.
 * @returns The legend list, or `null` when there is nothing to describe.
 */
export function ChartLegend({ items, className }: ChartLegendProps) {
  if (items.length === 0) return null
  return (
    <ul
      aria-label="Chart legend"
      className={cn('flex flex-wrap items-center gap-x-3 gap-y-1', className)}
    >
      {items.map((s) => (
        <li
          key={s.key}
          className="flex items-center gap-1.5 text-[11px] leading-none text-white/55"
        >
          <span
            aria-hidden="true"
            className="h-2 w-2 shrink-0 rounded-[2px]"
            style={{ background: s.color }}
          />
          <span className="font-mono">{s.label}</span>
          {s.unit !== undefined ? <span className="text-white/35">{s.unit}</span> : null}
        </li>
      ))}
    </ul>
  )
}
