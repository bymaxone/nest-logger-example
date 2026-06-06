/**
 * @fileoverview Component tests for the Explorer log-table column definitions.
 *
 * Each TanStack `ColumnDef.cell` renderer is mounted in isolation by wrapping its
 * factory output in a tiny `<table>` host, then the REAL rendered output is queried
 * via Testing Library. This drives every formatting branch: the time formatter
 * (valid ISO vs. unparseable string, zero-padding), the severity cell (colour +
 * icon + label via `lib/severity`), the logKey badge, the service/message spans,
 * and `shortId` (empty / null / undefined / short / long correlation ids).
 *
 * @module components/explorer/columns.test
 */
import { afterEach, describe, expect, it } from 'vitest'
import { cleanup, render, screen } from '@testing-library/react'
import { flexRender, getCoreRowModel, useReactTable } from '@tanstack/react-table'
import type { ReactElement } from 'react'

import type { LogRow } from '@/lib/types'
import { getSeverity } from '@/lib/severity'
import { logColumns } from './columns'

/** A baseline row; per-test overrides exercise one formatting branch at a time. */
function makeRow(overrides: Partial<LogRow> = {}): LogRow {
  return {
    id: 'r1',
    time: '2026-06-05T01:02:03.045Z',
    level: 'error',
    logKey: 'AUTH_LOGIN_FAILED',
    message: 'login failed for user',
    service: 'api',
    requestId: 'req-1234567890',
    traceId: 'trace-abcdefghij',
    ...overrides,
  }
}

/**
 * Render every column's `cell` renderer for a single row inside a real TanStack
 * table host, so each `cell` factory receives a genuine cell context.
 */
function RowCells({ row }: { row: LogRow }): ReactElement {
  const table = useReactTable({
    data: [row],
    columns: logColumns,
    getCoreRowModel: getCoreRowModel(),
  })
  const tableRow = table.getRowModel().rows[0]
  return (
    <table>
      <tbody>
        <tr>
          {tableRow?.getVisibleCells().map((cell) => (
            <td key={cell.id} data-column={cell.column.id}>
              {flexRender(cell.column.columnDef.cell, cell.getContext())}
            </td>
          ))}
        </tr>
      </tbody>
    </table>
  )
}

afterEach(() => {
  cleanup()
})

describe('logColumns', () => {
  /** The column set must expose exactly the seven Explorer fields, in order. */
  it('defines the expected ordered columns', () => {
    expect(logColumns.map((c) => ('accessorKey' in c ? c.accessorKey : undefined))).toEqual([
      'time',
      'level',
      'logKey',
      'service',
      'message',
      'requestId',
      'traceId',
    ])
  })

  /** A valid ISO time renders as zero-padded `HH:MM:SS.mmm` (local-clock parts). */
  it('formats a valid ISO timestamp as padded HH:MM:SS.mmm', () => {
    const iso = '2026-06-05T01:02:03.045Z'
    const d = new Date(iso)
    const pad = (n: number, w = 2): string => String(n).padStart(w, '0')
    const expected = `${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}.${pad(
      d.getMilliseconds(),
      3,
    )}`
    render(<RowCells row={makeRow({ time: iso })} />)
    expect(screen.getByText(expected)).toBeInTheDocument()
  })

  /** An unparseable timestamp falls back to the raw string (the NaN guard). */
  it('falls back to the raw value for an unparseable timestamp', () => {
    render(<RowCells row={makeRow({ time: 'not-a-date' })} />)
    expect(screen.getByText('not-a-date')).toBeInTheDocument()
  })

  /** The level cell renders the severity label + icon (never colour alone). */
  it('renders the severity label and an icon for the level cell', () => {
    render(<RowCells row={makeRow({ level: 'fatal' })} />)
    const meta = getSeverity('fatal')
    const labelEl = screen.getByText(meta.label)
    expect(labelEl).toBeInTheDocument()
    // The lucide icon is an aria-hidden <svg> sibling inside the same cell.
    expect(labelEl.querySelector('svg')).not.toBeNull()
  })

  /** The logKey renders inside an outline badge so it reads as a token. */
  it('renders the logKey as a badge', () => {
    render(<RowCells row={makeRow({ logKey: 'ORDER_PLACED' })} />)
    expect(screen.getByText('ORDER_PLACED')).toBeInTheDocument()
  })

  /** The service and message values render their raw text. */
  it('renders the service and message text', () => {
    render(<RowCells row={makeRow({ service: 'billing', message: 'charge captured' })} />)
    expect(screen.getByText('billing')).toBeInTheDocument()
    expect(screen.getByText('charge captured')).toBeInTheDocument()
  })

  /** A long correlation id is shortened to its last 8 chars with an ellipsis. */
  it('shortens long request and trace ids', () => {
    render(<RowCells row={makeRow({ requestId: 'req-1234567890', traceId: 'trace-abcdefghij' })} />)
    // Last 8 chars of `req-1234567890` and `trace-abcdefghij`.
    expect(screen.getByText('…34567890')).toBeInTheDocument()
    expect(screen.getByText('…cdefghij')).toBeInTheDocument()
  })

  /** An id of 8 chars or fewer is shown verbatim (no ellipsis applied). */
  it('keeps a short id unchanged', () => {
    render(<RowCells row={makeRow({ requestId: 'short', traceId: '12345678' })} />)
    expect(screen.getByText('short')).toBeInTheDocument()
    expect(screen.getByText('12345678')).toBeInTheDocument()
  })

  /**
   * A null id and an absent (undefined) id both render the em-dash placeholder —
   * covering the `=== null` and `=== undefined` operands of the shortId guard.
   */
  it('renders an em-dash for a null id and an undefined id', () => {
    // `requestId` is explicitly null; `traceId` is omitted so it reads undefined.
    const { traceId: _omit, ...rest } = makeRow({ requestId: null })
    void _omit
    render(<RowCells row={rest} />)
    expect(screen.getAllByText('—')).toHaveLength(2)
  })

  /** An empty-string id also renders the placeholder (the `=== ''` branch). */
  it('renders an em-dash for an empty-string id', () => {
    render(<RowCells row={makeRow({ requestId: '', traceId: '' })} />)
    expect(screen.getAllByText('—')).toHaveLength(2)
  })
})
