/**
 * @fileoverview Reusable semantic table primitives styled for the dark design system.
 *
 * Components: `Table`, `TableHeader`, `TableBody`, `TableFooter`,
 * `TableHead`, `TableRow`, `TableCell`, `TableCaption`.
 *
 * @layer components/ui
 */

import * as React from 'react'
import { cn } from '@/lib/utils'

/**
 * Outer scroll wrapper + `<table>` element.
 *
 * @param className - Additional classes merged onto the `<table>`.
 */
const Table = React.forwardRef<HTMLTableElement, React.HTMLAttributes<HTMLTableElement>>(
  ({ className, ...props }, ref) => (
    <div className="relative w-full overflow-auto">
      <table ref={ref} className={cn('w-full caption-bottom text-sm', className)} {...props} />
    </div>
  ),
)
Table.displayName = 'Table'

/**
 * `<thead>` wrapper with a bottom border.
 */
const TableHeader = React.forwardRef<
  HTMLTableSectionElement,
  React.HTMLAttributes<HTMLTableSectionElement>
>(({ className, ...props }, ref) => (
  <thead ref={ref} className={cn('[&_tr]:border-b [&_tr]:border-white/6', className)} {...props} />
))
TableHeader.displayName = 'TableHeader'

/**
 * `<tbody>` wrapper.
 */
const TableBody = React.forwardRef<
  HTMLTableSectionElement,
  React.HTMLAttributes<HTMLTableSectionElement>
>(({ className, ...props }, ref) => (
  <tbody ref={ref} className={cn('[&_tr:last-child]:border-0', className)} {...props} />
))
TableBody.displayName = 'TableBody'

/**
 * `<tfoot>` element.
 */
const TableFooter = React.forwardRef<
  HTMLTableSectionElement,
  React.HTMLAttributes<HTMLTableSectionElement>
>(({ className, ...props }, ref) => (
  <tfoot
    ref={ref}
    className={cn(
      'border-t border-white/6 bg-white/2 font-medium [&>tr]:last:border-b-0',
      className,
    )}
    {...props}
  />
))
TableFooter.displayName = 'TableFooter'

/**
 * `<tr>` element with hover highlight and border-bottom.
 */
const TableRow = React.forwardRef<HTMLTableRowElement, React.HTMLAttributes<HTMLTableRowElement>>(
  ({ className, ...props }, ref) => (
    <tr
      ref={ref}
      className={cn(
        'border-b border-white/6 transition-colors hover:bg-white/2 data-[state=selected]:bg-brand-500/5',
        className,
      )}
      {...props}
    />
  ),
)
TableRow.displayName = 'TableRow'

/**
 * `<th>` header cell with muted uppercase label styling.
 */
const TableHead = React.forwardRef<
  HTMLTableCellElement,
  React.ThHTMLAttributes<HTMLTableCellElement>
>(({ className, ...props }, ref) => (
  <th
    ref={ref}
    className={cn(
      'h-10 px-4 text-left align-middle text-xs font-medium uppercase tracking-wider text-white/40 [&:has([role=checkbox])]:pr-0',
      className,
    )}
    {...props}
  />
))
TableHead.displayName = 'TableHead'

/**
 * `<td>` data cell.
 */
const TableCell = React.forwardRef<
  HTMLTableCellElement,
  React.TdHTMLAttributes<HTMLTableCellElement>
>(({ className, ...props }, ref) => (
  <td
    ref={ref}
    className={cn(
      'px-4 py-3 align-middle text-sm text-white/70 has-[[role=checkbox]]:pr-0',
      className,
    )}
    {...props}
  />
))
TableCell.displayName = 'TableCell'

/**
 * `<caption>` element rendered below the table.
 */
const TableCaption = React.forwardRef<
  HTMLTableCaptionElement,
  React.HTMLAttributes<HTMLTableCaptionElement>
>(({ className, ...props }, ref) => (
  <caption ref={ref} className={cn('mt-4 text-xs text-white/35', className)} {...props} />
))
TableCaption.displayName = 'TableCaption'

export { Table, TableHeader, TableBody, TableFooter, TableHead, TableRow, TableCell, TableCaption }
