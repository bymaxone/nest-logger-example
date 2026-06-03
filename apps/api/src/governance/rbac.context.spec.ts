/**
 * Unit tests for RBAC context helpers.
 *
 * Covers: Viewer query is hard-scoped to its tenantId, Admin has no restriction,
 * export is denied to Viewers, and `isAdmin` guards correctly.
 */
import { describe, expect, it } from '@jest/globals'

import { buildRbacContext, canExport, isAdmin, toRestriction } from './rbac.context.js'

describe('buildRbacContext', () => {
  it('defaults to operator role when x-role header is absent', () => {
    /** Missing `x-role` header must resolve to the `operator` role. */
    const ctx = buildRbacContext({})
    expect(ctx.role).toBe('operator')
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
