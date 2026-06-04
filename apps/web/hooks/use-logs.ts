/**
 * @fileoverview `useLogs` — keyset/infinite log query for the Explorer table.
 *
 * Wraps TanStack Query's `useInfiniteQuery`; `getNextPageParam` reads the opaque
 * keyset `nextCursor`. A `410 Gone` (stale cursor) removes the cached query so
 * the next render restarts pagination from the top.
 *
 * @module hooks/use-logs
 */

'use client'

import { useEffect } from 'react'
import { useInfiniteQuery, useQueryClient } from '@tanstack/react-query'

import { getLogs } from '@/lib/api-client'
import { ApiError, type LogPage, type LogQuery } from '@/lib/types'

/** HTTP status the API returns for a stale/invalid keyset cursor. */
const STALE_CURSOR_STATUS = 410

/**
 * Infinite keyset query over `GET /logs`.
 *
 * @param query - The active filter; changing it starts a fresh keyset scan.
 * @returns The TanStack `useInfiniteQuery` result (pages of {@link LogPage}).
 */
export function useLogs(query: LogQuery) {
  const client = useQueryClient()

  const result = useInfiniteQuery({
    queryKey: ['logs', query],
    queryFn: ({ pageParam }: { pageParam: string | undefined }): Promise<LogPage> =>
      getLogs(pageParam !== undefined ? { ...query, cursor: pageParam } : query),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (last: LogPage): string | undefined => last.nextCursor ?? undefined,
  })

  // A stale cursor (410) invalidates the whole keyset chain — drop it so the
  // next access restarts cleanly from the newest page.
  const { error } = result
  useEffect(() => {
    if (error instanceof ApiError && error.status === STALE_CURSOR_STATUS) {
      client.removeQueries({ queryKey: ['logs', query] })
    }
  }, [error, client, query])

  return result
}
