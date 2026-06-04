/**
 * @fileoverview PipelineHealth — USE-style saturation of the logging pipeline.
 *
 * Surfaces the library's own fail-soft counters from the `logKey` facet:
 * `LOGGER_DESTINATION_WRITE_FAILED` / `_INIT_FAILED` / `LOGGER_ENTRY_TRUNCATED`.
 * Injecting a fault from the Trigger Center makes these climb (`DASHBOARD.md` §5).
 *
 * @module components/charts/pipeline-health
 */

'use client'

import { RESERVED_LOG_KEYS } from '@bymax-one/nest-logger/shared'

import { useFacets } from '@/hooks/use-facets'
import type { LogQuery } from '@/lib/types'
import { Skeleton } from '@/components/ui/skeleton'

/** The fail-soft logKeys surfaced as saturation stats, with display labels. */
const PIPELINE_KEYS = [
  { key: RESERVED_LOG_KEYS.LOGGER_DESTINATION_WRITE_FAILED, label: 'Write failed' },
  { key: RESERVED_LOG_KEYS.LOGGER_DESTINATION_INIT_FAILED, label: 'Init failed' },
  { key: RESERVED_LOG_KEYS.LOGGER_ENTRY_TRUNCATED, label: 'Entries truncated' },
] as const

interface PipelineHealthProps {
  /** The active filter. */
  query: LogQuery
}

/**
 * Pipeline-health stat row (logger fail-soft counters).
 *
 * @param props - {@link PipelineHealthProps}.
 * @returns The pipeline-health panel.
 */
export function PipelineHealth({ query }: PipelineHealthProps) {
  const { data, isLoading } = useFacets(['logKey'], query)

  if (isLoading) return <Skeleton className="h-16 w-full" />

  const counts = new Map((data?.logKey ?? []).map((v) => [v.value, v.count]))

  return (
    <div className="flex flex-wrap items-center gap-6">
      {PIPELINE_KEYS.map(({ key, label }) => {
        const count = counts.get(key) ?? 0
        return (
          <div key={key} className="flex flex-col">
            <span className="font-mono text-[11px] text-white/45">{label}</span>
            <span
              className={
                count > 0
                  ? 'text-lg font-bold text-destructive'
                  : 'text-lg font-bold text-(--color-success)'
              }
            >
              {count}
            </span>
            <span className="font-mono text-[10px] text-white/30">{key}</span>
          </div>
        )
      })}
      <p className="ml-auto max-w-xs text-[11px] text-white/30">
        Write-lag readouts require per-destination latency metrics (not emitted by the library
        today); the fail-soft counters above are the live saturation signal.
      </p>
    </div>
  )
}
