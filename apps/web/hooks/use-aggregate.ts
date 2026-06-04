/**
 * @fileoverview `useAggregate` — server-side chart data for one metric.
 *
 * Thin `useQuery` wrapper over `GET /logs/aggregate`. Charts read this hook only;
 * the browser never aggregates raw rows (`DASHBOARD.md` §11).
 *
 * @module hooks/use-aggregate
 */

'use client'

import { useQuery } from '@tanstack/react-query'

import { getAggregate } from '@/lib/api-client'
import type { AggregateMetric, AggregateRowMap, LogQuery } from '@/lib/types'

/**
 * Query a time-bucketed aggregate metric.
 *
 * @typeParam M - The metric, narrowing the returned row shape.
 * @param metric - One of `volume` / `errorRate` / `latency` / `statusMix`.
 * @param query - The active filter (time window + source).
 * @returns The TanStack `useQuery` result for the metric series.
 */
export function useAggregate<M extends AggregateMetric>(metric: M, query: LogQuery) {
  return useQuery<Array<AggregateRowMap[M]>>({
    queryKey: ['aggregate', metric, query],
    queryFn: () => getAggregate(metric, query),
  })
}
