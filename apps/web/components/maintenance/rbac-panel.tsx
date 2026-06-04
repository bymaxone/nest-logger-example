/**
 * @fileoverview RbacPanel — the query-based RBAC role/grant matrix.
 *
 * Documents the three roles and their grants, highlights the active role from the
 * single global control, and explains that switching tenant injects a `tenantId`
 * restriction into the **shared** `/logs` query builder (the same `LogQuery.tenantId`
 * field every read uses) — RBAC reuses the query layer rather than bolting on a
 * second auth path (`DASHBOARD.md` §10).
 *
 * @module components/maintenance/rbac-panel
 */

'use client'

import { Check, X } from 'lucide-react'

import { useRbac } from '@/hooks/use-rbac'
import type { RbacRole } from '@/lib/types'
import { ScopedDemoCallout } from '@/components/common/scoped-demo-callout'
import { cn } from '@/lib/utils'

/** The roles, least-privilege first. */
const ROLES: RbacRole[] = ['viewer', 'operator', 'admin']

/** One grant row: a capability and which roles hold it. */
interface Grant {
  label: string
  held: Record<RbacRole, boolean>
}

/** Grant matrix — which roles hold each capability (`DASHBOARD.md` §10). */
const GRANTS: Grant[] = [
  { label: 'Read logs (own tenant)', held: { viewer: true, operator: true, admin: true } },
  { label: 'Read all tenants', held: { viewer: false, operator: false, admin: true } },
  { label: 'Export (JSON/CSV)', held: { viewer: false, operator: true, admin: true } },
  {
    label: 'Ack / snooze / resolve incidents',
    held: { viewer: false, operator: true, admin: true },
  },
  { label: 'See audit trail', held: { viewer: false, operator: true, admin: true } },
  {
    label: 'Manage rules / retention / channels',
    held: { viewer: false, operator: false, admin: true },
  },
]

/**
 * The RBAC role/grant matrix + tenant-restriction explainer.
 *
 * @returns The RBAC panel bound to the active role/tenant.
 */
export function RbacPanel() {
  const { role, tenantId } = useRbac()

  return (
    <div className="space-y-4">
      <div className="overflow-x-auto rounded-lg border border-(--glass-border)">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-(--glass-border) text-left">
              <th scope="col" className="px-4 py-2 font-medium text-white/55">
                Grant
              </th>
              {ROLES.map((r) => (
                <th
                  key={r}
                  scope="col"
                  className={cn(
                    'px-4 py-2 text-center font-mono text-xs capitalize',
                    r === role ? 'text-brand-500' : 'text-white/55',
                  )}
                >
                  {r}
                  {r === role && <span className="sr-only"> (active)</span>}
                  {r === role && <span aria-hidden> ●</span>}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {GRANTS.map((grant) => (
              <tr key={grant.label} className="border-b border-(--glass-border) last:border-0">
                <td className="px-4 py-2">{grant.label}</td>
                {ROLES.map((r) => (
                  <td key={r} className="px-4 py-2 text-center">
                    {grant.held[r] ? (
                      <Check
                        aria-label="granted"
                        className="mx-auto h-4 w-4 text-(--color-success)"
                      />
                    ) : (
                      <X aria-label="denied" className="mx-auto h-4 w-4 text-white/25" />
                    )}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <p className="text-[11px] text-white/45">
        Active: <span className="font-mono text-brand-500">{role}</span>
        {tenantId !== '' ? (
          <>
            {' '}
            scoped to tenant <span className="font-mono">{tenantId}</span>
          </>
        ) : (
          ' (all tenants)'
        )}
        . Switching tenant injects a <code className="font-mono">tenantId</code> restriction into
        the shared <code className="font-mono">/logs</code> query builder (the same{' '}
        <code className="font-mono">LogQuery.tenantId</code> field every read uses), so the
        Explorer, charts, and export all scope identically — there is no second authorization path.
      </p>

      <ScopedDemoCallout feature="query-based RBAC">
        À la Datadog data-access restrictions. In production, wire roles to your IdP or{' '}
        <code className="font-mono">@bymax-one/nest-auth</code> instead of trusting a header.
      </ScopedDemoCallout>
    </div>
  )
}
