/**
 * @fileoverview `useFacets` — facet values + counts for the Explorer rail.
 *
 * Thin `useQuery` wrapper over `GET /logs/facets`. Counts reflect the current
 * filter + time window; the browser never derives them from fetched rows.
 *
 * @module hooks/use-facets
 */

'use client'

import { useQuery } from '@tanstack/react-query'

import { getFacets } from '@/lib/api-client'
import type { FacetField, FacetsResult, LogQuery } from '@/lib/types'

/**
 * Query facet values with counts for the given bounded-dimension fields.
 *
 * @param fields - The fields to facet (e.g. `level`, `service`, `logKey`, `tenantId`).
 * @param query - The active filter; counts reflect it + the time window.
 * @returns The TanStack `useQuery` result mapping each field to its values.
 */
export function useFacets(fields: FacetField[], query: LogQuery) {
  return useQuery<FacetsResult>({
    queryKey: ['facets', fields, query],
    queryFn: () => getFacets(fields, query),
  })
}
