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
  /** The chart / panel body. */
  children: ReactNode
  /** Extra classes for the card. */
  className?: string
}

/**
 * Glass panel wrapper with a mono title and an optional header action.
 *
 * @param props - {@link ChartCardProps}.
 * @returns The titled chart card.
 */
export function ChartCard({ title, action, children, className }: ChartCardProps) {
  return (
    <Card className={cn('flex flex-col', className)}>
      <CardHeader className="flex flex-row items-center justify-between gap-2 pb-2">
        <CardTitle className="font-mono text-sm font-medium text-white/70">{title}</CardTitle>
        {action}
      </CardHeader>
      <CardContent className="flex-1">{children}</CardContent>
    </Card>
  )
}
