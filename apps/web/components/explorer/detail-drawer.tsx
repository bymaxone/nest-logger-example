/**
 * @fileoverview DetailDrawer — four-tab row inspector (Overview/Raw/Context/Trace).
 *
 * Overview lists each field with a "filter for" pivot. Raw JSON renders the
 * full, already-redacted entry (`@uiw/react-json-view`) — redacted fields read
 * `[REDACTED]` verbatim; there is no unmask (the library redacts at source, so
 * raw PII never reached the client). Context fetches the surrounding lines;
 * Trace deep-links to Tempo and pivots the Explorer to the whole trace.
 *
 * @module components/explorer/detail-drawer
 */

'use client'

import JsonView from '@uiw/react-json-view'
import { darkTheme } from '@uiw/react-json-view/dark'
import { useQuery } from '@tanstack/react-query'
import { ExternalLink } from 'lucide-react'

import { getContext } from '@/lib/api-client'
import { useLogQuery, type LogQueryState } from '@/lib/filters'
import { getSeverity } from '@/lib/severity'
import type { ContextResult, LogLevel, LogRow } from '@/lib/types'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Button } from '@/components/ui/button'
import { ScrollArea } from '@/components/ui/scroll-area'

/** Grafana base URL for the Tempo "View trace" derived-field deep-link. */
const GRAFANA_URL = process.env.NEXT_PUBLIC_GRAFANA_URL ?? 'http://localhost:3000'

/** Scalar row fields (everything except the nested `payload` / `cursor`). */
type OverviewKey = Exclude<keyof LogRow, 'payload' | 'cursor'>

/** Row fields exposed in the Overview tab, with whether they are filterable. */
const OVERVIEW_FIELDS: ReadonlyArray<{ key: OverviewKey; label: string; filter: boolean }> = [
  { key: 'time', label: 'time', filter: false },
  { key: 'level', label: 'level', filter: true },
  { key: 'logKey', label: 'logKey', filter: true },
  { key: 'service', label: 'service', filter: true },
  { key: 'tenantId', label: 'tenantId', filter: true },
  { key: 'requestId', label: 'requestId', filter: true },
  { key: 'traceId', label: 'traceId', filter: true },
  { key: 'spanId', label: 'spanId', filter: false },
  { key: 'status', label: 'status', filter: false },
  { key: 'durationMs', label: 'durationMs', filter: false },
  { key: 'message', label: 'message', filter: false },
]

/**
 * Build a Grafana Explore deep-link to the Tempo trace.
 *
 * Uses the modern `panes` URL format targeting the provisioned `tempo`
 * datasource. The base URL's scheme is validated before it is placed in an
 * anchor href so a misconfigured `javascript:` value cannot become executable.
 *
 * @param traceId - The trace identifier.
 * @returns A Grafana Explore URL for the trace, or `#` when the base is invalid.
 */
function traceUrl(traceId: string): string {
  let base: URL
  try {
    base = new URL(GRAFANA_URL)
  } catch {
    return '#'
  }
  if (base.protocol !== 'http:' && base.protocol !== 'https:') return '#'
  const panes = {
    trace: {
      datasource: 'tempo',
      queries: [
        {
          refId: 'A',
          datasource: { type: 'tempo', uid: 'tempo' },
          queryType: 'traceql',
          query: traceId,
        },
      ],
      range: { from: 'now-1h', to: 'now' },
    },
  }
  return `${base.origin}/explore?schemaVersion=1&panes=${encodeURIComponent(JSON.stringify(panes))}&orgId=1`
}

/**
 * Apply a "filter for" pivot to the URL state for a given row field.
 *
 * @param setQuery - The nuqs setter from `useLogQuery`.
 * @param key - The row field being pivoted on.
 * @param value - The field's value to filter by.
 */
function applyFieldFilter(
  setQuery: LogQueryState['setQuery'],
  key: OverviewKey,
  value: string,
): void {
  switch (key) {
    case 'level':
      void setQuery({ level: value })
      return
    case 'logKey':
      void setQuery({ logKey: value })
      return
    case 'service':
      void setQuery({ service: value })
      return
    case 'tenantId':
      void setQuery({ tenantId: value })
      return
    case 'requestId':
      void setQuery({ requestId: value })
      return
    case 'traceId':
      void setQuery({ traceId: value })
      return
  }
}

/** Severity icon for a level (colour + icon, accessible). */
function LevelIcon({ level }: { level: LogLevel }) {
  const meta = getSeverity(level)
  const Icon = meta.icon
  return <Icon className="h-4 w-4" style={{ color: meta.color }} aria-hidden="true" />
}

/** Overview tab — every field with a "filter for" pivot. */
function OverviewTab({
  row,
  onFilter,
}: {
  row: LogRow
  onFilter: (key: OverviewKey, value: string) => void
}) {
  return (
    <ScrollArea className="max-h-[60vh] pr-3">
      <dl className="divide-y divide-white/5">
        {OVERVIEW_FIELDS.map(({ key, label, filter }) => {
          const raw = row[key]
          if (raw === null || raw === undefined) return null
          const value = String(raw)
          return (
            <div key={label} className="flex items-center justify-between gap-3 py-1.5">
              <dt className="w-28 shrink-0 font-mono text-[11px] text-white/45">{label}</dt>
              <dd className="min-w-0 flex-1 truncate font-mono text-xs text-white/80">{value}</dd>
              {filter && (
                <button
                  type="button"
                  onClick={() => onFilter(key, value)}
                  className="shrink-0 font-mono text-[10px] text-brand-500 hover:underline"
                >
                  filter for
                </button>
              )}
            </div>
          )
        })}
      </dl>
    </ScrollArea>
  )
}

