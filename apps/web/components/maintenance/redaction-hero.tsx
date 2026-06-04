/**
 * @fileoverview RedactionHero — the redaction-at-source proof panel.
 *
 * Shows the same record from Postgres and Loki side by side (fetched by one
 * `requestId`/`traceId`), both already rendering `[REDACTED]` censor values, with
 * a prominent "redacted at source — never stored raw" badge. Unlike after-ingest
 * scrubbing (Datadog SDS / OTel collector), the library redacts in-process via
 * `fast-redact` (97 default paths) before the line leaves the service — so there
 * is nothing to unmask because raw PII never left the process. Links to the
 * active redact-path list from `LogAuditService` (`DASHBOARD.md` §10).
 *
 * @module components/maintenance/redaction-hero
 */

'use client'

import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import JsonView from '@uiw/react-json-view'
import { darkTheme } from '@uiw/react-json-view/dark'
import { ShieldCheck } from 'lucide-react'

import { useLogQuery } from '@/lib/filters'
import { useRbac } from '@/hooks/use-rbac'
import { getActiveRedactPaths, getSameRecord, type SameRecord } from '@/lib/maintenance-api'
import type { LogRow } from '@/lib/types'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog'

/** Render one backend's record (its redacted payload) via the JSON viewer. */
function RecordView({ label, rows }: { label: string; rows: LogRow[] }) {
  const record = rows[0]
  return (
    <div className="space-y-2">
      <span className="text-xs font-medium text-white/55">{label}</span>
      {record ? (
        <div className="overflow-x-auto rounded-lg border border-(--glass-border) bg-black/30 p-3">
          <JsonView
            value={record.payload ?? record}
            style={darkTheme}
            collapsed={2}
            displayDataTypes={false}
            enableClipboard={false}
          />
        </div>
      ) : (
        <p className="rounded-lg border border-(--glass-border) p-3 text-xs text-white/40">
          No matching record in {label}.
        </p>
      )}
    </div>
  )
}

/** Modal listing the active redact paths fetched from the library audit service. */
function RedactPathsDialog() {
  const rbac = useRbac()
  const { data, isLoading, isError } = useQuery<string[]>({
    queryKey: ['redact-paths', rbac.role, rbac.tenantId],
    queryFn: () => getActiveRedactPaths(rbac),
  })
  return (
    <Dialog>
      <DialogTrigger asChild>
        <Button type="button" variant="outline" size="sm">
          View active redact paths{data ? ` (${data.length})` : ''}
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Active redact paths</DialogTitle>
        </DialogHeader>
        <ul className="max-h-96 space-y-0.5 overflow-y-auto font-mono text-xs text-white/70">
          {isLoading && <li className="text-white/40">Loading…</li>}
          {isError && <li className="text-destructive">Failed to load redact paths.</li>}
          {data?.map((path) => (
            <li key={path}>{path}</li>
          ))}
        </ul>
      </DialogContent>
    </Dialog>
  )
}

/**
 * The redaction-at-source hero panel.
 *
 * @returns The id picker, side-by-side records, badge, explainer, and path list.
 */
export function RedactionHero() {
  const { query } = useLogQuery()
  const [requestId, setRequestId] = useState('')
  const [active, setActive] = useState<string | null>(null)

  const { data, isLoading, isError } = useQuery<SameRecord>({
    queryKey: [
      'same-record',
      active,
      query.source,
      query.from,
      query.to,
      query.role,
      query.tenantId,
    ],
    // Invariant: `enabled` below gates the query on `active !== null && active !== ''`,
    // so the queryFn only runs once `active` is a non-empty string — the `!` is safe.
    queryFn: () => getSameRecord({ requestId: active! }, query),
    enabled: active !== null && active !== '',
  })

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <Badge className="gap-1.5 bg-(--color-success)/15 text-(--color-success)">
          <ShieldCheck aria-hidden className="h-3.5 w-3.5" />
          Redacted at source — never stored raw
        </Badge>
        <RedactPathsDialog />
      </div>

      <p className="text-sm text-white/60">
        The library redacts in-process via <code className="font-mono">fast-redact</code> (97
        default paths) <strong>before</strong> the line leaves the service — so Postgres and Loki
        only ever hold redacted data. There is nothing to unmask because raw PII never left the
        process.
      </p>

      <div className="flex flex-wrap items-end gap-2">
        <div className="space-y-1.5">
          <label htmlFor="redact-req" className="text-xs text-white/55">
            requestId (fire POST /pii-demo/signup, then paste it here)
          </label>
          <Input
            id="redact-req"
            value={requestId}
            onChange={(e) => setRequestId(e.target.value)}
            placeholder="req_…"
            className="h-9 w-72 font-mono"
          />
        </div>
        <Button
          type="button"
          disabled={requestId.trim() === ''}
          onClick={() => setActive(requestId.trim())}
        >
          Load record
        </Button>
      </div>

      {isLoading && <p className="text-sm text-white/40">Loading record…</p>}
      {isError && <p className="text-sm text-destructive">Failed to load the record.</p>}
      {data && (
        <div className="grid gap-4 md:grid-cols-2">
          <RecordView label="Postgres" rows={data.postgres} />
          <RecordView label="Loki" rows={data.loki} />
        </div>
      )}

      <p className="rounded-md border border-(--glass-border) bg-(--glass-bg) p-3 text-[11px] text-white/55">
        Unlike Datadog Sensitive Data Scanner or OTel-collector redaction — which scrub{' '}
        <strong>after</strong> ingest and gate de-obfuscation behind an &quot;unmask&quot;
        permission — this redaction is real and irreversible: the censor happens in-process, so
        there is no raw copy anywhere to unmask.
      </p>
    </div>
  )
}
