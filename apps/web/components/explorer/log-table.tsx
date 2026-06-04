/**
 * @fileoverview LogTable — virtualized Explorer data grid.
 *
 * TanStack Table v8 (headless) + TanStack Virtual v3 render 50k+ rows at 60fps:
 * sticky header, newest-first, keyset infinite scroll (older pages load via
 * `fetchNextPage` as the user nears the bottom — never OFFSET). Live SSE rows are
 * appended at the bottom via the `liveRows` prop (driven by the live tail) and
 * highlighted; row click opens the detail drawer.
 *
 * @module components/explorer/log-table
 */

'use client'

import { useRef } from 'react'
import { flexRender, getCoreRowModel, useReactTable } from '@tanstack/react-table'
import { useVirtualizer } from '@tanstack/react-virtual'

import { useLogs } from '@/hooks/use-logs'
import { ApiError, type LogQuery, type LogRow } from '@/lib/types'
import { Skeleton } from '@/components/ui/skeleton'
import { cn } from '@/lib/utils'
import { logColumns } from './columns'

/** Grid template mirroring the column sizes in `columns.tsx` (message flexes). */
const GRID_COLUMNS = '130px 96px 220px 90px minmax(220px,1fr) 96px 96px'

/** Estimated row height (px) for the virtualizer. */
const ROW_HEIGHT = 36

/** Distance (px) from the bottom at which the next (older) page is prefetched. */
const SCROLL_THRESHOLD = 320

interface LogTableProps {
  /** The active filter. */
  query: LogQuery
  /** Called with the clicked row to open the detail drawer. */
  onRowClick: (row: LogRow) => void
  /** Live SSE rows appended at the bottom (oldest→newest) and highlighted. */
  liveRows?: LogRow[]
  /** Ref to the scroll container so the live tail can drive follow-mode. */
  scrollRef?: React.RefObject<HTMLDivElement | null>
}

/**
 * Virtualized, keyset-paginated log table.
 *
 * @param props - {@link LogTableProps}.
 * @returns The Explorer log grid.
 */
export function LogTable({ query, onRowClick, liveRows = [], scrollRef }: LogTableProps) {
  const { data, error, fetchNextPage, hasNextPage, isFetchingNextPage, isLoading } = useLogs(query)

  const historical = (data?.pages ?? []).flatMap((p) => p.data)
  const rows: LogRow[] = liveRows.length > 0 ? [...historical, ...liveRows] : historical
  const historicalCount = historical.length

  const table = useReactTable({
    data: rows,
    columns: logColumns,
    getCoreRowModel: getCoreRowModel(),
  })

  const localRef = useRef<HTMLDivElement | null>(null)
  const parentRef = scrollRef ?? localRef

  const rowVirtualizer = useVirtualizer({
    count: rows.length,
    getScrollElement: () => parentRef.current,
    estimateSize: () => ROW_HEIGHT,
    overscan: 10,
  })

  /** Prefetch the next (older) keyset page when the user nears the bottom. */
  const handleScroll = (e: React.UIEvent<HTMLDivElement>): void => {
    const el = e.currentTarget
    if (
      el.scrollHeight - el.scrollTop - el.clientHeight < SCROLL_THRESHOLD &&
      hasNextPage &&
      !isFetchingNextPage
    ) {
      void fetchNextPage()
    }
  }

  const tableRows = table.getRowModel().rows
  const headerGroups = table.getHeaderGroups()

  return (
    <div className="overflow-hidden rounded-lg border border-(--glass-border)">
      {/* Sticky header */}
      <div
        className="sticky top-0 z-10 grid border-b border-(--glass-border) bg-black/60 px-3 py-2 backdrop-blur-md"
        style={{ gridTemplateColumns: GRID_COLUMNS }}
      >
        {headerGroups[0]?.headers.map((header) => (
          <span
            key={header.id}
            className="font-mono text-[10px] uppercase tracking-wide text-white/40"
          >
            {flexRender(header.column.columnDef.header, header.getContext())}
          </span>
        ))}
      </div>

      {/* Scrollable virtualized body */}
      <div ref={parentRef} onScroll={handleScroll} className="h-[68vh] overflow-auto">
        {error !== null && rows.length === 0 ? (
          <p className="p-8 text-center text-sm text-destructive">
            Failed to load logs{error instanceof ApiError ? ` (${error.status})` : ''}. Check the
            API connection and retry.
          </p>
        ) : isLoading ? (
          <div className="space-y-1 p-3">
            {Array.from({ length: 12 }, (_, i) => (
              <Skeleton key={i} className="h-7 w-full" />
            ))}
          </div>
        ) : rows.length === 0 ? (
          <p className="p-8 text-center text-sm text-muted-foreground">
            No logs match this query. Widen the time range or clear a filter.
          </p>
        ) : (
          <div style={{ height: rowVirtualizer.getTotalSize(), position: 'relative' }}>
            {rowVirtualizer.getVirtualItems().map((virtualRow) => {
              const row = tableRows[virtualRow.index]
              if (row === undefined) return null
              const isLive = virtualRow.index >= historicalCount
              return (
                <button
                  key={row.id}
                  type="button"
                  onClick={() => onRowClick(row.original)}
                  className={cn(
                    'absolute left-0 grid w-full items-center gap-0 border-b border-white/5 px-3 text-left hover:bg-white/5',
                    isLive && 'animate-[pulse_1.2s_ease-in-out_1] bg-brand-500/10',
                  )}
                  style={{
                    gridTemplateColumns: GRID_COLUMNS,
                    height: `${virtualRow.size}px`,
                    transform: `translateY(${virtualRow.start}px)`,
                  }}
                >
                  {row.getVisibleCells().map((cell) => (
                    <span key={cell.id} className="min-w-0 truncate pr-2">
                      {flexRender(cell.column.columnDef.cell, cell.getContext())}
                    </span>
                  ))}
                </button>
              )
            })}
          </div>
        )}
        {isFetchingNextPage && (
          <p className="py-2 text-center font-mono text-[11px] text-white/40">
            Loading older logs…
          </p>
        )}
      </div>
    </div>
  )
}
