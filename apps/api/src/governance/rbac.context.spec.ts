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

  it('falls back to x-tenant-id as actor when x-actor is absent but x-tenant-id is present', () => {
    /**
     * Scenario: no x-actor header, but x-tenant-id is present.
     * Rule: `rawActor = headers['x-actor'] ?? headers['x-tenant-id']` must resolve
     * to the tenant value — kills the StringLiteral mutation that changes the
     * `'x-tenant-id'` fallback key.
     */
    const ctx = buildRbacContext({ 'x-role': 'operator', 'x-tenant-id': 'acme' })
    expect(ctx.actor).toBe('acme')
  })

  it('does not throw when NODE_ENV is set to development', () => {
    /**
     * Scenario: NODE_ENV='development'.
     * Rule: the guard allows `development` explicitly (in addition to the `?? 'development'`
     * fallback) — kills any mutation that changes `'development'` to a different literal
     * in the `env !== 'development'` check.
     */
    process.env.NODE_ENV = 'development'
    expect(() => buildRbacContext({})).not.toThrow()
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

describe('NO_TENANT_SENTINEL — literal value', () => {
  it('has the exact expected string value __NO_TENANT__', () => {
    /**
     * Scenario: inspect the exported constant directly.
     * Rule: `NO_TENANT_SENTINEL` must equal the hardcoded string `'__NO_TENANT__'` —
     * kills the StringLiteral mutation that changes the constant's value while
     * tests that only use the imported symbol (never the literal) would miss it.
     */
    expect(NO_TENANT_SENTINEL).toBe('__NO_TENANT__')
  })

  it('is not an empty string — kills StringLiteral "" mutant on constant definition', () => {
    /**
     * Scenario: the StringLiteral mutant replaces `'__NO_TENANT__'` with `''`.
     * Rule: the sentinel must never be an empty string — an empty-string sentinel
     * would silently match tenant-less rows rather than matching zero rows, creating
     * a data-isolation bypass.
     */
    expect(NO_TENANT_SENTINEL).not.toBe('')
    expect(NO_TENANT_SENTINEL.length).toBeGreaterThan(0)
  })
})

describe('buildRbacContext — x-role header key usage', () => {
  it('reads role via the exact header key x-role, not an empty key', () => {
    /**
     * Scenario: the StringLiteral mutant replaces `'x-role'` with `''`.
     * Rule: `buildRbacContext({ 'x-role': 'admin' })` must return `role === 'admin'` —
     * under the mutant, `headers['']` is undefined so the default 'operator' is used,
     * making the role 'operator' instead of 'admin'.  Asserting admin here kills that
     * mutant.
     */
    const ctx = buildRbacContext({ 'x-role': 'admin' })
    expect(ctx.role).toBe('admin')
  })

  it('reads viewer role from x-role header — confirms header key is x-role', () => {
    /**
     * Scenario: viewer role via explicit x-role header.
     * Rule: `buildRbacContext({ 'x-role': 'viewer', 'x-tenant-id': 't1' })` must
     * return `role === 'viewer'` — kills the StringLiteral mutant on `'x-role'`.
     */
    const ctx = buildRbacContext({ 'x-role': 'viewer', 'x-tenant-id': 't1' })
    expect(ctx.role).toBe('viewer')
  })
})
