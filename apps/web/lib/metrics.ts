/**
 * @fileoverview Pure transforms over `/logs/aggregate` payloads for the charts.
 *
 * The aggregate endpoints return long-format, zero-filled buckets; these helpers
 * reshape them for Recharts (pivot volume by level), derive headline values, and
 * format counts / durations / timestamps. All functions are pure and side-effect
 * free so they are trivially testable.
 *
 * @module lib/metrics
 */

import type { LogLevel } from '@bymax-one/nest-logger/shared'

import type { ErrorRateRow, StatusMixRow, VolumeRow } from './types'

/** All log levels, used to zero-fill a pivoted volume row. */
const ALL_LEVELS: readonly LogLevel[] = ['fatal', 'error', 'warn', 'info', 'debug', 'trace']

/** One pivoted volume bucket: a timestamp plus a count per level. */
export type VolumePoint = { bucket: string } & Record<LogLevel, number>

/**
 * Pivot long-format `{ bucket, level, n }` rows into one wide row per bucket.
 *
 * This is a reshape of already-aggregated, server-side counts — not a
 * client-side aggregation of raw rows.
 *
 * @param rows - Long-format volume rows ordered by bucket.
 * @returns One `{ bucket, fatal, error, … }` point per bucket, in order.
 */
export function pivotVolume(rows: VolumeRow[]): VolumePoint[] {
  const byBucket = new Map<string, VolumePoint>()
  for (const row of rows) {
    let point = byBucket.get(row.bucket)
    if (point === undefined) {
      point = { bucket: row.bucket, fatal: 0, error: 0, warn: 0, info: 0, debug: 0, trace: 0 }
      byBucket.set(row.bucket, point)
    }
    if ((ALL_LEVELS as readonly string[]).includes(row.level)) {
      point[row.level as LogLevel] = row.n
    }
  }
  return [...byBucket.values()]
}

/**
 * Sum the counts of the given levels across every volume bucket.
 *
 * @param rows - Long-format volume rows.
 * @param levels - The levels to include in the total.
 * @returns The combined count.
 */
export function sumLevels(rows: VolumeRow[], levels: readonly LogLevel[]): number {
  return rows.reduce(
    (acc, r) => ((levels as readonly string[]).includes(r.level) ? acc + r.n : acc),
    0,
  )
}

/** A status-mix bucket reduced to its per-class total. */
export interface StatusTotals {
  bucket: string
  total: number
}

/**
 * Reduce status-mix buckets to `{ bucket, total }` (sum of all status classes).
 *
 * The sum equals the count of HTTP rows (those carrying a status) per bucket —
 * the dashboard's traffic proxy.
 *
 * @param rows - Status-mix buckets.
 * @returns Per-bucket totals in order.
 */
export function statusTotals(rows: StatusMixRow[]): StatusTotals[] {
  return rows.map((r) => ({ bucket: r.bucket, total: r.s2xx + r.s3xx + r.s4xx + r.s5xx }))
}

/**
 * Mean of the non-null error-rate buckets, as a fraction in `[0, 1]`.
 *
 * @param rows - Error-rate buckets.
 * @returns The mean error rate, or `0` when there is no data.
 */
export function meanErrorRate(rows: ErrorRateRow[]): number {
  const values = rows.map((r) => r.errorRate).filter((v): v is number => v !== null)
  return values.length === 0 ? 0 : values.reduce((a, b) => a + b, 0) / values.length
}

/**
 * Mean of a numeric series, ignoring `null` entries.
 *
 * @param values - Possibly-null numbers.
 * @returns The mean, or `0` when empty.
 */
export function meanOf(values: Array<number | null>): number {
  const nums = values.filter((v): v is number => v !== null)
  return nums.length === 0 ? 0 : nums.reduce((a, b) => a + b, 0) / nums.length
}

/**
 * Direction-of-travel for a series: percent change of the recent half vs the
 * earlier half. Positive ⇒ rising. Used for the stat-tile Δ badge.
 *
 * @param series - The ordered numeric series.
 * @returns Signed percent change, or `0` when there is too little data.
 */
export function trendPct(series: number[]): number {
  if (series.length < 2) return 0
  const mid = Math.floor(series.length / 2)
  const earlier = series.slice(0, mid)
  const recent = series.slice(mid)
  const avg = (xs: number[]): number =>
    xs.length === 0 ? 0 : xs.reduce((a, b) => a + b, 0) / xs.length
  const a = avg(earlier)
  const b = avg(recent)
  if (a === 0) return b === 0 ? 0 : 100
  return ((b - a) / a) * 100
}

/**
 * Format an integer count compactly (`1234` → `1.2k`, `2_500_000` → `2.5M`).
 *
 * @param n - The count.
 * @returns The compact string.
 */
export function formatCount(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}k`
  return String(Math.round(n))
}

/**
 * Format a millisecond duration (`240` → `240ms`, `1500` → `1.5s`).
 *
 * @param ms - The duration in milliseconds.
 * @returns The human-readable string.
 */
export function formatMs(ms: number): string {
  if (ms >= 1000) return `${(ms / 1000).toFixed(2)}s`
  return `${Math.round(ms)}ms`
}

/**
 * Format an aggregate bucket timestamp as a short `HH:MM` label.
 *
 * @param iso - The bucket's ISO timestamp.
 * @returns The short label, or the raw value when unparseable.
 */
export function formatBucket(iso: string): string {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return iso
  return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
}
