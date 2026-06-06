/**
 * @fileoverview Component tests for {@link RuleList} — the existing-rules table
 * and its per-row enable/disable toggle.
 *
 * The TanStack Query layer is real (per-test `QueryClientProvider`); the network
 * boundary (`@/lib/alerts-api`), the RBAC identity (`@/hooks/use-rbac`), and the
 * toast portal (`sonner`) are mocked. Each test drives one branch: loading,
 * error, empty, the rendered table, the viewer read-only gate, and the toggle's
 * success / error / per-row-pending paths.
 *
 * @module components/alerts/rule-list.test
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import type { ReactElement } from 'react'

import type { AlertRule } from '@/lib/alerts-api'
import type { RbacContext, RbacRole } from '@/lib/types'

/** Mutable role the mocked `useRbac` returns; flipped per test before render. */
let currentRole: RbacRole = 'admin'

vi.mock('@/hooks/use-rbac', () => ({
  useRbac: (): RbacContext => ({ role: currentRole, tenantId: '' }),
}))

const listRulesMock = vi.fn<(rbac: unknown) => Promise<AlertRule[]>>()
const updateRuleMock = vi.fn<(id: string, input: unknown, rbac: unknown) => Promise<unknown>>()

vi.mock('@/lib/alerts-api', () => ({
  listRules: listRulesMock,
  updateRule: updateRuleMock,
}))

const toastSuccessMock = vi.fn<(message: string, options?: unknown) => void>()
const toastErrorMock = vi.fn<(message: string, options?: unknown) => void>()

vi.mock('sonner', () => ({
  toast: { success: toastSuccessMock, error: toastErrorMock },
}))

// Imported after the mocks so the component binds the mocked modules.
const { RuleList } = await import('./rule-list')

/** A persisted rule fixture; override fields per test. */
function makeRule(overrides: Partial<AlertRule> = {}): AlertRule {
  return {
    id: 'r1',
    name: 'Error spike',
    expr: 'count(level in {error}) by logKey over 5m > 10',
    threshold: 10,
    forDuration: '2m',
    severity: 'critical',
    isEnabled: true,
    channels: [],
    createdAt: '2026-01-01T00:00:00.000Z',
    ...overrides,
  }
}

/** Wrap a tree in a fresh QueryClient (retries off so failures surface at once). */
function renderWithClient(ui: ReactElement): void {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  render(<QueryClientProvider client={queryClient}>{ui}</QueryClientProvider>)
}

beforeEach(() => {
  currentRole = 'admin'
  listRulesMock.mockReset()
  updateRuleMock.mockReset()
  toastSuccessMock.mockReset()
  toastErrorMock.mockReset()
})

afterEach(() => {
  cleanup()
  vi.clearAllMocks()
})

