/**
 * @fileoverview TenantRoleSwitcher — tenant + RBAC role selectors.
 *
 * Writes `tenantId` and `role` to the URL. These drive the query-based RBAC demo:
 * `tenantId` scopes every query (sent as `x-tenant-id`); `role` gates actions and,
 * for non-admins, restricts visible rows to the selected tenant (`DASHBOARD.md` §10).
 *
 * @module components/controls/tenant-role-switcher
 */

'use client'

import { useQueryStates } from 'nuqs'

import { logQueryParsers, ROLES } from '@/lib/filters'
import type { RbacRole } from '@/lib/types'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'

/** Sentinel option value representing "all tenants" (clears the tenant filter). */
const ALL_TENANTS = '__all__'

/** Demo tenant identifiers exercised by the example domain endpoints. */
const TENANTS = ['acme', 'globex'] as const

/** Human labels for each RBAC role. */
const ROLE_LABEL: Record<(typeof ROLES)[number], string> = {
  viewer: 'Viewer',
  operator: 'Operator',
  admin: 'Admin',
}

/**
 * Tenant + role selectors feeding the RBAC demo.
 *
 * @returns Two compact selects (tenant, role) bound to the URL state.
 */
export function TenantRoleSwitcher() {
  const [{ tenantId, role }, setQuery] = useQueryStates(logQueryParsers)

  return (
    <div className="flex items-center gap-1.5">
      <Select
        value={tenantId === '' ? ALL_TENANTS : tenantId}
        onValueChange={(value) => void setQuery({ tenantId: value === ALL_TENANTS ? '' : value })}
      >
        <SelectTrigger className="h-8 w-30 font-mono text-xs" aria-label="Tenant">
          <SelectValue placeholder="Tenant" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value={ALL_TENANTS}>All tenants</SelectItem>
          {TENANTS.map((tenant) => (
            <SelectItem key={tenant} value={tenant}>
              {tenant}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      <Select
        value={role}
        // The Select lists exactly the `ROLES`, so Radix only ever emits a valid role.
        onValueChange={(value) => void setQuery({ role: value as RbacRole })}
      >
        <SelectTrigger className="h-8 w-26 font-mono text-xs" aria-label="Role">
          <SelectValue placeholder="Role" />
        </SelectTrigger>
        <SelectContent>
          {ROLES.map((value) => (
            <SelectItem key={value} value={value}>
              {ROLE_LABEL[value]}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  )
}
