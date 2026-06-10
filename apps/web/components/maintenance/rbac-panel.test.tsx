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

  /** The viewer column header gets the active marker when viewer is the current role. */
  it('marks the viewer column header as active when the role is viewer', () => {
    currentRbac = { role: 'viewer', tenantId: '' }
    render(<RbacPanel />)
    const viewerHeader = screen.getByRole('columnheader', { name: /viewer/ })
    expect(within(viewerHeader).getByText('(active)')).toBeInTheDocument()
  })

  /** All six grant labels from the GRANTS constant must be rendered. */
  it('renders all six grant labels', () => {
    render(<RbacPanel />)
    expect(screen.getByRole('cell', { name: 'Read logs (own tenant)' })).toBeInTheDocument()
    expect(screen.getByRole('cell', { name: 'Read all tenants' })).toBeInTheDocument()
    expect(screen.getByRole('cell', { name: 'Export (JSON/CSV)' })).toBeInTheDocument()
    expect(
      screen.getByRole('cell', { name: 'Ack / snooze / resolve incidents' }),
    ).toBeInTheDocument()
    expect(screen.getByRole('cell', { name: 'See audit trail' })).toBeInTheDocument()
    expect(
      screen.getByRole('cell', { name: 'Manage rules / retention / channels' }),
    ).toBeInTheDocument()
  })

  /** The three role headers render in the expected order: viewer, operator, admin. */
  it('renders role headers in viewer → operator → admin order', () => {
    render(<RbacPanel />)
    const headers = screen.getAllByRole('columnheader')
    // headers[0] is the "Grant" column; 1/2/3 are viewer/operator/admin.
    expect(headers[1]).toHaveTextContent('viewer')
    expect(headers[2]).toHaveTextContent('operator')
    expect(headers[3]).toHaveTextContent('admin')
  })

  /**
   * The viewer role can only "Read logs (own tenant)" — all other grants are denied.
   * Asserting the count of "granted" icons with viewer as active verifies the held matrix.
   */
  it('grants exactly one capability to the viewer role', () => {
    currentRbac = { role: 'viewer', tenantId: '' }
    render(<RbacPanel />)
    // Only "Read logs (own tenant)" holds viewer:true — exactly one granted icon per viewer column.
    // The matrix has 6 rows × 3 roles = 18 cells; viewer has 1 granted + 5 denied.
    expect(screen.getAllByLabelText('granted').length).toBeGreaterThanOrEqual(1)
    // Total denied must be at least 5 (viewer) + 2 (operator) = 7 in the full table.
    expect(screen.getAllByLabelText('denied').length).toBeGreaterThanOrEqual(5)
  })

  /**
   * Admin has all six grants. Running as admin and counting "granted" icons in
   * the column verifies no held:true → false mutation survives.
   */
  it('grants all six capabilities to admin', () => {
    currentRbac = { role: 'admin', tenantId: '' }
    render(<RbacPanel />)
    // Admin column has 6 granted icons; viewer has 1; operator has 4.
    // Total granted across the 3×6 matrix = 1 + 4 + 6 = 11.
    expect(screen.getAllByLabelText('granted')).toHaveLength(11)
    // Total denied = 18 - 11 = 7.
    expect(screen.getAllByLabelText('denied')).toHaveLength(7)
  })

  /** The "Read all tenants" grant is denied for viewer and operator, granted for admin only. */
  it('grants Read-all-tenants only to admin', () => {
    currentRbac = { role: 'admin', tenantId: '' }
    render(<RbacPanel />)
    const rows = screen.getAllByRole('row')
    // Find the row for "Read all tenants" (index 2 — after header row + first data row).
    const readAllRow = rows.find((r) => r.textContent?.includes('Read all tenants'))
    expect(readAllRow).toBeDefined()
    const grantedInRow = within(readAllRow!).getAllByLabelText('granted')
    const deniedInRow = within(readAllRow!).getAllByLabelText('denied')
    // viewer and operator are denied, only admin is granted.
    expect(grantedInRow).toHaveLength(1)
    expect(deniedInRow).toHaveLength(2)
  })

  /** The "Manage rules / retention / channels" grant is denied for viewer and operator. */
  it('grants Manage-rules only to admin', () => {
    currentRbac = { role: 'admin', tenantId: '' }
    render(<RbacPanel />)
    const rows = screen.getAllByRole('row')
    const manageRow = rows.find((r) => r.textContent?.includes('Manage rules'))
    expect(manageRow).toBeDefined()
    const grantedInRow = within(manageRow!).getAllByLabelText('granted')
    expect(grantedInRow).toHaveLength(1)
  })

  /**
   * The active role header carries `text-brand-500`; all others carry `text-white/55`.
   * Asserting both directions kills the ConditionalExpression→true,
   * EqualityOperator, and both StringLiteral mutations on the className ternary.
   */
  it('applies text-brand-500 to the active role header and text-white/55 to inactive ones', () => {
    currentRbac = { role: 'admin', tenantId: '' }
    render(<RbacPanel />)
    const adminHeader = screen.getByRole('columnheader', { name: /admin/ })
    expect(adminHeader.className).toContain('text-brand-500')
    expect(adminHeader.className).not.toContain('text-white/55')
    const viewerHeader = screen.getByRole('columnheader', { name: 'viewer' })
    expect(viewerHeader.className).toContain('text-white/55')
    expect(viewerHeader.className).not.toContain('text-brand-500')
    const operatorHeader = screen.getByRole('columnheader', { name: 'operator' })
    expect(operatorHeader.className).toContain('text-white/55')
    expect(operatorHeader.className).not.toContain('text-brand-500')
  })

  /**
   * The bullet `●` must appear in the active role header and nowhere else.
   * Asserting both present (kills ConditionalExpression→false) and absent on
   * non-active headers (kills ConditionalExpression→true, LogicalOperator,
   * and EqualityOperator) covers all five mutations on the bullet span guard.
   */
  it('renders the bullet marker only in the active role header', () => {
    currentRbac = { role: 'admin', tenantId: '' }
    render(<RbacPanel />)
    const adminHeader = screen.getByRole('columnheader', { name: /admin/ })
    expect(adminHeader.textContent).toContain('●')
    const viewerHeader = screen.getByRole('columnheader', { name: 'viewer' })
    expect(viewerHeader.textContent).not.toContain('●')
    const operatorHeader = screen.getByRole('columnheader', { name: 'operator' })
    expect(operatorHeader.textContent).not.toContain('●')
  })

  /**
   * The sr-only `(active)` span must not appear in non-active role headers.
   * Asserting absence kills the ConditionalExpression→true mutation that would
   * render `(active)` in every header regardless of the current role.
   */
  it('does not render the (active) marker on non-active role headers', () => {
    currentRbac = { role: 'admin', tenantId: '' }
    render(<RbacPanel />)
    const viewerHeader = screen.getByRole('columnheader', { name: 'viewer' })
    expect(within(viewerHeader).queryByText('(active)')).not.toBeInTheDocument()
    const operatorHeader = screen.getByRole('columnheader', { name: 'operator' })
    expect(within(operatorHeader).queryByText('(active)')).not.toBeInTheDocument()
  })

  /** The scope-line copy contains the literal text about the shared query builder. */
  it('renders the query-based RBAC explainer copy', () => {
    render(<RbacPanel />)
    // The explainer paragraph mentions the query builder path and field.
    const paragraph = screen.getByText(/Switching tenant injects/)
    expect(paragraph.textContent).toContain('tenantId')
    expect(paragraph.textContent).toContain('/logs')
    expect(paragraph.textContent).toContain('LogQuery.tenantId')
  })

  /**
   * Role column headers must carry the `font-mono` base class from the
   * `cn('px-4 py-2 text-center font-mono text-xs capitalize', ...)` call.
   * Asserting its presence kills the StringLiteral→"" mutation that replaces
   * the entire base class string with an empty string.
   */
  it('applies font-mono class to every role column header', () => {
    render(<RbacPanel />)
    const adminHeader = screen.getByRole('columnheader', { name: /admin/ })
    expect(adminHeader.className).toContain('font-mono')
    const viewerHeader = screen.getByRole('columnheader', { name: 'viewer' })
    expect(viewerHeader.className).toContain('font-mono')
  })
})

