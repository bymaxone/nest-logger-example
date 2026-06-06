/**
 * @fileoverview Component tests for {@link RetentionPanel} — the RBAC read gate,
 * the retention status query (loading / error / success), the admin TTL edit form
 * (validity guard, controlled value seeding, invalid-aria), the save mutation
 * (success toast + invalidate, error toast, pending button), and the viewer hint.
 *
 * The TanStack Query layer is real (wrapped in a per-test `QueryClientProvider`);
 * the RBAC identity (`@/hooks/use-rbac`), the network boundary
 * (`@/lib/maintenance-api`), and the toast portal (`sonner`) are mocked so each
 * test drives one behaviour.
 *
 * @module components/maintenance/retention-panel.test
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import type { ReactElement } from 'react'

import type { RbacContext, RbacRole } from '@/lib/types'
import type { RetentionStatus } from '@/lib/maintenance-api'

/** Mutable role the mocked `useRbac` returns; flipped per test before render. */
let currentRole: RbacRole = 'admin'

vi.mock('@/hooks/use-rbac', () => ({
  useRbac: (): RbacContext => ({ role: currentRole, tenantId: '' }),
}))

const getRetentionMock = vi.fn<(rbac: unknown) => Promise<RetentionStatus>>()
const updateRetentionMock = vi.fn<(days: number, rbac: unknown) => Promise<RetentionStatus>>()

vi.mock('@/lib/maintenance-api', () => ({
  getRetention: getRetentionMock,
  updateRetention: updateRetentionMock,
}))

const toastSuccessMock = vi.fn<(message: string, options?: unknown) => void>()
const toastErrorMock = vi.fn<(message: string, options?: unknown) => void>()

vi.mock('sonner', () => ({
  toast: { success: toastSuccessMock, error: toastErrorMock },
}))

// Imported after the mocks so the component binds the mocked modules.
const { RetentionPanel } = await import('./retention-panel')

/** Wrap a tree in a fresh QueryClient (retries off so failures surface at once). */
function renderWithClient(ui: ReactElement): QueryClient {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  render(<QueryClientProvider client={queryClient}>{ui}</QueryClientProvider>)
  return queryClient
}

/** A retention status with a known TTL window. */
function makeStatus(overrides: Partial<RetentionStatus> = {}): RetentionStatus {
  return {
    retentionDays: 30,
    nextSweep: '2026-06-06T00:00:00.000Z',
    pendingRows: 1234,
    ...overrides,
  }
}

beforeEach(() => {
  currentRole = 'admin'
  getRetentionMock.mockReset()
  updateRetentionMock.mockReset()
  toastSuccessMock.mockReset()
  toastErrorMock.mockReset()
  getRetentionMock.mockResolvedValue(makeStatus())
})

afterEach(() => {
  cleanup()
  vi.clearAllMocks()
})

