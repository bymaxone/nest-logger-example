/**
 * @fileoverview Component tests for {@link RbacPanel} — the grant matrix
 * (granted/denied icons per role), the active-role highlight, and both branches
 * of the tenant scope line (all-tenants vs scoped-to-tenant).
 *
 * The RBAC identity (`@/hooks/use-rbac`) is mocked so each test pins a known
 * role + tenant; the rendered matrix and copy are asserted via real queries.
 *
 * @module components/maintenance/rbac-panel.test
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, render, screen, within } from '@testing-library/react'

import type { RbacContext } from '@/lib/types'

/** Mutable identity the mocked `useRbac` returns; reassigned per test. */
let currentRbac: RbacContext = { role: 'admin', tenantId: '' }

vi.mock('@/hooks/use-rbac', () => ({
  useRbac: (): RbacContext => currentRbac,
}))

// Imported after the mock so the component binds the mocked hook.
const { RbacPanel } = await import('./rbac-panel')

beforeEach(() => {
  currentRbac = { role: 'admin', tenantId: '' }
})

afterEach(() => {
  cleanup()
})

describe('RbacPanel', () => {
  /**
   * The matrix renders every grant row with per-role granted/denied icons, and
   * the active role (admin here) carries the screen-reader "(active)" marker.
   */
  it('renders the grant matrix and marks the active role', () => {
    render(<RbacPanel />)

    // One row per documented grant.
    expect(screen.getByRole('cell', { name: 'Read logs (own tenant)' })).toBeInTheDocument()
    expect(screen.getByRole('cell', { name: 'Export (JSON/CSV)' })).toBeInTheDocument()
    expect(
      screen.getByRole('cell', { name: 'Manage rules / retention / channels' }),
    ).toBeInTheDocument()

    // The granted/denied icons are rendered (label-based, not className).
    expect(screen.getAllByLabelText('granted').length).toBeGreaterThan(0)
    expect(screen.getAllByLabelText('denied').length).toBeGreaterThan(0)

    // The active role header (admin) is flagged for assistive tech.
    const adminHeader = screen.getByRole('columnheader', { name: /admin/ })
    expect(within(adminHeader).getByText('(active)')).toBeInTheDocument()
  })

  /** With no tenant selected the scope line reads "(all tenants)". */
  it('shows the all-tenants scope line when no tenant is selected', () => {
    currentRbac = { role: 'admin', tenantId: '' }
    render(<RbacPanel />)
    expect(screen.getByText(/\(all tenants\)/)).toBeInTheDocument()
    expect(screen.queryByText(/scoped to tenant/)).not.toBeInTheDocument()
  })

  /**
   * With a tenant selected (and a non-admin role) the scope line names the tenant
   * and the active marker moves to that role — exercises both ternary branches.
   */
  it('shows the scoped-tenant line and marks the active operator role', () => {
    currentRbac = { role: 'operator', tenantId: 'acme' }
    render(<RbacPanel />)

    expect(screen.getByText(/scoped to tenant/)).toBeInTheDocument()
    expect(screen.getByText('acme')).toBeInTheDocument()

    const operatorHeader = screen.getByRole('columnheader', { name: /operator/ })
    expect(within(operatorHeader).getByText('(active)')).toBeInTheDocument()

    // The scope line surfaces the active role token.
    expect(screen.getAllByText('operator').length).toBeGreaterThan(0)
  })
})
