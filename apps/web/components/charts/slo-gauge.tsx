/**
 * @fileoverview SloGauge — 99.9% / 30-day error-budget tile.
 *
 * Renders the remaining error budget as a bar and badges the Google multiwindow
 * multi-burn-rate thresholds (14.4 / 6 / 1). The budget is `1 − consumed`, where
 * `consumed = errorRate / (1 − SLO)`; a badge lights up when the current burn
 * rate exceeds its threshold (`DASHBOARD.md` §11).
 *
 * @module components/charts/slo-gauge
 */

'use client'

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { cn } from '@/lib/utils'

/** Target availability — 99.9% over the 30-day window. */
const SLO_TARGET = 0.999

/** Allowed error fraction = 1 − SLO (the budget denominator). */
const ERROR_BUDGET = 1 - SLO_TARGET

/** Google multiwindow multi-burn-rate alert thresholds. */
const BURN_THRESHOLDS = [14.4, 6, 1] as const

interface SloGaugeProps {
  /** Observed error rate over the window, as a fraction in `[0, 1]`. */
  errorRate: number
}

/**
 * SLO / error-budget tile.
 *
 * @param props - {@link SloGaugeProps}.
 * @returns The SLO budget gauge card.
 */
export function SloGauge({ errorRate }: SloGaugeProps) {
  const burnRate = errorRate / ERROR_BUDGET
  const budgetLeft = Math.max(0, Math.min(1, 1 - burnRate))
  const budgetPct = Math.round(budgetLeft * 100)
  const isDanger = budgetLeft < 0.25

  return (
    <Card className={cn('min-w-48 flex-1', isDanger && 'ring-1 ring-destructive/60')}>
      <CardHeader className="pb-2">
        <CardTitle className="font-mono text-xs font-medium text-white/55">
          SLO 99.9% (30d)
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-2">
        <div className="flex items-baseline gap-2">
          <span
            className={cn('text-2xl font-bold', isDanger ? 'text-destructive' : 'text-foreground')}
          >
            {budgetPct}%
          </span>
          <span className="text-[11px] text-white/40">budget left</span>
        </div>
        <div
          className="h-2 w-full overflow-hidden rounded-full bg-white/10"
          role="progressbar"
          aria-valuenow={budgetPct}
          aria-valuemin={0}
          aria-valuemax={100}
          aria-label="Error budget remaining"
        >
          <div
            className={cn(
              'h-full rounded-full',
              isDanger ? 'bg-destructive' : 'bg-(--color-success)',
            )}
            style={{ width: `${budgetPct}%` }}
          />
        </div>
        <div className="flex gap-1.5">
          {BURN_THRESHOLDS.map((threshold) => {
            const isBreached = burnRate >= threshold
            return (
              <span
                key={threshold}
                title={`${threshold}× burn-rate window`}
                className={cn(
                  'rounded-full border px-1.5 py-0.5 font-mono text-[10px]',
                  isBreached
                    ? 'border-destructive/60 bg-destructive/15 text-destructive'
                    : 'border-(--glass-border) text-white/40',
                )}
              >
                {threshold}×
              </span>
            )
          })}
        </div>
      </CardContent>
    </Card>
  )
}
