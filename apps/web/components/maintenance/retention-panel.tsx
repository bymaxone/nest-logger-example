/**
 * @fileoverview RetentionPanel — the TTL sweep status + Loki retention echo.
 *
 * Shows the real Postgres TTL sweep (TTL days, next-sweep time, rows pending
 * deletion) from `GET /maintenance/retention`; admins can change the TTL via
 * `PATCH /maintenance/retention`. Beside it sits a read-only echo of the Loki
 * retention policy, making the two-tier story concrete (durable `warn`+ in
 * Postgres, TTL'd; full `info`+ aggregation in Loki, its own retention). The
 * sweep cron runs server-side — the UI only reads status and (admin) requests a
 * config change (`DASHBOARD.md` §10).
 *
 * @module components/maintenance/retention-panel
 */

'use client'

import { useEffect, useState } from 'react'
import {
  type UseMutationResult,
  type UseQueryResult,
  useMutation,
  useQuery,
  useQueryClient,
} from '@tanstack/react-query'
import { toast } from 'sonner'

import { useRbac } from '@/hooks/use-rbac'
import { getRetention, type RetentionStatus, updateRetention } from '@/lib/maintenance-api'
import { ScopedDemoCallout } from '@/components/common/scoped-demo-callout'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'

/**
 * The Loki retention policy echoed read-only — mirrors `docker/loki/loki-config.yml`
 * (`retention_period`). The compactor there sets `retention_enabled: true` + a
 * `delete_request_store`, so this reflects a real, working policy.
 */
const LOKI_RETENTION_PERIOD = '744h'

/** TTL bounds enforced by `PATCH /maintenance/retention` (mirrors the server Zod schema). */
const TTL_MIN_DAYS = 1
const TTL_MAX_DAYS = 365

/**
 * Postgres TTL sweep status card with an admin-only TTL edit form.
 *
 * @param props.query The retention status query (status + loading/error flags).
 * @param props.save The TTL update mutation (drives the submit button state).
 * @param props.isAdmin Whether the active role may change the TTL window.
 * @param props.ttlInput The raw TTL field value (controlled).
 * @param props.isTtlValid Whether `ttlInput` parses to an in-bounds integer.
 * @param props.parsedTtl The numeric TTL submitted when the user saves.
 * @param props.onTtlChange Called with the raw field value on every edit.
 * @returns The sweep status dl plus the admin TTL form or a viewer hint.
 */
function TtlSweepCard(props: {
  query: UseQueryResult<RetentionStatus>
  save: UseMutationResult<RetentionStatus, unknown, number>
  isAdmin: boolean
  ttlInput: string
  isTtlValid: boolean
  parsedTtl: number
  onTtlChange: (value: string) => void
}) {
  const { query, save, isAdmin, ttlInput, isTtlValid, parsedTtl, onTtlChange } = props
  const { data, isLoading, isError } = query

  return (
    <div className="space-y-3 rounded-lg border border-(--glass-border) bg-(--glass-bg) p-4">
      <h3 className="text-sm font-semibold">Postgres TTL sweep</h3>
      {isLoading && <p className="text-sm text-white/40">Loading…</p>}
      {isError && <p className="text-sm text-destructive">Failed to load retention status.</p>}
      {data && (
        <dl className="space-y-1.5 text-sm">
          <div className="flex justify-between">
            <dt className="text-white/55">TTL</dt>
            <dd className="font-mono">{data.retentionDays} days</dd>
          </div>
          <div className="flex justify-between">
            <dt className="text-white/55">Next sweep</dt>
            <dd className="font-mono">{new Date(data.nextSweep).toLocaleString()}</dd>
          </div>
          <div className="flex justify-between">
            <dt className="text-white/55">Rows pending deletion</dt>
            <dd className="font-mono">{data.pendingRows.toLocaleString()}</dd>
          </div>
        </dl>
      )}
      {isAdmin ? (
        <div className="flex items-end gap-2 border-t border-(--glass-border) pt-3">
          <div className="space-y-1.5">
            <Label htmlFor="ttl-days">TTL (days)</Label>
            <Input
              id="ttl-days"
              type="number"
              min={TTL_MIN_DAYS}
              max={TTL_MAX_DAYS}
              value={ttlInput}
              onChange={(e) => onTtlChange(e.target.value)}
              aria-invalid={ttlInput !== '' && !isTtlValid}
              className="h-9 w-28 font-mono"
            />
          </div>
          <Button
            type="button"
            size="sm"
            disabled={save.isPending || !isTtlValid}
            onClick={() => save.mutate(parsedTtl)}
          >
            {save.isPending ? 'Saving…' : 'Update TTL'}
          </Button>
        </div>
      ) : (
        <p className="text-[11px] text-white/40">Only admins can change the TTL window.</p>
      )}
    </div>
  )
}

