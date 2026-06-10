/**
 * @fileoverview Component tests for {@link AuditTable} — the viewer RBAC gate,
 * the loading / error / empty branches, and the rendered rows (newest-first,
 * including the `tenantId === null` em-dash fallback).
 *
 * The TanStack Query layer is real (wrapped in a per-test `QueryClientProvider`);
 * the network boundary (`@/lib/maintenance-api`) and the RBAC identity
 * (`@/hooks/use-rbac`) are mocked so each test drives exactly one branch.
 *
 * @module components/maintenance/audit-table.test
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, render, screen, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import type { ReactElement } from 'react'

import type { RbacContext, RbacRole } from '@/lib/types'
import type { AuditEvent } from '@/lib/maintenance-api'

/** Mutable role the mocked `useRbac` returns; flipped per test before render. */
let currentRole: RbacRole = 'operator'

vi.mock('@/hooks/use-rbac', () => ({
  useRbac: (): RbacContext => ({ role: currentRole, tenantId: '' }),
}))

const getAuditEventsMock = vi.fn<(rbac: unknown) => Promise<AuditEvent[]>>()

vi.mock('@/lib/maintenance-api', () => ({
  getAuditEvents: getAuditEventsMock,
}))

// Imported after the mocks so the component binds the mocked modules.
const { AuditTable } = await import('./audit-table')

/** Wrap a tree in a fresh QueryClient (retries off so failures surface at once). */
function renderWithClient(ui: ReactElement): void {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  render(<QueryClientProvider client={queryClient}>{ui}</QueryClientProvider>)
}

beforeEach(() => {
  currentRole = 'operator'
  getAuditEventsMock.mockReset()
})

afterEach(() => {
  cleanup()
  vi.clearAllMocks()
})

describe('AuditTable', () => {
  /** A viewer cannot read the audit trail — the gate copy renders and no fetch fires. */
  it('shows the viewer gate and never calls the API for a viewer', () => {
    currentRole = 'viewer'
    renderWithClient(<AuditTable />)
    expect(screen.getByText('Viewers cannot access the audit trail.')).toBeInTheDocument()
    expect(getAuditEventsMock).not.toHaveBeenCalled()
  })

  /** While the query is in flight the loading copy is shown (the isLoading branch). */
  it('renders the loading state while the audit query is pending', () => {
    getAuditEventsMock.mockReturnValue(new Promise<AuditEvent[]>(() => {}))
    renderWithClient(<AuditTable />)
    expect(screen.getByText('Loading audit trail…')).toBeInTheDocument()
  })

  /** A rejected query surfaces the error copy (the isError branch). */
  it('renders the error state when the audit query rejects', async () => {
    getAuditEventsMock.mockRejectedValue(new Error('boom'))
    renderWithClient(<AuditTable />)
    expect(await screen.findByText('Failed to load the audit trail.')).toBeInTheDocument()
  })

  /** An empty result shows the empty-state copy, not a table (the length === 0 branch). */
  it('renders the empty state when there are no audit events', async () => {
    getAuditEventsMock.mockResolvedValue([])
    renderWithClient(<AuditTable />)
    expect(await screen.findByText('No audit events yet.')).toBeInTheDocument()
    expect(screen.queryByRole('table')).not.toBeInTheDocument()
  })

  /**
   * A populated result renders one row per event, covering both the present
   * `tenantId` and the `null` em-dash fallback, plus the header columns.
   */
  it('renders a row per audit event with the tenant em-dash fallback', async () => {
    getAuditEventsMock.mockResolvedValue([
      {
        id: 'a1',
        actor: 'alice@example.com',
        action: 'export.csv',
        target: 'logs-export.csv',
        tenantId: 'acme',
        at: '2026-01-02T03:04:05.000Z',
      },
      {
        id: 'a2',
        actor: 'bob@example.com',
        action: 'rule.create',
        target: 'Error spike',
        tenantId: null,
        at: '2026-01-02T04:05:06.000Z',
      },
    ])
    renderWithClient(<AuditTable />)

    expect(await screen.findByText('alice@example.com')).toBeInTheDocument()
    expect(screen.getByText('export.csv')).toBeInTheDocument()
    expect(screen.getByText('acme')).toBeInTheDocument()
    expect(screen.getByText('bob@example.com')).toBeInTheDocument()
    // The `null` tenant renders the em-dash placeholder.
    expect(screen.getByText('—')).toBeInTheDocument()

    // The header columns are present.
    expect(screen.getByRole('columnheader', { name: 'Actor' })).toBeInTheDocument()
    expect(screen.getByRole('columnheader', { name: 'Action' })).toBeInTheDocument()
    expect(screen.getByRole('columnheader', { name: 'Target' })).toBeInTheDocument()
    expect(screen.getByRole('columnheader', { name: 'Tenant' })).toBeInTheDocument()
    expect(screen.getByRole('columnheader', { name: 'At' })).toBeInTheDocument()

    await waitFor(() => expect(getAuditEventsMock).toHaveBeenCalledTimes(1))
  })

  /** The action cell text ('export.csv') and target text ('logs-export.csv') render verbatim. */
  it('renders the action and target values for each event', async () => {
    getAuditEventsMock.mockResolvedValue([
      {
        id: 'a1',
        actor: 'alice@example.com',
        action: 'rule.create',
        target: 'Error spike rule',
        tenantId: 'acme',
        at: '2026-01-02T03:04:05.000Z',
      },
    ])
    renderWithClient(<AuditTable />)
    expect(await screen.findByText('rule.create')).toBeInTheDocument()
    expect(screen.getByText('Error spike rule')).toBeInTheDocument()
  })
})
