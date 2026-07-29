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

import type { ReactNode } from 'react'
import { Bar, BarChart, Rectangle, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import type { BarShapeProps } from 'recharts'

import type { FacetValue } from '@/lib/types'
import { Skeleton } from '@/components/ui/skeleton'
import { CHART_TOOLTIP_STYLE } from './chart-style'

/** Approx. monospace glyph advance at {@link TICK_FONT_SIZE} (Geist Mono ≈ 0.6em). */
const GLYPH_WIDTH = 6
/** Chip label font size, in px. */
const TICK_FONT_SIZE = 10
/** Chip height, in px. */
const TICK_HEIGHT = 16
/** Max glyphs before the label is ellipsised to fit the chip. */
const TICK_MAX_CHARS = 18

/** Clips a facet value (e.g. a logKey) to {@link TICK_MAX_CHARS}, ellipsising overflow. */
function clipKey(value: string): string {
  return value.length > TICK_MAX_CHARS ? `${value.slice(0, TICK_MAX_CHARS - 1)}…` : value
}

/**
 * Chip-styled category tick — renders the facet value as a glass code-chip in SVG,
 * mirroring the HTML `Badge` chips used for logKeys elsewhere so every code reads the
 * same. Recharts clones this element with `{ x, y, payload }` for each category tick.
 *
 * @returns An SVG group: a rounded chip rect plus the mono, ellipsised label.
 */
function ChipTick({
  x = 0,
  y = 0,
  payload,
}: {
  x?: number
  y?: number
  payload?: { value: string }
}) {
  const label = clipKey(String(payload?.value ?? ''))
  const width = label.length * GLYPH_WIDTH + 12
  return (
    <g transform={`translate(${x - width - 4}, ${y - TICK_HEIGHT / 2})`}>
      <rect
        width={width}
        height={TICK_HEIGHT}
        rx={6}
        fill="rgba(255,255,255,0.03)"
        stroke="rgba(255,255,255,0.12)"
      />
      <text
        x={width / 2}
        y={TICK_HEIGHT / 2}
        textAnchor="middle"
        dominantBaseline="central"
        fontFamily="var(--font-mono)"
        fontSize={TICK_FONT_SIZE}
        fill="rgba(255,255,255,0.6)"
      >
        {label}
      </text>
    </g>
  )
}

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
  /** Optional info affordance rendered beside the title. */
  info?: ReactNode
}

/**
 * Reusable horizontal top-N bar chart with click-to-filter.
 *
 * @param props - {@link TopBarProps}.
 * @returns The top-N bar panel.
 */
export function TopBar({
  title,
  rows,
  onPick,
  fill = '#ff6224',
  loading = false,
  info,
}: TopBarProps) {
  return (
    <div className="flex h-full flex-col">
      <div className="mb-2 flex items-center justify-between gap-2">
        <h3 className="font-mono text-sm font-medium text-white/70">{title}</h3>
        {info}
      </div>
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
              width={134}
              tickLine={false}
              axisLine={false}
              tick={<ChipTick />}
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