describe('RetentionPanel', () => {
  /** A viewer cannot read maintenance settings — only the gate message renders. */
  it('renders the viewer gate and skips the retention query for a viewer', () => {
    currentRole = 'viewer'
    renderWithClient(<RetentionPanel />)
    expect(screen.getByText('Viewers cannot access maintenance settings.')).toBeInTheDocument()
    expect(getRetentionMock).not.toHaveBeenCalled()
  })

  /** While the status query is in flight, the loading hint shows. */
  it('shows the loading hint while the retention status query is in flight', async () => {
    let resolve!: (value: RetentionStatus) => void
    getRetentionMock.mockReturnValue(
      new Promise<RetentionStatus>((r) => {
        resolve = r
      }),
    )
    renderWithClient(<RetentionPanel />)
    expect(await screen.findByText('Loading…')).toBeInTheDocument()
    resolve(makeStatus())
  })

  /** A rejected status query surfaces the failure message. */
  it('shows the error message when the retention status query rejects', async () => {
    getRetentionMock.mockRejectedValue(new Error('down'))
    renderWithClient(<RetentionPanel />)
    expect(await screen.findByText('Failed to load retention status.')).toBeInTheDocument()
  })

  /** A successful status renders the TTL, next-sweep and pending-row figures. */
  it('renders the retention status figures on success', async () => {
    renderWithClient(<RetentionPanel />)
    expect(await screen.findByText('30 days')).toBeInTheDocument()
    expect(screen.getByText('1,234')).toBeInTheDocument()
    expect(screen.getByText('TTL')).toBeInTheDocument()
    expect(screen.getByText('Next sweep')).toBeInTheDocument()
    // The Loki read-only echo and the two-tier explainer always render for a reader.
    expect(screen.getByText('Loki retention (read-only)')).toBeInTheDocument()
    expect(screen.getByText('744h')).toBeInTheDocument()
    expect(screen.getByText(/Scoped demo of/)).toBeInTheDocument()
  })

  /** An operator may read but not edit — the viewer-style TTL hint renders instead. */
  it('shows the no-edit hint for a non-admin reader (operator)', async () => {
    currentRole = 'operator'
    renderWithClient(<RetentionPanel />)
    await screen.findByText('30 days')
    expect(screen.getByText('Only admins can change the TTL window.')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Update TTL' })).not.toBeInTheDocument()
  })

  /** Admin sees the TTL field seeded from the loaded status via the effect. */
  it('seeds the admin TTL field from the loaded status', async () => {
    renderWithClient(<RetentionPanel />)
    const field = await screen.findByLabelText('TTL (days)')
    await waitFor(() => expect(field).toHaveValue(30))
    expect(screen.getByRole('button', { name: 'Update TTL' })).toBeEnabled()
  })

  /** An out-of-bounds TTL disables save and marks the field invalid. */
  it('blocks save and marks the field invalid for an out-of-bounds TTL', async () => {
    const user = userEvent.setup()
    renderWithClient(<RetentionPanel />)
    const field = await screen.findByLabelText('TTL (days)')
    await waitFor(() => expect(field).toHaveValue(30))
    await user.clear(field)
    await user.type(field, '999')
    expect(field).toHaveAttribute('aria-invalid', 'true')
    expect(screen.getByRole('button', { name: 'Update TTL' })).toBeDisabled()
    expect(updateRetentionMock).not.toHaveBeenCalled()
  })

  /** A cleared field is "unset" (not invalid-flagged) but still disables save. */
  it('treats an empty TTL field as unset without flagging it invalid', async () => {
    const user = userEvent.setup()
    renderWithClient(<RetentionPanel />)
    const field = await screen.findByLabelText('TTL (days)')
    await waitFor(() => expect(field).toHaveValue(30))
    await user.clear(field)
    expect(field).toHaveAttribute('aria-invalid', 'false')
    expect(screen.getByRole('button', { name: 'Update TTL' })).toBeDisabled()
  })

  /** A valid save fires the mutation, shows the success toast and invalidates. */
  it('saves a valid TTL, toasts success and invalidates the query', async () => {
    updateRetentionMock.mockResolvedValue(makeStatus({ retentionDays: 60 }))
    const user = userEvent.setup()
    const client = renderWithClient(<RetentionPanel />)
    const invalidateSpy = vi.spyOn(client, 'invalidateQueries')
    const field = await screen.findByLabelText('TTL (days)')
    await waitFor(() => expect(field).toHaveValue(30))
    await user.clear(field)
    await user.type(field, '60')
    await user.click(screen.getByRole('button', { name: 'Update TTL' }))
    await waitFor(() => expect(updateRetentionMock).toHaveBeenCalledWith(60, expect.anything()))
    await waitFor(() => expect(toastSuccessMock).toHaveBeenCalledWith('Retention window updated'))
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ['retention'] })
  })

  /** A rejected save with an Error surfaces the error toast with its message. */
  it('toasts the error message when the save rejects with an Error', async () => {
    updateRetentionMock.mockRejectedValue(new Error('patch failed'))
    const user = userEvent.setup()
    renderWithClient(<RetentionPanel />)
    const field = await screen.findByLabelText('TTL (days)')
    await waitFor(() => expect(field).toHaveValue(30))
    await user.clear(field)
    await user.type(field, '45')
    await user.click(screen.getByRole('button', { name: 'Update TTL' }))
    await waitFor(() =>
      expect(toastErrorMock).toHaveBeenCalledWith('Could not update retention', {
        description: 'patch failed',
      }),
    )
    expect(toastSuccessMock).not.toHaveBeenCalled()
  })

  /** A non-Error rejection omits the description (the undefined branch). */
  it('toasts without a description when the save rejects with a non-Error', async () => {
    updateRetentionMock.mockRejectedValue('plain string')
    const user = userEvent.setup()
    renderWithClient(<RetentionPanel />)
    const field = await screen.findByLabelText('TTL (days)')
    await waitFor(() => expect(field).toHaveValue(30))
    await user.clear(field)
    await user.type(field, '45')
    await user.click(screen.getByRole('button', { name: 'Update TTL' }))
    await waitFor(() =>
      expect(toastErrorMock).toHaveBeenCalledWith('Could not update retention', {
        description: undefined,
      }),
    )
  })

  /** While the save is pending the button shows "Saving…" and is disabled. */
  it('shows the pending label and disables the button while saving', async () => {
    let resolveSave!: (value: RetentionStatus) => void
    updateRetentionMock.mockReturnValue(
      new Promise<RetentionStatus>((r) => {
        resolveSave = r
      }),
    )
    const user = userEvent.setup()
    renderWithClient(<RetentionPanel />)
    const field = await screen.findByLabelText('TTL (days)')
    await waitFor(() => expect(field).toHaveValue(30))
    await user.clear(field)
    await user.type(field, '50')
    await user.click(screen.getByRole('button', { name: 'Update TTL' }))
    const saving = await screen.findByRole('button', { name: 'Saving…' })
    expect(saving).toBeDisabled()
    resolveSave(makeStatus({ retentionDays: 50 }))
    await waitFor(() => expect(toastSuccessMock).toHaveBeenCalled())
  })
})
