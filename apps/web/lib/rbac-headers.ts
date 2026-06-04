/**
 * @fileoverview Build the RBAC request headers from the active identity.
 *
 * Shared by the alerts/incidents and governance clients so every request carries
 * the same `x-role` / `x-tenant-id` headers the API resolves access from. The
 * tenant header is omitted when "all tenants" is selected.
 *
 * Scoped-demo trust model: these `x-role` / `x-tenant-id` headers are an
 * unauthenticated, client-supplied RBAC mechanism — trusted here only because the
 * demo API deliberately accepts them. A production deployment MUST derive role and
 * tenant from a validated JWT / session (`@bymax-one/nest-auth`) instead of
 * trusting browser-controlled headers; the API documents the same scoped-demo
 * caveat in `apps/api/src/governance/rbac.context.ts`. As defence in depth, the
 * tenant id is validated against a safe pattern below and dropped if it does not
 * conform, so arbitrary client input is never forwarded as a header value.
 *
 * @module lib/rbac-headers
 */

import { z } from 'zod'

import type { RbacContext } from './types'

/**
 * Conservative tenant-id shape: lowercase alphanumerics and hyphens, up to 40
 * chars. Mirrors the unbounded `parseAsString` tenant parser in `lib/filters.ts`
 * and gates what may reach the wire as an `x-tenant-id` header value.
 */
const tenantIdSchema = z.string().regex(/^[a-z0-9-]{0,40}$/)

/**
 * Convert the active RBAC identity into request headers.
 *
 * The tenant header is sent only when a tenant is selected AND its value matches
 * {@link tenantIdSchema}; a non-conforming value is dropped (the header is
 * omitted) rather than forwarded verbatim.
 *
 * @param rbac - The active role + tenant.
 * @returns A headers record with `x-role` (always) and `x-tenant-id` (when set and valid).
 */
export function rbacHeaders(rbac: RbacContext): Record<string, string> {
  const headers: Record<string, string> = { 'x-role': rbac.role }
  if (rbac.tenantId !== '' && tenantIdSchema.safeParse(rbac.tenantId).success) {
    headers['x-tenant-id'] = rbac.tenantId
  }
  return headers
}
