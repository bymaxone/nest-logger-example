/**
 * @fileoverview Component tests for {@link RuleForm} — the RBAC submit gate, the
 * logKey-validity guard, the happy-path create payload, and the error toast.
 *
 * The TanStack Query layer is real (wrapped in a per-test `QueryClientProvider`);
 * the network boundary (`@/lib/alerts-api`), the RBAC identity (`@/hooks/use-rbac`),
 * and the toast portal (`sonner`) are mocked so each test drives one behaviour.
 *
 * @module components/alerts/rule-form.test
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import type { ReactElement } from 'react'

import type { RbacContext, RbacRole } from '@/lib/types'

/** Mutable role the mocked `useRbac` returns; flipped per test before render. */
let currentRole: RbacRole = 'admin'

vi.mock('@/hooks/use-rbac', () => ({
  useRbac: (): RbacContext => ({ role: currentRole, tenantId: '' }),
}))

const createRuleMock = vi.fn<(input: unknown, rbac: unknown) => Promise<unknown>>()
const listChannelsMock = vi.fn<(rbac: unknown) => Promise<unknown>>()

vi.mock('@/lib/alerts-api', () => ({
  createRule: createRuleMock,
  listChannels: listChannelsMock,
}))

const toastSuccessMock = vi.fn<(message: string, options?: unknown) => void>()
const toastErrorMock = vi.fn<(message: string, options?: unknown) => void>()

vi.mock('sonner', () => ({
  toast: { success: toastSuccessMock, error: toastErrorMock },
}))

// Imported after the mocks so the component binds the mocked modules.
const { RuleForm } = await import('./rule-form')

/** Wrap a tree in a fresh QueryClient (retries off so failures surface at once). */
function renderWithClient(ui: ReactElement): void {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  render(<QueryClientProvider client={queryClient}>{ui}</QueryClientProvider>)
}

beforeEach(() => {
  currentRole = 'admin'
  listChannelsMock.mockResolvedValue([])
  createRuleMock.mockReset()
  toastSuccessMock.mockReset()
  toastErrorMock.mockReset()
})

afterEach(() => {
  cleanup()
  vi.clearAllMocks()
})

describe('RuleForm', () => {
  /** A viewer cannot author rules — the submit button must be disabled. */
  it('disables submit for a viewer', () => {
    currentRole = 'viewer'
    renderWithClient(<RuleForm />)
    expect(screen.getByRole('button', { name: 'Create rule' })).toBeDisabled()
    expect(screen.getByText('Viewers cannot create rules')).toBeInTheDocument()
  })

  /** An invalid logKey must block the create mutation (guards bad input). */
  it('blocks createRule when the logKey is invalid', async () => {
    const user = userEvent.setup()
    renderWithClient(<RuleForm />)
    await user.type(screen.getByLabelText('logKey (optional)'), 'not a key')
    await user.click(screen.getByRole('button', { name: 'Create rule' }))
    expect(createRuleMock).not.toHaveBeenCalled()
  })

  /** A valid default draft submits the expected create payload exactly once. */
  it('calls createRule with the built payload on a valid submit', async () => {
    createRuleMock.mockResolvedValue({ id: 'r1' })
    const user = userEvent.setup()
    renderWithClient(<RuleForm />)
    await user.click(screen.getByRole('button', { name: 'Create rule' }))
    await waitFor(() => expect(createRuleMock).toHaveBeenCalledTimes(1))
    const payload = createRuleMock.mock.calls[0]?.[0]
    expect(payload).toMatchObject({
      name: 'Error spike by logKey',
      expr: 'count(level in {error,fatal}) by logKey over 5m > 10',
      threshold: 10,
      forDuration: '2m',
      severity: 'critical',
      channels: [],
    })
    await waitFor(() => expect(toastSuccessMock).toHaveBeenCalled())
  })

  /** A failed create surfaces the error toast (the onError path). */
  it('shows an error toast when createRule rejects', async () => {
    createRuleMock.mockRejectedValue(new Error('boom'))
    const user = userEvent.setup()
    renderWithClient(<RuleForm />)
    await user.click(screen.getByRole('button', { name: 'Create rule' }))
    await waitFor(() =>
      expect(toastErrorMock).toHaveBeenCalledWith('Could not create rule', { description: 'boom' }),
    )
    expect(toastSuccessMock).not.toHaveBeenCalled()
  })
})
