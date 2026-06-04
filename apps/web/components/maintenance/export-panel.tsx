/**
 * @fileoverview ExportPanel — JSON/CSV export of the current filtered result set.
 *
 * Reuses the Explorer's exact `LogQuery` (filters + window + source + the active
 * `tenantId` RBAC restriction) and downloads via `GET /logs/export`. The server
 * enforces a 100k-row hard cap and signals `X-Export-Truncated`; this panel
 * surfaces that as a banner. Export is gated to operator/admin (viewers see it
 * disabled) — the gate is cosmetic; the server is the real authority
 * (`DASHBOARD.md` §10).
 *
 * @module components/maintenance/export-panel
 */

'use client'

import { useState } from 'react'
import { Download } from 'lucide-react'
import { toast } from 'sonner'

import { useLogQuery } from '@/lib/filters'
import { exportLogs } from '@/lib/maintenance-api'
import { ScopedDemoCallout } from '@/components/common/scoped-demo-callout'
import { Button } from '@/components/ui/button'

/** Fixed CSV column order (matches the server's export service). */
const CSV_COLUMNS = 'time, level, logKey, service, requestId, traceId, tenantId, msg'

/** The server's hard row cap (Datadog's number), surfaced in the copy. */
const ROW_CAP = 100_000

/**
 * Trigger a browser download for a blob under the given filename.
 *
 * `anchor.click()` is synchronous in browsers, so revoking the object URL on the
 * next line is safe — the download has already started.
 *
 * @param blob - The file contents to download.
 * @param filename - The suggested download filename.
 */
function saveBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob)
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = filename
  document.body.appendChild(anchor)
  anchor.click()
  anchor.remove()
  URL.revokeObjectURL(url)
}

/**
 * The Export panel — JSON/CSV download with a truncation banner and role gate.
 *
 * @returns The export controls bound to the active Explorer query + RBAC.
 */
export function ExportPanel() {
  const { query } = useLogQuery()
  const canExport = query.role !== 'viewer'
  const [truncated, setTruncated] = useState(false)
  const [busy, setBusy] = useState<'json' | 'csv' | null>(null)

  const download = async (format: 'json' | 'csv'): Promise<void> => {
    setBusy(format)
    try {
      const result = await exportLogs(format, query)
      setTruncated(result.truncated)
      saveBlob(result.blob, `logs-export.${format}`)
      toast.success(`Exported ${format.toUpperCase()}`)
    } catch (err) {
      toast.error('Export failed', {
        description: err instanceof Error ? err.message : undefined,
      })
    } finally {
      setBusy(null)
    }
  }

  return (
    <div className="space-y-4">
      <p className="text-sm text-white/60">
        Downloads the <strong>current filtered result set</strong> — the Explorer&apos;s exact
        query, scoped to the active tenant. CSV columns:{' '}
        <code className="font-mono text-xs">{CSV_COLUMNS}</code>.
      </p>

      <div className="flex flex-wrap items-center gap-2">
        <Button
          type="button"
          variant="outline"
          disabled={!canExport || busy !== null}
          onClick={() => void download('json')}
        >
          <Download aria-hidden className="h-4 w-4" /> Download JSON
        </Button>
        <Button
          type="button"
          variant="outline"
          disabled={!canExport || busy !== null}
          onClick={() => void download('csv')}
        >
          <Download aria-hidden className="h-4 w-4" /> Download CSV
        </Button>
        {!canExport && <span className="text-[11px] text-white/40">Viewers cannot export.</span>}
      </div>

      {truncated && (
        <p
          role="alert"
          className="rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-xs text-destructive"
        >
          Result set exceeded the {ROW_CAP.toLocaleString()}-row cap — the export was truncated.
          Narrow the time range or filters for a complete download.
        </p>
      )}

      <ScopedDemoCallout feature="exporting filtered logs">
        The {ROW_CAP.toLocaleString()}-row cap mirrors Datadog&apos;s export limit; production tools
        stream larger exports to object storage and email a signed link.
      </ScopedDemoCallout>
    </div>
  )
}