describe('RuleList', () => {
  /** While the rules query is in flight the loading note shows (isLoading branch). */
  it('shows the loading note while the query is pending', () => {
    listRulesMock.mockReturnValue(new Promise(() => {}))
    renderWithClient(<RuleList />)
    expect(screen.getByText('Loading rules…')).toBeInTheDocument()
  })

  /** A rejected rules query surfaces the error note (isError branch). */
  it('shows the error note when the query rejects', async () => {
    listRulesMock.mockRejectedValue(new Error('boom'))
    renderWithClient(<RuleList />)
    expect(await screen.findByText('Failed to load rules.')).toBeInTheDocument()
  })

  /** An empty result set shows the "no rules" note (empty branch). */
  it('shows the empty note when there are no rules', async () => {
    listRulesMock.mockResolvedValue([])
    renderWithClient(<RuleList />)
    expect(await screen.findByText('No rules yet.')).toBeInTheDocument()
  })

  /** A populated result renders a row with the rule columns and an enabled badge. */
  it('renders a row with the enabled rule and a Disable action', async () => {
    listRulesMock.mockResolvedValue([makeRule({ isEnabled: true })])
    renderWithClient(<RuleList />)
    expect(await screen.findByText('Error spike')).toBeInTheDocument()
    expect(screen.getByText('2m')).toBeInTheDocument()
    expect(screen.getByText('critical')).toBeInTheDocument()
    expect(screen.getByText('enabled')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Disable' })).toBeInTheDocument()
  })

  /** A disabled, warning-severity rule renders the Enable action and warning badge. */
  it('renders a disabled warning rule with an Enable action', async () => {
    listRulesMock.mockResolvedValue([makeRule({ isEnabled: false, severity: 'warning' })])
    renderWithClient(<RuleList />)
    expect(await screen.findByText('disabled')).toBeInTheDocument()
    expect(screen.getByText('warning')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Enable' })).toBeInTheDocument()
  })

  /** Viewers may read the table but the toggle is disabled (canEdit gate). */
  it('disables the toggle for a viewer', async () => {
    currentRole = 'viewer'
    listRulesMock.mockResolvedValue([makeRule()])
    renderWithClient(<RuleList />)
    expect(await screen.findByRole('button', { name: 'Disable' })).toBeDisabled()
  })

  /** A successful toggle calls updateRule with the flipped flag and shows no error. */
  it('toggles a rule and refreshes on success', async () => {
    listRulesMock.mockResolvedValue([makeRule({ isEnabled: true })])
    updateRuleMock.mockResolvedValue(makeRule({ isEnabled: false }))
    const user = userEvent.setup()
    renderWithClient(<RuleList />)
    await user.click(await screen.findByRole('button', { name: 'Disable' }))
    await waitFor(() => expect(updateRuleMock).toHaveBeenCalledTimes(1))
    expect(updateRuleMock.mock.calls[0]?.[0]).toBe('r1')
    expect(updateRuleMock.mock.calls[0]?.[1]).toEqual({ isEnabled: false })
    expect(toastErrorMock).not.toHaveBeenCalled()
  })

  /** A failed toggle surfaces the error toast (onError path) carrying the message. */
  it('shows an error toast when the toggle rejects', async () => {
    listRulesMock.mockResolvedValue([makeRule()])
    updateRuleMock.mockRejectedValue(new Error('nope'))
    const user = userEvent.setup()
    renderWithClient(<RuleList />)
    await user.click(await screen.findByRole('button', { name: 'Disable' }))
    await waitFor(() =>
      expect(toastErrorMock).toHaveBeenCalledWith('Could not update rule', { description: 'nope' }),
    )
  })

  /** A non-Error rejection still toasts, with an undefined description (the ?: branch). */
  it('toasts with no description when the rejection is not an Error', async () => {
    listRulesMock.mockResolvedValue([makeRule()])
    updateRuleMock.mockRejectedValue('plain string')
    const user = userEvent.setup()
    renderWithClient(<RuleList />)
    await user.click(await screen.findByRole('button', { name: 'Disable' }))
    await waitFor(() =>
      expect(toastErrorMock).toHaveBeenCalledWith('Could not update rule', {
        description: undefined,
      }),
    )
  })

  /** Only the in-flight row goes busy (aria-busy), proving the per-row pending guard. */
  it('marks only the toggled row busy while its mutation is in flight', async () => {
    listRulesMock.mockResolvedValue([
      makeRule({ id: 'r1', name: 'First rule' }),
      makeRule({ id: 'r2', name: 'Second rule' }),
    ])
    let resolveUpdate: (value: AlertRule) => void = () => {}
    updateRuleMock.mockReturnValue(
      new Promise<AlertRule>((resolve) => {
        resolveUpdate = resolve
      }),
    )
    const user = userEvent.setup()
    renderWithClient(<RuleList />)
    await screen.findByText('First rule')

    const firstRow = screen.getByText('First rule').closest('tr')!
    const secondRow = screen.getByText('Second rule').closest('tr')!
    await user.click(within(firstRow).getByRole('button', { name: 'Disable' }))

    await waitFor(() => expect(firstRow).toHaveAttribute('aria-busy', 'true'))
    // The other row never enters the busy state — its pendingId never matched.
    expect(secondRow).toHaveAttribute('aria-busy', 'false')
    expect(within(firstRow).getByRole('button', { name: 'Disable' })).toBeDisabled()

    resolveUpdate(makeRule({ id: 'r1', isEnabled: false }))
    await waitFor(() => expect(firstRow).toHaveAttribute('aria-busy', 'false'))
  })
})