/**
 * Read-only echo of the Loki retention policy, mirroring `docker/loki/loki-config.yml`.
 *
 * @returns A static card stating the configured `retention_period`.
 */
function LokiRetentionCard() {
  return (
    <div className="space-y-3 rounded-lg border border-(--glass-border) bg-(--glass-bg) p-4">
      <h3 className="text-sm font-semibold">Loki retention (read-only)</h3>
      <dl className="space-y-1.5 text-sm">
        <div className="flex justify-between">
          <dt className="text-white/55">retention_period</dt>
          <dd className="font-mono">{LOKI_RETENTION_PERIOD}</dd>
        </div>
      </dl>
      <p className="text-[11px] text-white/45">
        The Loki <code className="font-mono">compactor</code> has{' '}
        <code className="font-mono">retention_enabled: true</code> and a{' '}
        <code className="font-mono">delete_request_store</code>, so this reflects a real, working
        policy — not a no-op.
      </p>
    </div>
  )
}

/**
 * Retention & storage panel.
 *
 * @returns The TTL sweep status + admin config + Loki echo + scoped-demo callout.
 */
export function RetentionPanel() {
  const rbac = useRbac()
  const queryClient = useQueryClient()
  const isAdmin = rbac.role === 'admin'
  const canRead = rbac.role !== 'viewer'

  const query = useQuery<RetentionStatus>({
    queryKey: ['retention', rbac.role, rbac.tenantId],
    queryFn: () => getRetention(rbac),
    enabled: canRead,
  })

  const [ttlInput, setTtlInput] = useState('')
  useEffect(() => {
    if (query.data) setTtlInput(String(query.data.retentionDays))
  }, [query.data])

  // The server bounds TTL to 1–365 days; validate before sending so a stray
  // `0`/`NaN` never reaches `PATCH /maintenance/retention`.
  const parsedTtl = Number(ttlInput)
  const isTtlValid =
    Number.isInteger(parsedTtl) && parsedTtl >= TTL_MIN_DAYS && parsedTtl <= TTL_MAX_DAYS

  const save = useMutation<RetentionStatus, unknown, number>({
    mutationFn: (days: number) => updateRetention(days, rbac),
    onSuccess: () => {
      toast.success('Retention window updated')
      void queryClient.invalidateQueries({ queryKey: ['retention'] })
    },
    onError: (err: unknown) =>
      toast.error('Could not update retention', {
        description: err instanceof Error ? err.message : undefined,
      }),
  })

  if (!canRead) {
    return <p className="text-sm text-white/40">Viewers cannot access maintenance settings.</p>
  }

  return (
    <div className="space-y-4">
      <div className="grid gap-4 md:grid-cols-2">
        <TtlSweepCard
          query={query}
          save={save}
          isAdmin={isAdmin}
          ttlInput={ttlInput}
          isTtlValid={isTtlValid}
          parsedTtl={parsedTtl}
          onTtlChange={setTtlInput}
        />
        <LokiRetentionCard />
      </div>

      <p className="text-[11px] text-white/45">
        Two-tier asymmetry by design: Postgres holds the durable <strong>warn+</strong> tier
        (TTL-swept here), while Loki holds the full <strong>info+</strong> aggregation tier with its
        own retention. The differing volumes are the lesson, not a bug.
      </p>

      <ScopedDemoCallout feature="tiered retention">
        Real platforms add warm/cold object-storage tiers (S3/Glacier) and per-tenant retention
        overrides.
      </ScopedDemoCallout>
    </div>
  )
}
