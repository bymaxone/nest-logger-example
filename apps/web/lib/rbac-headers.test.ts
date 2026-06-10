/**
 * @fileoverview Unit tests for `rbacHeaders` — verifies the RBAC header builder
 * sends `x-role` unconditionally, forwards a valid tenant as `x-tenant-id`, and
 * rejects non-conforming tenant values (empty, uppercase, special chars, too long).
 *
 * @module lib/rbac-headers.test
 */
import { describe, expect, it } from 'vitest'

import { rbacHeaders } from './rbac-headers'
import type { RbacContext } from './types'

describe('rbacHeaders', () => {
  /** x-role is always included in the output, carrying the role verbatim. */
  it('always includes x-role with the exact role value', () => {
    const headers = rbacHeaders({ role: 'admin', tenantId: '' })
    expect(headers['x-role']).toBe('admin')
  })

  /** All three RBAC role values are forwarded verbatim. */
  it('forwards each role value unchanged', () => {
    for (const role of ['viewer', 'operator', 'admin'] as RbacContext['role'][]) {
      expect(rbacHeaders({ role, tenantId: '' })['x-role']).toBe(role)
    }
  })

  /** A valid lowercase-alphanumeric tenant flows through as x-tenant-id. */
  it('includes x-tenant-id for a valid lowercase-alphanumeric tenant', () => {
    const headers = rbacHeaders({ role: 'operator', tenantId: 'acme' })
    expect(headers['x-tenant-id']).toBe('acme')
  })

  /** A valid tenant with hyphens is forwarded. */
  it('includes x-tenant-id when the tenant contains hyphens', () => {
    const headers = rbacHeaders({ role: 'admin', tenantId: 'my-tenant-123' })
    expect(headers['x-tenant-id']).toBe('my-tenant-123')
  })

  /** An empty tenant omits x-tenant-id (the `!== ''` guard). */
  it('omits x-tenant-id when the tenant is an empty string', () => {
    const headers = rbacHeaders({ role: 'viewer', tenantId: '' })
    expect(headers['x-tenant-id']).toBeUndefined()
    expect(Object.keys(headers)).toEqual(['x-role'])
  })

  /** An uppercase tenant fails the regex and is dropped (defence-in-depth). */
  it('omits x-tenant-id when the tenant contains uppercase letters', () => {
    const headers = rbacHeaders({ role: 'admin', tenantId: 'ACME' })
    expect(headers['x-tenant-id']).toBeUndefined()
  })

  /** A tenant with a special character (e.g. @) is dropped. */
  it('omits x-tenant-id when the tenant contains disallowed characters', () => {
    const headers = rbacHeaders({ role: 'admin', tenantId: 'acme@corp' })
    expect(headers['x-tenant-id']).toBeUndefined()
  })

  /** A tenant with a space is dropped. */
  it('omits x-tenant-id when the tenant contains a space', () => {
    const headers = rbacHeaders({ role: 'admin', tenantId: 'my tenant' })
    expect(headers['x-tenant-id']).toBeUndefined()
  })

  /**
   * A tenant of exactly 40 characters is at the allowed boundary and must be
   * forwarded (the regex allows 0–40 characters).
   */
  it('forwards a tenant of exactly 40 characters (at boundary)', () => {
    const tenant = 'a'.repeat(40)
    const headers = rbacHeaders({ role: 'admin', tenantId: tenant })
    expect(headers['x-tenant-id']).toBe(tenant)
  })

  /**
   * A tenant of 41 characters exceeds the allowed maximum and must be dropped
   * (the `{0,40}` quantifier makes 41 chars fail the regex).
   */
  it('omits x-tenant-id when the tenant exceeds 40 characters', () => {
    const tenant = 'a'.repeat(41)
    const headers = rbacHeaders({ role: 'admin', tenantId: tenant })
    expect(headers['x-tenant-id']).toBeUndefined()
  })

  /** The result carries exactly the two expected header names (no extras). */
  it('returns exactly x-role and x-tenant-id when both are set and valid', () => {
    const headers = rbacHeaders({ role: 'admin', tenantId: 'acme' })
    expect(Object.keys(headers).sort()).toEqual(['x-role', 'x-tenant-id'].sort())
  })
})

describe('rbacHeaders — regex must anchor both ends', () => {
  /**
   * A value with a valid lowercase suffix but an uppercase prefix must be
   * dropped. Without the `^` anchor the regex would match only the suffix,
   * letting the uppercase-prefixed string through.
   */
  it('omits x-tenant-id for a value with an uppercase prefix followed by a valid suffix', () => {
    const headers = rbacHeaders({ role: 'admin', tenantId: 'UPPER-lower' })
    expect(headers['x-tenant-id']).toBeUndefined()
  })

  /**
   * A value with a valid lowercase prefix but an uppercase suffix must be
   * dropped. Without the `$` anchor the regex would match only the prefix,
   * letting the uppercase-suffixed string through.
   */
  it('omits x-tenant-id for a value with a valid prefix followed by an uppercase suffix', () => {
    const headers = rbacHeaders({ role: 'admin', tenantId: 'valid-prefix-UPPER' })
    expect(headers['x-tenant-id']).toBeUndefined()
  })
})