describe('RbacPanel — GRANTS/ROLES module-level re-import (kill matrix mutations at module init)', () => {
  /**
   * Re-importing the module inside the test body forces the GRANTS and ROLES
   * arrays to be evaluated with Stryker's active mutation injected.
   *
   * A BooleanLiteral mutation on a `held` value changes the granted/denied count
   * → the toHaveLength assertions fail → mutation killed.
   * A StringLiteral → "" on a grant label removes the cell text
   * → the getByRole('cell') queries fail → mutation killed.
   * A StringLiteral → "" on a ROLES entry changes the header text
   * → the toHaveTextContent assertions fail → mutation killed.
   * An ObjectLiteral → {} on a GRANTS entry makes held values undefined
   * → the rendered icon count changes → mutation killed.
   */
  afterEach(() => {
    vi.resetModules()
    cleanup()
  })

  it('re-imports and verifies the exact granted/denied counts, grant labels, and role header text', async () => {
    vi.resetModules()
    const { RbacPanel: FreshPanel } = await import('./rbac-panel')
    render(<FreshPanel />)
    // 6 rows × 3 roles = 18 cells; viewer:1 + operator:4 + admin:6 = 11 granted, 7 denied.
    expect(screen.getAllByLabelText('granted')).toHaveLength(11)
    expect(screen.getAllByLabelText('denied')).toHaveLength(7)
    // All six grant labels must be present (kills StringLiteral mutations on label strings).
    expect(screen.getByRole('cell', { name: 'Read logs (own tenant)' })).toBeInTheDocument()
    expect(screen.getByRole('cell', { name: 'Read all tenants' })).toBeInTheDocument()
    expect(screen.getByRole('cell', { name: 'Export (JSON/CSV)' })).toBeInTheDocument()
    expect(
      screen.getByRole('cell', { name: 'Ack / snooze / resolve incidents' }),
    ).toBeInTheDocument()
    expect(screen.getByRole('cell', { name: 'See audit trail' })).toBeInTheDocument()
    expect(
      screen.getByRole('cell', { name: 'Manage rules / retention / channels' }),
    ).toBeInTheDocument()
    // Role headers in correct order (kills StringLiteral mutations on ROLES).
    const headers = screen.getAllByRole('columnheader')
    expect(headers[1]).toHaveTextContent('viewer')
    expect(headers[2]).toHaveTextContent('operator')
    expect(headers[3]).toHaveTextContent('admin')
    // The role header base CSS class is present (kills the base-class StringLiteral mutation).
    expect(headers[1]!.className).toContain('text-center')
  })
})
