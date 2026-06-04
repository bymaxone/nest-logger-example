/**
 * @fileoverview HealthStrip — the Overview's four golden signals + SLO tile.
 *
 * Each tile reads a server-side aggregate (`/logs/aggregate`); the browser never
 * crunches raw rows. Loading shows skeleton tiles (never spinners); an empty
 * window shows an action-oriented prompt to fire a log (`DASHBOARD.md` §2).
 *
 * @module components/charts/health-strip
 */

'use client'

import Link from 'next/link'

import { useAggregate } from '@/hooks/use-aggregate'
import type { LogQuery } from '@/lib/types'
import {
  formatCount,
  formatMs,
  meanErrorRate,
  meanOf,
  pivotVolume,
  statusTotals,
  sumLevels,
  trendPct,
} from '@/lib/metrics'
import { Card, CardContent, CardHeader } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import { StatTile } from './stat-tile'
import { SloGauge } from './slo-gauge'

/** Error-rate threshold above which the Errors tile turns red (1%). */
const ERROR_RATE_THRESHOLD = 0.01

/** Default window length (minutes) when the filter omits an explicit range. */
const DEFAULT_WINDOW_MINUTES = 60

interface HealthStripProps {
  /** The active filter driving every tile. */
  query: LogQuery
}

/**
 * Compute the window length in minutes from the filter (defaulting to 1h).
 *
 * @param query - The active filter.
 * @returns The window length in minutes (at least 1).
 */
function windowMinutes(query: LogQuery): number {
  if (query.from === undefined || query.to === undefined) return DEFAULT_WINDOW_MINUTES
  const ms = new Date(query.to).getTime() - new Date(query.from).getTime()
  return Math.max(1, ms / 60_000)
}

/**
 * The Overview health strip: Traffic, Errors, Latency, Fatal+Error, and SLO.
 *
 * @param props - {@link HealthStripProps}.
 * @returns The five-tile responsive health row.
 */
export function HealthStrip({ query }: HealthStripProps) {
  const volume = useAggregate('volume', query)
  const errorRate = useAggregate('errorRate', query)
  const latency = useAggregate('latency', query)
  const statusMix = useAggregate('statusMix', query)

  const isLoading =
    volume.isLoading || errorRate.isLoading || latency.isLoading || statusMix.isLoading
  const isError = volume.isError || errorRate.isError || latency.isError || statusMix.isError

  if (isError) {
    return (
      <Card>
        <CardContent className="p-6 text-sm text-destructive">
          Failed to load metrics. Check that the API is reachable, then retry.
        </CardContent>
      </Card>
    )
  }

  if (isLoading) {
    return (
      <div className="flex flex-wrap gap-4">
        {Array.from({ length: 5 }, (_, i) => (
          <Card key={i} className="min-w-40 flex-1">
            <CardHeader className="pb-2">
              <Skeleton className="h-3 w-20" />
            </CardHeader>
            <CardContent className="space-y-2">
              <Skeleton className="h-7 w-24" />
              <Skeleton className="h-9 w-full" />
            </CardContent>
          </Card>
        ))}
      </div>
    )
  }

  const volumeRows = volume.data ?? []
  const errorRows = errorRate.data ?? []
  const latencyRows = latency.data ?? []
  const totals = statusTotals(statusMix.data ?? [])

  const totalRequests = totals.reduce((acc, t) => acc + t.total, 0)
  const totalVolume = volumeRows.reduce((acc, r) => acc + r.n, 0)

  if (totalRequests === 0 && totalVolume === 0) {
    return (
      <Card>
        <CardContent className="flex flex-col items-start gap-3 p-6 text-sm text-muted-foreground">
          <p>No logs in this window yet.</p>
          <Link href="/trigger" className="font-mono text-brand-500 hover:underline">
            Fire one from the Trigger Center →
          </Link>
        </CardContent>
      </Card>
    )
  }

  const reqPerMin = totalRequests / windowMinutes(query)
  const trafficSeries = totals.map((t) => t.total)

  const errRate = meanErrorRate(errorRows)
  const errorSeries = errorRows.map((r) => (r.errorRate ?? 0) * 100)

  const p95 = meanOf(latencyRows.map((r) => r.p95))
  const latencySeries = latencyRows.map((r) => r.p95 ?? 0)

  const fatalError = sumLevels(volumeRows, ['error', 'fatal'])
  const fatalErrorSeries = pivotVolume(volumeRows).map((p) => p.error + p.fatal)

  return (
    <div className="flex flex-wrap gap-4">
      <StatTile
        title="TRAFFIC"
        value={formatCount(reqPerMin)}
        hint="req/min"
        series={trafficSeries}
        delta={trendPct(trafficSeries)}
      />
      <StatTile
        title="ERRORS"
        value={`${(errRate * 100).toFixed(2)}%`}
        series={errorSeries}
        delta={trendPct(errorSeries)}
        danger={errRate > ERROR_RATE_THRESHOLD}
      />
      <StatTile
        title="LATENCY"
        value={formatMs(p95)}
        hint="~p95"
        series={latencySeries}
        delta={trendPct(latencySeries)}
      />
      <StatTile
        title="FATAL+ERROR"
        value={formatCount(fatalError)}
        series={fatalErrorSeries}
        delta={trendPct(fatalErrorSeries)}
        danger={fatalError > 0}
      />
      <SloGauge errorRate={errRate} />
    </div>
  )
}