/** Raw JSON tab — already-redacted entry, no unmask. */
function RawJsonTab({ row }: { row: LogRow }) {
  return (
    <ScrollArea className="max-h-[60vh]">
      <JsonView
        value={row.payload ?? row}
        style={darkTheme}
        collapsed={2}
        displayDataTypes={false}
        enableClipboard
      />
    </ScrollArea>
  )
}

/** Context tab — surrounding lines by requestId / traceId. */
function ContextTab({
  data,
  isLoading,
  rowId,
}: {
  data: ContextResult | undefined
  isLoading: boolean
  rowId: string
}) {
  return (
    <ScrollArea className="max-h-[60vh]">
      {isLoading ? (
        <p className="py-6 text-center text-xs text-white/40">Loading context…</p>
      ) : data == null ? (
        <p className="py-6 text-center text-xs text-white/40">No correlation id on this row.</p>
      ) : (
        <div className="space-y-0.5 font-mono text-[11px]">
          {[...data.before, ...(data.match ? [data.match] : []), ...data.after].map((line) => (
            <div
              key={line.id}
              className={
                line.id === rowId
                  ? 'rounded bg-brand-500/15 px-2 py-0.5'
                  : 'px-2 py-0.5 text-white/55'
              }
            >
              <span style={{ color: getSeverity(line.level).color }}>{line.level}</span>{' '}
              <span className="text-white/40">{line.logKey}</span> {line.message}
            </div>
          ))}
        </div>
      )}
    </ScrollArea>
  )
}

/** Trace tab — Tempo deep-link + cross-service pivot. */
function TraceTab({ row, onPivot }: { row: LogRow; onPivot: () => void }) {
  const hasTrace = row.traceId != null && row.traceId !== ''
  return (
    <div className="space-y-3 text-xs">
      <div className="flex items-center justify-between">
        <span className="font-mono text-white/45">traceId</span>
        <span className="font-mono text-secondary">{row.traceId ?? '—'}</span>
      </div>
      <div className="flex items-center justify-between">
        <span className="font-mono text-white/45">spanId</span>
        <span className="font-mono text-white/70">{row.spanId ?? '—'}</span>
      </div>
      {hasTrace ? (
        <div className="flex flex-wrap gap-2 pt-2">
          <Button asChild size="sm" variant="outline">
            <a href={traceUrl(row.traceId!)} target="_blank" rel="noopener noreferrer">
              <ExternalLink className="h-3.5 w-3.5" /> View trace
            </a>
          </Button>
          <Button size="sm" variant="outline" onClick={onPivot}>
            All logs for this trace
          </Button>
        </div>
      ) : (
        <p className="text-white/40">No trace context on this row.</p>
      )}
    </div>
  )
}

interface DetailDrawerProps {
  /** The selected row, or null when the drawer is closed. */
  row: LogRow | null
  /** Whether the drawer is open. */
  open: boolean
  /** Open-state change handler. */
  onOpenChange: (open: boolean) => void
}

/**
 * Four-tab detail drawer for a log row.
 *
 * @param props - {@link DetailDrawerProps}.
 * @returns The detail drawer dialog.
 */
export function DetailDrawer({ row, open, onOpenChange }: DetailDrawerProps) {
  const { query, setQuery } = useLogQuery()

  // Treat empty strings as absent (|| coalesces '' too) so an empty correlation
  // id never opens a query with a blank requestId/traceId. Counts use API defaults.
  const correlationId = row?.requestId || row?.traceId || null
  const context = useQuery({
    queryKey: ['context', correlationId, query.source],
    enabled: open && correlationId !== null,
    queryFn: () => {
      // `enabled` guarantees a non-null row with a truthy requestId or traceId,
      // so the anchor below is always a defined correlation id.
      const r = row!
      return getContext(r.requestId ? { requestId: r.requestId } : { traceId: r.traceId! }, query)
    },
  })

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl">
        {row !== null && (
          <>
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2 font-mono text-sm">
                <LevelIcon level={row.level} />
                {row.logKey}
              </DialogTitle>
            </DialogHeader>

            <Tabs defaultValue="overview">
              <TabsList>
                <TabsTrigger value="overview">Overview</TabsTrigger>
                <TabsTrigger value="raw">Raw JSON</TabsTrigger>
                <TabsTrigger value="context">Context</TabsTrigger>
                <TabsTrigger value="trace">Trace</TabsTrigger>
              </TabsList>

              <TabsContent value="overview">
                <OverviewTab
                  row={row}
                  onFilter={(key, value) => applyFieldFilter(setQuery, key, value)}
                />
              </TabsContent>
              <TabsContent value="raw">
                <RawJsonTab row={row} />
              </TabsContent>
              <TabsContent value="context">
                <ContextTab data={context.data} isLoading={context.isLoading} rowId={row.id} />
              </TabsContent>
              <TabsContent value="trace">
                <TraceTab
                  row={row}
                  onPivot={() => {
                    // The pivot button only renders when the row has a trace id.
                    void setQuery({ traceId: row.traceId! })
                    onOpenChange(false)
                  }}
                />
              </TabsContent>
            </Tabs>
          </>
        )}
      </DialogContent>
    </Dialog>
  )
}
