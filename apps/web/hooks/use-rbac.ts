/**
 * @fileoverview `useRbac` — the active RBAC identity (role + tenant) from the
 * single global control (nuqs URL state).
 *
 * Both the Alerts and the Maintenance surfaces read it so their requests send the
 * same `x-role` / `x-tenant-id` headers and gate actions consistently — there is
 * one source of truth for who the caller is.
 *
 * Scoped-demo trust model: the role/tenant come from URL state and travel as
 * plain `x-role` / `x-tenant-id` headers (see `lib/rbac-headers.ts`). This is an
 * unauthenticated demo mechanism — it is trusted only because the demo API
 * deliberately accepts those headers. In production the identity MUST come from a
 * validated JWT / session (`@bymax-one/nest-auth`), never from client-controlled
 * URL state; the API enforces the same scoped-demo caveat in
 * `apps/api/src/governance/rbac.context.ts`.
 *
 * @module hooks/use-rbac
 */

'use client'

import { useQueryStates } from 'nuqs'

import { logQueryParsers } from '@/lib/filters'
import type { RbacContext } from '@/lib/types'

/**
 * Read the active role + tenant from the global control.
 *
 * @returns The current {@link RbacContext}.
 */
export function useRbac(): RbacContext {
  const [{ role, tenantId }] = useQueryStates(logQueryParsers)
  return { role, tenantId }
}
