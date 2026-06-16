/**
 * @fileoverview OverviewContent — the client body of the Overview page.
 *
 * Reads the global filter (`useLogQuery`) and composes the page top→bottom,
 * general→specific: health strip → brushable volume → RED row → breakdown row →
 * pipeline health. Every panel is fed by `/logs/aggregate` or `/logs/facets`;
 * breakdown panels are click-to-filter, pivoting to the Explorer via the URL.
 *
 * @module components/charts/overview-content
 */

'use client'

import { useMemo } from 'react'

import { useLogQuery } from '@/lib/filters'
import { useFacets } from '@/hooks/use-facets'
import type { FacetField, FacetValue } from '@/lib/types'
import { Card, CardContent } from '@/components/ui/card'
import { FeatureInfo } from '@/components/common/feature-info'
import { ERROR_RATE_SERIES, LATENCY_SERIES, LEVEL_SERIES, STATUS_SERIES } from '@/lib/chart-series'
import { ChartCard } from './chart-card'
import { ChartLegend } from './chart-legend'
import { HealthStrip } from './health-strip'
import { VolumeBar } from './volume-bar'
import { RequestsLine } from './requests-line'
import { ErrorRateLine } from './error-rate-line'
import { LatencyLines } from './latency-lines'
import { LatencyHeatmap } from './latency-heatmap'
import { LevelDonut } from './level-donut'
import { TopBar } from './top-bar'
import { StatusMix } from './status-mix'
import { PipelineHealth } from './pipeline-health'

/** Maximum named rows before the remainder is rolled into an "other" bar. */
const TOP_N = 5

/** Bounded facet fields fetched for the breakdown row (stable reference). */
const BREAKDOWN_FACETS: FacetField[] = ['logKey', 'tenantId']

/** Facet field for the error-scoped top-errors panel (stable reference). */
const ERROR_FACETS: FacetField[] = ['logKey']

/**
 * Collapse facet rows beyond the top-N into a single "other" bucket so a
 * high-cardinality dimension stays bounded in the chart.
 *
 * @param rows - Facet rows sorted by count desc.
 * @param n - How many named rows to keep.
 * @returns The top-N rows plus an aggregated "other" row when applicable.
 */
function rollupOther(rows: FacetValue[], n: number): FacetValue[] {
  if (rows.length <= n) return rows
  const top = rows.slice(0, n)
  const otherCount = rows.slice(n).reduce((acc, r) => acc + r.count, 0)
  return otherCount > 0 ? [...top, { value: 'other', count: otherCount }] : top
}

/**
 * The Overview page body.
 *
 * @returns The composed Overview dashboard.
 */
export function OverviewContent() {
  const { query, setQuery } = useLogQuery()

  const errorQuery = useMemo(() => ({ ...query, level: { gte: 'error' as const } }), [query])
  const facets = useFacets(BREAKDOWN_FACETS, query)
  const errorFacets = useFacets(ERROR_FACETS, errorQuery)

  const topLogKeys = facets.data?.logKey ?? []
  const topTenants = rollupOther(facets.data?.tenantId ?? [], TOP_N)
  const topErrors = errorFacets.data?.logKey ?? []

  return (
    <div className="space-y-6">
      <HealthStrip query={query} />

      <ChartCard
        title="Log volume — drag the brush to set the time range"
        interactive
        info={<FeatureInfo id="logVolume" />}
        legend={<ChartLegend items={LEVEL_SERIES} />}
      >
        <VolumeBar query={query} onBrush={(from, to) => void setQuery({ from, to, range: '' })} />
      </ChartCard>

      {/* RED row: Rate + Errors (left), Duration + heatmap (right). */}
      <div className="grid gap-4 lg:grid-cols-2">
        <div className="space-y-4">
          <ChartCard title="Requests / min (RED — Rate)" info={<FeatureInfo id="requests" />}>
            <RequestsLine query={query} />
          </ChartCard>
          <ChartCard
            title="Error rate % — 4xx / 5xx (RED — Errors)"
            info={<FeatureInfo id="errorRate" />}
            legend={<ChartLegend items={ERROR_RATE_SERIES} />}
          >
            <ErrorRateLine query={query} />
          </ChartCard>
        </div>
        <div className="space-y-4">
          <ChartCard
            title="Latency p50 / p95 / p99 (RED — Duration)"
            info={<FeatureInfo id="latencyDuration" />}
            legend={<ChartLegend items={LATENCY_SERIES} />}
          >
            <LatencyLines query={query} />
          </ChartCard>
          <ChartCard title="Latency heatmap" info={<FeatureInfo id="latencyHeatmap" />}>
            <LatencyHeatmap query={query} />
          </ChartCard>
        </div>
      </div>

      {/* Breakdown row: bounded dimensions, each click-to-filter. */}
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-5">
        <ChartCard
          title="Levels"
          info={<FeatureInfo id="levels" />}
          legend={<ChartLegend items={LEVEL_SERIES} />}
        >
          <LevelDonut />
        </ChartCard>
        <Card>
          <CardContent className="pt-6">
            <TopBar
              title="Top logKeys"
              rows={topLogKeys}
              loading={facets.isLoading}
              onPick={(value) => void setQuery({ logKey: value })}
              info={<FeatureInfo id="topLogKeys" />}
            />
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <TopBar
              title="Top errors"
              rows={topErrors}
              fill="#ef4444"
              loading={errorFacets.isLoading}
              onPick={(value) => void setQuery({ logKey: value, level: '>=error' })}
              info={<FeatureInfo id="topErrors" />}
            />
          </CardContent>
        </Card>
        <ChartCard
          title="Status mix"
          info={<FeatureInfo id="statusMix" />}
          legend={<ChartLegend items={STATUS_SERIES} />}
        >
          <StatusMix query={query} />
        </ChartCard>
        <Card>
          <CardContent className="pt-6">
            <TopBar
              title="Top tenants"
              rows={topTenants}
              fill="#60a5fa"
              loading={facets.isLoading}
              onPick={(value) =>
                value !== 'other' ? void setQuery({ tenantId: value }) : undefined
              }
              info={<FeatureInfo id="topTenants" />}
            />
          </CardContent>
        </Card>
      </div>

      <ChartCard
        title="Pipeline health (logging fail-soft saturation)"
        info={<FeatureInfo id="pipelineHealth" />}
      >
        <PipelineHealth query={query} />
      </ChartCard>
    </div>
  )
}
