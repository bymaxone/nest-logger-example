/**
 * Unit tests for RBAC context helpers.
 *
 * Covers: Viewer query is hard-scoped to its tenantId, Admin has no restriction,
 * export is denied to Viewers, and `isAdmin` guards correctly.
 */
import { afterEach, describe, expect, it } from '@jest/globals'

import {
  buildRbacContext,
  canExport,
  isAdmin,
  NO_TENANT_SENTINEL,
  toRestriction,
} from './rbac.context.js'

describe('buildRbacContext', () => {
  const originalEnv = process.env.NODE_ENV

  afterEach(() => {
    // Restore NODE_ENV so the production-guard tests cannot leak into others.
    process.env.NODE_ENV = originalEnv
  })

  it('defaults to operator role when x-role header is absent', () => {
    /** Missing `x-role` header must resolve to the `operator` role. */
    const ctx = buildRbacContext({})
    expect(ctx.role).toBe('operator')
  })

  it('throws outside development/test (production)', () => {
    /**
     * Trusting client-supplied `x-role` headers is demo-only. The function must
     * fail fast for any non-dev/test NODE_ENV (here: production) so a real
     * deployment cannot accidentally ship header-based RBAC.
     */
    process.env.NODE_ENV = 'production'
    expect(() => buildRbacContext({})).toThrow(/Header-based RBAC is demo-only/)
  })

  it('treats an unset NODE_ENV as development and does not throw', () => {
    /**
     * An absent NODE_ENV must be treated as development so local runs and CI keep
     * working — this exercises the `?? 'development'` default branch.
     */
    delete process.env.NODE_ENV
    expect(() => buildRbacContext({})).not.toThrow()
  })

  it('selects the first value of an array-valued x-tenant-id header', () => {
    /**
     * When `x-tenant-id` arrives as a multi-value header (string[]), only the
     * first value is taken as the tenant; this covers the `Array.isArray` branch.
     */
    const ctx = buildRbacContext({ 'x-role': 'viewer', 'x-tenant-id': ['acme', 'globex'] })
    expect(ctx.tenantId).toBe('acme')
  })

  it('derives actor from x-actor when present', () => {
    /**
     * `x-actor` takes precedence over `x-tenant-id` for the resolved actor; this
     * covers the explicit-actor branch.
     */
    const ctx = buildRbacContext({ 'x-actor': 'alice', 'x-tenant-id': 'acme' })
    expect(ctx.actor).toBe('alice')
  })

  it('falls back to anonymous when neither x-actor nor x-tenant-id is present', () => {
    /**
     * With no `x-actor` and no `x-tenant-id`, the actor must default to
     * `anonymous`; this covers the `?? 'anonymous'` fallback branch.
     */
    const ctx = buildRbacContext({})
    expect(ctx.actor).toBe('anonymous')
  })

  it('selects the first array value of x-actor and falls back to anonymous on empty', () => {
    /**
     * An array-valued `x-actor` resolves to its first element; an empty array
     * falls back to `anonymous` — covering both array sub-branches of actor.
     */
    expect(buildRbacContext({ 'x-actor': ['bob', 'carol'] }).actor).toBe('bob')
    expect(buildRbacContext({ 'x-actor': [] }).actor).toBe('anonymous')
  })

  it('parses viewer role from header', () => {
    /** The `x-role: viewer` header must resolve to the `viewer` role. */
    const ctx = buildRbacContext({ 'x-role': 'viewer', 'x-tenant-id': 'acme' })
    expect(ctx.role).toBe('viewer')
    expect(ctx.tenantId).toBe('acme')
  })

  it('parses admin role from header', () => {
    /** The `x-role: admin` header must resolve to the `admin` role. */
    const ctx = buildRbacContext({ 'x-role': 'admin' })
    expect(ctx.role).toBe('admin')
  })
})

describe('toRestriction', () => {
  it('restricts a viewer to their tenantId', () => {
    /**
     * A viewer must be hard-scoped to their own tenantId. The restriction
     * is injected into `LogsService.buildPrismaWhere` and CANNOT be widened.
     */
    const ctx = buildRbacContext({ 'x-role': 'viewer', 'x-tenant-id': 'acme' })
    const restriction = toRestriction(ctx)
    expect(restriction.tenantId).toBe('acme')
  })

  it('returns an empty restriction for admin', () => {
    /**
     * An admin must receive an empty restriction so they can see all tenants.
     */
    const ctx = buildRbacContext({ 'x-role': 'admin' })
    const restriction = toRestriction(ctx)
    expect(restriction.tenantId).toBeUndefined()
  })

  it('restricts an operator to their tenantId when present', () => {
    /**
     * An operator with a tenantId header must be scoped to that tenant.
     */
    const ctx = buildRbacContext({ 'x-role': 'operator', 'x-tenant-id': 'globex' })
    const restriction = toRestriction(ctx)
    expect(restriction.tenantId).toBe('globex')
  })

  it('locks a non-admin with no tenantId to the no-match sentinel', () => {
    /**
     * A non-admin caller that omits `x-tenant-id` must be scoped to
     * `NO_TENANT_SENTINEL` so the query matches zero rows rather than leaking
     * cross-tenant data — this covers the sentinel fallback branch.
     */
    const ctx = buildRbacContext({ 'x-role': 'operator' })
    const restriction = toRestriction(ctx)
    expect(restriction.tenantId).toBe(NO_TENANT_SENTINEL)
  })
})

describe('canExport', () => {
  it('denies export to viewers', () => {
    /** Viewers must not be permitted to export. */
    expect(canExport('viewer')).toBe(false)
  })

  it('allows export to operators', () => {
    /** Operators can export. */
    expect(canExport('operator')).toBe(true)
  })

  it('allows export to admins', () => {
    /** Admins can export. */
    expect(canExport('admin')).toBe(true)
  })
})

describe('isAdmin', () => {
  it('returns true only for admin role', () => {
    /** `isAdmin` must return true for admin and false for all other roles. */
    expect(isAdmin('admin')).toBe(true)
    expect(isAdmin('operator')).toBe(false)
    expect(isAdmin('viewer')).toBe(false)
  })
})
