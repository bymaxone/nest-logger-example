/**
 * @fileoverview Shared Recharts styling constants for the dashboard panels.
 *
 * Keeps the dark-glass tooltip and muted axis-tick styling consistent across
 * every chart without re-declaring the inline objects in each component.
 *
 * @module components/charts/chart-style
 */

import type { CSSProperties } from 'react'

/** Dark-glass tooltip surface matching the design system. */
export const CHART_TOOLTIP_STYLE: CSSProperties = {
  background: 'rgba(20,20,20,0.95)',
  border: '1px solid rgba(255,255,255,0.1)',
  borderRadius: 8,
  fontSize: 12,
}

/** Muted axis tick style (fill + size) for `XAxis` / `YAxis`. */
export const AXIS_TICK = { fill: 'rgba(255,255,255,0.4)', fontSize: 10 } as const

/** Faint cartesian grid stroke. */
export const GRID_STROKE = 'rgba(255,255,255,0.06)'
