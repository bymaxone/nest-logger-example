/**
 * @fileoverview Column definitions for the Explorer log table.
 *
 * TanStack Table v8 `ColumnDef<LogRow>[]`. Severity is colour + icon + text
 * (reusing `lib/severity.ts`, never colour alone — `DASHBOARD.md` §2 principle 7);
 * `logKey` renders as a mono badge; correlation ids are shortened for density.
 *
 * @module components/explorer/columns
 */

'use client'

import type { ColumnDef } from '@tanstack/react-table'

import type { LogRow } from '@/lib/types'
import { getSeverity } from '@/lib/severity'
import { Badge } from '@/components/ui/badge'

/** Shorten a long correlation id to its last 8 characters for table density. */
function shortId(id: string | null | undefined): string {
  if (id === null || id === undefined || id === '') return '—'
  return id.length <= 8 ? id : `…${id.slice(-8)}`
}

/** Format a row timestamp as `HH:MM:SS.mmm`. */
function formatTime(iso: string): string {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return iso
  const pad = (n: number, w = 2): string => String(n).padStart(w, '0')
  return `${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}.${pad(d.getMilliseconds(), 3)}`
}

/** Column definitions for the virtualized log table. */
export const logColumns: ColumnDef<LogRow>[] = [
  {
    accessorKey: 'time',
    header: 'Time',
    size: 130,
    cell: ({ row }) => (
      <span className="font-mono text-[11px] tabular-nums text-white/55">
        {formatTime(row.original.time)}
      </span>
    ),
  },
  {
    accessorKey: 'level',
    header: 'Level',
    size: 96,
    cell: ({ row }) => {
      const meta = getSeverity(row.original.level)
      const Icon = meta.icon
      return (
        <span
          className="flex items-center gap-1.5 font-mono text-[11px]"
          style={{ color: meta.color }}
        >
          <Icon className="h-3 w-3 shrink-0" aria-hidden="true" />
          {meta.label}
        </span>
      )
    },
  },
  {
    accessorKey: 'logKey',
    header: 'Log key',
    size: 220,
    cell: ({ row }) => (
      <Badge variant="outline" className="max-w-full truncate font-mono text-[10px]">
        {row.original.logKey}
      </Badge>
    ),
  },
  {
    accessorKey: 'service',
    header: 'Service',
    size: 90,
    cell: ({ row }) => (
      <span className="font-mono text-[11px] text-white/55">{row.original.service}</span>
    ),
  },
  {
    accessorKey: 'message',
    header: 'Message',
    size: 420,
    cell: ({ row }) => (
      <span className="truncate text-xs text-white/80">{row.original.message}</span>
    ),
  },
  {
    accessorKey: 'requestId',
    header: 'Request',
    size: 96,
    cell: ({ row }) => (
      <span className="font-mono text-[11px] text-white/40">{shortId(row.original.requestId)}</span>
    ),
  },
  {
    accessorKey: 'traceId',
    header: 'Trace',
    size: 96,
    cell: ({ row }) => (
      <span className="font-mono text-[11px] text-secondary">{shortId(row.original.traceId)}</span>
    ),
  },
]
