/**
 * @fileoverview ChartCard — a glass panel wrapper for a titled chart.
 *
 * Centralizes the glass card + mono title used by every Overview panel so the
 * individual chart components stay focused on their data + Recharts markup.
 *
 * @module components/charts/chart-card
 */

'use client'

import type { ReactNode } from 'react'

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { cn } from '@/lib/utils'

interface ChartCardProps {
  /** Panel heading (mono). */
  title: string
  /** Optional right-aligned node (e.g. a stat readout). */
  action?: ReactNode
  /**
   * Optional info affordance rendered in the header (typically a
   * `<FeatureInfo id=… />`) that opens a modal explaining the panel.
   */
  info?: ReactNode
  /**
   * Optional legend rendered as a footer row below the chart (typically a
   * `<ChartLegend items=… />`), so a viewer can read what each colour means.
   */
  legend?: ReactNode
  /** The chart / panel body. */
  children: ReactNode
  /** Extra classes for the card. */
  className?: string
  /**
   * Whether the body contains operable controls (e.g. a brushable volume bar).
   * When false (default) the body is exposed to assistive tech as a single labelled
   * image (`role="img"` + the panel title) so a decorative SVG chart gets ONE accessible
   * name instead of a tree of unlabelled groups. When true, the children stay in the
   * accessibility tree so the controls remain operable.
   */
  interactive?: boolean
}

/**
 * Glass panel wrapper with a mono title and an optional header action.
 *
 * @param props - {@link ChartCardProps}.
 * @returns The titled chart card.
 */
export function ChartCard({
  title,
  action,
  info,
  legend,
  children,
  className,
  interactive = false,
}: ChartCardProps) {
  // Decorative charts become a single labelled image; interactive ones keep their tree.
  const a11y = interactive ? {} : { role: 'img' as const, 'aria-label': `${title} chart` }
  const hasHeaderRight = action !== undefined || info !== undefined
  return (
    <Card className={cn('flex flex-col', className)}>
      <CardHeader className="flex flex-row items-center justify-between gap-2 pb-2">
        <CardTitle className="font-mono text-sm font-medium text-white/70">{title}</CardTitle>
        {hasHeaderRight && (
          <div className="flex items-center gap-0.5">
            {action}
            {info}
          </div>
        )}
      </CardHeader>
      <CardContent className={cn('flex-1', legend !== undefined && 'pb-3')} {...a11y}>
        {children}
      </CardContent>
      {legend !== undefined && <div className="border-t border-white/5 px-6 py-3">{legend}</div>}
    </Card>
  )
}
