/**
 * @fileoverview Single source of truth for multi-series chart metadata — the
 * colour, label and unit of every series in a dashboard panel.
 *
 * Both the chart (Recharts `<Line>` / `<Bar>`) and its `<ChartLegend>` read from
 * here, so a series' swatch colour can never drift from the line it labels — the
 * kind of inconsistency that makes a chart unreadable.
 *
 * @module lib/chart-series
 */

import type { LogLevel } from '@bymax-one/nest-logger/shared'

import { SEVERITY } from '@/lib/severity'

/** One chart series: its Recharts `dataKey`, human label, swatch colour, unit. */
export interface ChartSeries {
  /** Recharts `dataKey` the series binds to. */
  key: string
  /** Label shown in the legend and tooltip. */
  label: string
  /** Swatch / stroke / fill colour (hex or CSS token). */
  color: string
  /** Optional unit suffix shown after the label in the legend (e.g. `ms`, `%`). */
  unit?: string
}

/** RED — Duration: latency percentile lines, in milliseconds. */
export const LATENCY_SERIES: readonly ChartSeries[] = [
  { key: 'p50', label: 'p50', color: '#60a5fa', unit: 'ms' },
  { key: 'p95', label: 'p95', color: '#f59e0b', unit: 'ms' },
  { key: 'p99', label: 'p99', color: '#ef4444', unit: 'ms' },
]

/** RED — Errors: client (4xx) vs server (5xx) error rate, as a % of requests. */
export const ERROR_RATE_SERIES: readonly ChartSeries[] = [
  { key: 'rate4xx', label: '4xx', color: '#f59e0b', unit: '%' },
  { key: 'rate5xx', label: '5xx', color: '#ef4444', unit: '%' },
]

/** HTTP status-class mix: count of responses per class, per bucket. */
export const STATUS_SERIES: readonly ChartSeries[] = [
  { key: 's2xx', label: '2xx', color: '#22c55e' },
  { key: 's3xx', label: '3xx', color: '#60a5fa' },
  { key: 's4xx', label: '4xx', color: '#f59e0b' },
  { key: 's5xx', label: '5xx', color: '#ef4444' },
]

/** Log levels for the volume stack / donut, in severity order (base → top). */
export const LEVEL_STACK: readonly LogLevel[] = ['trace', 'debug', 'info', 'warn', 'error', 'fatal']

/**
 * Level series derived from the shared severity tokens, so the legend swatch and
 * the stacked-bar / donut colour come from the exact same source.
 */
export const LEVEL_SERIES: readonly ChartSeries[] = LEVEL_STACK.map((level) => ({
  key: level,
  label: SEVERITY[level].label,
  color: SEVERITY[level].color,
}))
