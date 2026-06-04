/**
 * @fileoverview AuditTable — the read-only `audit_events` trail.
 *
 * Renders `GET /audit` rows (`actor, action, target, tenantId, at`) newest-first.
 * Records **actions** (who exported, created/edited a rule, switched role/tenant,
 * changed retention) — never logins. Strictly read-only: there are no edit/delete
 * affordances, pairing with the redaction story to close the compliance loop
 * (`DASHBOARD.md` §10). Operator+ only.
 *
 * @module components/maintenance/audit-table
 */

'use client'

import { useQuery } from '@tanstack/react-query'

import { useRbac } from '@/hooks/use-rbac'
import { type AuditEvent, getAuditEvents } from '@/lib/maintenance-api'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'

/**
 * The read-only audit trail table.
 *
 * @returns The audit events table bound to the active RBAC identity.
 */
export function AuditTable() {
  const rbac = useRbac()
  const canRead = rbac.role !== 'viewer'

  const { data, isLoading, isError } = useQuery<AuditEvent[]>({
    queryKey: ['audit', rbac.role, rbac.tenantId],
    queryFn: () => getAuditEvents(rbac),
    enabled: canRead,
  })

  if (!canRead)
    return <p className="text-sm text-white/40">Viewers cannot access the audit trail.</p>
  if (isLoading) return <p className="text-sm text-white/40">Loading audit trail…</p>
  if (isError) return <p className="text-sm text-destructive">Failed to load the audit trail.</p>
  if (!data || data.length === 0)
    return <p className="text-sm text-white/40">No audit events yet.</p>

  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Actor</TableHead>
          <TableHead>Action</TableHead>
          <TableHead>Target</TableHead>
          <TableHead>Tenant</TableHead>
          <TableHead>At</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {data.map((event) => (
          <TableRow key={event.id}>
            <TableCell className="font-mono text-xs">{event.actor}</TableCell>
            <TableCell className="font-mono text-xs text-brand-500">{event.action}</TableCell>
            <TableCell className="max-w-60 truncate font-mono text-xs text-white/60">
              {event.target}
            </TableCell>
            <TableCell className="font-mono text-xs">{event.tenantId ?? '—'}</TableCell>
            <TableCell className="text-xs text-white/55">
              {new Date(event.at).toLocaleString()}
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  )
}
