/**
 * RBAC context — role + tenantId extracted from request headers.
 *
 * Layer: governance. Reads `x-role` and `x-tenant-id` headers from the current
 * request. This is a **scoped demo** of query-based RBAC — in a real deployment
 * the role and tenant would come from a validated JWT or session provided by
 * `@bymax-one/nest-auth`.
 *
 * 🎓 Scoped demo of **query-based RBAC** (à la Datadog data-access restrictions).
 * In production, wire roles to your IdP / `@bymax-one/nest-auth`.
 *
 * @module
 */
/** Supported roles (read-only, least-privilege ordering). */
export type RbacRole = 'viewer' | 'operator' | 'admin'

/** Resolved RBAC context for a single request. */
export interface RbacContextData {
  role: RbacRole
  tenantId: string | undefined
  actor: string
}

/**
 * Build an `RbacContextData` from raw request headers.
 *
 * @param headers - Express-style headers record.
 * @returns Resolved RBAC context; defaults to `operator` role when header is absent.
 * @throws {Error} In production (`NODE_ENV === 'production'`), because trusting
 *   client-supplied `x-role` / `x-tenant-id` / `x-actor` headers is demo-only —
 *   wire `@bymax-one/nest-auth` (validated JWT/session) before production.
 */
export function buildRbacContext(
  headers: Record<string, string | string[] | undefined>,
): RbacContextData {
  // Header-based RBAC trusts client-supplied headers verbatim — safe only for the
  // demo. Fail fast in production so a real deployment cannot accidentally ship it
  // without first wiring a validated identity source (@bymax-one/nest-auth).
  if (process.env.NODE_ENV === 'production') {
    throw new Error(
      'Header-based RBAC is demo-only — wire @bymax-one/nest-auth (validated JWT/session) before production.',
    )
  }
  const rawRole = String(headers['x-role'] ?? 'operator').toLowerCase()
  const role: RbacRole =
    rawRole === 'admin' ? 'admin' : rawRole === 'viewer' ? 'viewer' : 'operator'
  const rawTenant = headers['x-tenant-id']
  const tenantId = Array.isArray(rawTenant) ? rawTenant[0] : rawTenant
  const rawActor = headers['x-actor'] ?? headers['x-tenant-id']
  const actor = String(
    Array.isArray(rawActor) ? (rawActor[0] ?? 'anonymous') : (rawActor ?? 'anonymous'),
  )
  return { role, tenantId, actor }
}

/**
 * The sentinel value applied when a non-admin caller omits `x-tenant-id`.
 * Causes `buildPrismaWhere` to match no rows, preventing cross-tenant data leaks.
 */
export const NO_TENANT_SENTINEL = '__NO_TENANT__'

/**
 * Convert an `RbacContextData` to a `QueryRestriction` for `LogsService`.
 *
 * Admins have no tenantId restriction; viewers and operators are scoped to their
 * tenant. When a non-admin provides no `x-tenant-id`, the sentinel is applied so
 * `buildPrismaWhere` matches zero rows rather than granting full access.
 *
 * @param ctx - Resolved RBAC context.
 * @returns The restriction object to pass into `LogsService.buildPrismaWhere`.
 */
export function toRestriction(ctx: RbacContextData): { tenantId?: string } {
  if (ctx.role === 'admin') return {}
  if (ctx.tenantId !== undefined) return { tenantId: ctx.tenantId }
  // Non-admin with no tenantId — lock to a sentinel that matches no rows.
  return { tenantId: NO_TENANT_SENTINEL }
}

/**
 * Check whether the given role is allowed to export log data.
 *
 * Viewers cannot export — they can only read.
 *
 * @param role - The actor's resolved role.
 * @returns `true` when the role may perform an export.
 */
export function canExport(role: RbacRole): boolean {
  return role !== 'viewer'
}

/**
 * Check whether the given role is allowed to perform admin-level mutations.
 *
 * Only admins can change retention settings and manage alert channels.
 *
 * @param role - The actor's resolved role.
 * @returns `true` when the role has admin privileges.
 */
export function isAdmin(role: RbacRole): boolean {
  return role === 'admin'
}
