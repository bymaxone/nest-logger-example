/**
 * @fileoverview LatencyHeatmap — per-bucket latency intensity + slow-request stat.
 *
 * The aggregate API exposes latency as p50/p95/p99 percentiles (not a raw
 * per-request histogram), so this renders a percentile-band heatmap: one column
 * per bucket, three cells (p99/p95/p50) whose intensity scales with magnitude —
 * surfacing where the tail concentrates. The slow-request count comes from the
 * `METHOD_SLOW_EXECUTION` logKey facet (`@LogPerformance` over the threshold).
 *
 * @module components/charts/latency-heatmap
 */

'use client'

import { useAggregate } from '@/hooks/use-aggregate'
import { useFacets } from '@/hooks/use-facets'
import type { LogQuery } from '@/lib/types'
import { formatBucket, formatMs } from '@/lib/metrics'
import { Skeleton } from '@/components/ui/skeleton'

/** logKey emitted by the library when a `@LogPerformance` method exceeds its threshold. */
const SLOW_EXECUTION_KEY = 'METHOD_SLOW_EXECUTION'

/** Percentile rows rendered top (highest) to bottom. */
const ROWS = [
  { key: 'p99', label: 'p99' },
  { key: 'p95', label: 'p95' },
  { key: 'p50', label: 'p50' },
] as const

interface LatencyHeatmapProps {
  /** The active filter. */
  query: LogQuery
}

/**
 * Map a latency value to an amber→red intensity cell colour.
 *
 * @param value - The percentile value (ms), or null.
 * @param max - The maximum value across the grid (for normalization).
 * @returns A CSS background colour.
 */
function heatColor(value: number | null, max: number): string {
  if (value === null || max === 0) return 'rgba(255,255,255,0.04)'
  const intensity = Math.min(1, value / max)
  return `rgba(239,68,68,${(0.12 + intensity * 0.78).toFixed(3)})`
}

/**
 * Per-bucket latency percentile-band heatmap with a slow-request stat.
 *
 * @param props - {@link LatencyHeatmapProps}.
 * @returns The latency heatmap panel.
 */
export function LatencyHeatmap({ query }: LatencyHeatmapProps) {
  const latency = useAggregate('latency', query)
  const facets = useFacets(['logKey'], query)

  if (latency.isLoading) return <Skeleton className="h-[150px] w-full" />

  const buckets = latency.data ?? []
  const max = buckets.reduce((m, b) => Math.max(m, b.p99 ?? 0), 0)
  const slowCount = facets.data?.logKey?.find((v) => v.value === SLOW_EXECUTION_KEY)?.count ?? 0

  return (
    <div className="space-y-2">
      <p className="font-mono text-xs text-white/55">
        Slow reqs (METHOD_SLOW_EXECUTION): <span className="text-amber-400">{slowCount}</span>
      </p>
      {buckets.length === 0 ? (
        <p className="py-8 text-center text-xs text-white/40">No latency samples in this window.</p>
      ) : (
        <div className="space-y-1">
          {ROWS.map((row) => (
            <div key={row.key} className="flex items-center gap-2">
              <span className="w-7 shrink-0 font-mono text-[10px] text-white/40">{row.label}</span>
              <div className="flex h-4 flex-1 gap-px">
                {buckets.map((b) => {
                  const value = b[row.key]
                  return (
                    <div
                      key={`${row.key}-${b.bucket}`}
                      className="flex-1 rounded-[1px]"
                      style={{ background: heatColor(value, max) }}
                      title={`${formatBucket(b.bucket)} · ${row.label} ${value === null ? '—' : formatMs(value)}`}
                    />
                  )
                })}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
