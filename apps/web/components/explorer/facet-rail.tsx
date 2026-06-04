/**
 * @fileoverview FacetRail — the Explorer's faceted left rail with live counts.
 *
 * Shows `level` / `service` / `logKey` / `tenantId` value counts from
 * `GET /logs/facets` (server-fed; never derived client-side). Clicking a value
 * adds a positive filter via the URL; Alt/⌥-click clears that field's filter.
 *
 * Note: the read-API has no negation operator, so true "is-not" filtering is not
 * available — Alt-click removes the field filter instead. Adding NOT support to
 * the API would be the follow-up to make exclusion server-enforced.
 *
 * @module components/explorer/facet-rail
 */

'use client'

import { useFacets } from '@/hooks/use-facets'
import { useLogQuery } from '@/lib/filters'
import { getSeverity } from '@/lib/severity'
import type { FacetField, LogLevel } from '@/lib/types'
import { Skeleton } from '@/components/ui/skeleton'
import { ScrollArea } from '@/components/ui/scroll-area'
import { cn } from '@/lib/utils'

/** Faceted fields and their section headings. */
const FACET_FIELDS: ReadonlyArray<{ field: FacetField; label: string }> = [
  { field: 'level', label: 'Level' },
  { field: 'service', label: 'Service' },
  { field: 'logKey', label: 'Log key' },
  { field: 'tenantId', label: 'Tenant' },
]

/** Stable list of faceted field names (avoids a fresh array reference per render). */
const FACET_FIELD_NAMES: FacetField[] = FACET_FIELDS.map((f) => f.field)

/** All log levels (used to colour the `level` facet dots). */
const LEVELS: readonly LogLevel[] = ['fatal', 'error', 'warn', 'info', 'debug', 'trace']

/**
 * Faceted left rail with live value counts and click-to-filter.
 *
 * @returns The facet rail.
 */
export function FacetRail() {
  const { query, setQuery } = useLogQuery()
  const { data, isLoading, isError } = useFacets(FACET_FIELD_NAMES, query)

  /**
   * Apply (or, when `clear` is true, remove) a positive filter for a field.
   * A type-safe switch keeps the nuqs setter strongly typed.
   */
  const apply = (field: FacetField, value: string, clear: boolean): void => {
    const next = clear ? '' : value
    switch (field) {
      case 'level':
        void setQuery({ level: next })
        return
      case 'service':
        void setQuery({ service: next })
        return
      case 'logKey':
        void setQuery({ logKey: next })
        return
      case 'tenantId':
        void setQuery({ tenantId: next })
        return
    }
  }

  /** The currently-active positive value for a field (for highlighting). */
  const activeValue = (field: FacetField): string => {
    if (field === 'level') return typeof query.level === 'string' ? query.level : ''
    return query[field] ?? ''
  }

  return (
    <aside className="w-full">
      <h2 className="mb-3 font-mono text-xs uppercase tracking-wide text-white/40">Facets</h2>
      {isError && <p className="mb-2 text-[11px] text-destructive">Failed to load facet counts.</p>}
      <ScrollArea className="h-[calc(100vh-12rem)] pr-2">
        <div className="space-y-5">
          {FACET_FIELDS.map(({ field, label }) => {
            const values = data?.[field] ?? []
            const active = activeValue(field)
            return (
              <div key={field}>
                <h3 className="mb-1.5 font-mono text-[11px] font-semibold text-white/55">
                  {label}
                </h3>
                {isLoading ? (
                  <div className="space-y-1">
                    <Skeleton className="h-5 w-full" />
                    <Skeleton className="h-5 w-2/3" />
                  </div>
                ) : values.length === 0 ? (
                  <p className="text-[11px] text-white/30">No values</p>
                ) : (
                  <ul className="space-y-0.5">
                    {values.map((v) => {
                      const isActive = active === v.value
                      const isLevel =
                        field === 'level' && (LEVELS as readonly string[]).includes(v.value)
                      return (
                        <li key={v.value}>
                          <button
                            type="button"
                            title={
                              isActive
                                ? 'Alt-click to clear this filter'
                                : `Filter ${label} = ${v.value}`
                            }
                            onClick={(e) => apply(field, v.value, e.altKey && isActive)}
                            className={cn(
                              'flex w-full items-center justify-between gap-2 rounded px-2 py-1 text-left text-xs transition-colors',
                              isActive
                                ? 'bg-brand-500/15 text-brand-500'
                                : 'text-white/65 hover:bg-white/5 hover:text-white/90',
                            )}
                          >
                            <span className="flex min-w-0 items-center gap-1.5">
                              {isLevel && (
                                <span
                                  aria-hidden="true"
                                  className="h-2 w-2 shrink-0 rounded-full"
                                  style={{ background: getSeverity(v.value as LogLevel).color }}
                                />
                              )}
                              <span className="truncate font-mono">{v.value}</span>
                            </span>
                            <span className="shrink-0 tabular-nums text-white/40">{v.count}</span>
                          </button>
                        </li>
                      )
                    })}
                  </ul>
                )}
              </div>
            )
          })}
        </div>
      </ScrollArea>
    </aside>
  )
}
