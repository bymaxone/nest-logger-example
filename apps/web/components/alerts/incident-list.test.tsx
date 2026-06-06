/**
 * @fileoverview Component tests for {@link IncidentList} — the PagerDuty-style
 * lifecycle table with state-gated, RBAC-gated transitions.
 *
 * The TanStack Query layer is real (per-test `QueryClientProvider`); the network
 * boundary (`@/lib/alerts-api`), the RBAC identity (`@/hooks/use-rbac`), the
 * `next/link` chrome, and the toast portal (`sonner`) are mocked. Each test
 * drives one branch: loading / error / empty, the rendered row + deep-link, the
 * acknowledge / snooze / resolve actions, the per-status action gating, the
 * viewer gate, the per-row pending guard, and the transition error toast.
 *
 * @module components/alerts/incident-list.test
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import type { AnchorHTMLAttributes, ReactElement } from 'react'

import type { Incident } from '@/lib/alerts-api'
import type { RbacContext, RbacRole } from '@/lib/types'

/** Mutable role the mocked `useRbac` returns; flipped per test before render. */
let currentRole: RbacRole = 'admin'

vi.mock('@/hooks/use-rbac', () => ({
  useRbac: (): RbacContext => ({ role: currentRole, tenantId: '' }),
}))

// `next/link` renders a plain anchor so the deep-link href is assertable.
vi.mock('next/link', () => ({
  default: ({ children, href, ...rest }: AnchorHTMLAttributes<HTMLAnchorElement>) => (
    <a href={typeof href === 'string' ? href : ''} {...rest}>
      {children}
    </a>
  ),
}))

const listIncidentsMock = vi.fn<(rbac: unknown) => Promise<Incident[]>>()
const transitionIncidentMock =
  vi.fn<(id: string, action: string, rbac: unknown, snooze?: string) => Promise<unknown>>()

vi.mock('@/lib/alerts-api', () => ({
  listIncidents: listIncidentsMock,
  transitionIncident: transitionIncidentMock,
}))

const toastErrorMock = vi.fn<(message: string, options?: unknown) => void>()

vi.mock('sonner', () => ({
  toast: { error: toastErrorMock },
}))

// Imported after the mocks so the component binds the mocked modules.
const { IncidentList } = await import('./incident-list')

/** An incident fixture; override fields per test. */
function makeIncident(overrides: Partial<Incident> = {}): Incident {
  return {
    id: 'i1',
    ruleId: 'r1',
    status: 'triggered',
    logKey: 'ORDER_FAILED',
    openedAt: '2026-01-01T10:00:00.000Z',
    resolvedAt: null,
    timeline: [{ actor: 'cron', action: 'opened', at: '2026-01-01T10:00:00.000Z' }],
    rule: {
      id: 'r1',
      name: 'Error spike',
      expr: 'count(level in {error}) by logKey over 5m > 10',
      threshold: 10,
      forDuration: '2m',
      severity: 'critical',
      isEnabled: true,
      channels: [],
      createdAt: '2026-01-01T00:00:00.000Z',
    },
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
  listIncidentsMock.mockReset()
  transitionIncidentMock.mockReset()
  toastErrorMock.mockReset()
})

afterEach(() => {
  cleanup()
  vi.clearAllMocks()
})

describe('IncidentList', () => {
  /** While the incidents query is in flight the loading note shows (isLoading branch). */
  it('shows the loading note while the query is pending', () => {
    listIncidentsMock.mockReturnValue(new Promise(() => {}))
    renderWithClient(<IncidentList />)
    expect(screen.getByText('Loading incidents…')).toBeInTheDocument()
  })

  /** A rejected incidents query surfaces the error note (isError branch). */
  it('shows the error note when the query rejects', async () => {
    listIncidentsMock.mockRejectedValue(new Error('boom'))
    renderWithClient(<IncidentList />)
    expect(await screen.findByText('Failed to load incidents.')).toBeInTheDocument()
  })

  /** An empty list shows the "no incidents" guidance (empty branch). */
  it('shows the empty note when there are no incidents', async () => {
    listIncidentsMock.mockResolvedValue([])
    renderWithClient(<IncidentList />)
    expect(await screen.findByText(/No incidents\. As admin, create a rule/)).toBeInTheDocument()
  })

  /** A triggered incident renders its rule name, logKey badge, and Explorer deep-link. */
  it('renders a triggered incident with its rule name and an Explorer deep-link', async () => {
    listIncidentsMock.mockResolvedValue([makeIncident()])
    renderWithClient(<IncidentList />)
    expect(await screen.findByText('Error spike')).toBeInTheDocument()
    expect(screen.getByText('ORDER_FAILED')).toBeInTheDocument()
    const link = screen.getByRole('link', { name: /View in Explorer/ })
    // The deep-link carries the incident logKey and its opened-at window start.
    expect(link).toHaveAttribute('href', expect.stringContaining('logKey=ORDER_FAILED'))
    expect(link).toHaveAttribute(
      'href',
      expect.stringContaining(`from=${encodeURIComponent('2026-01-01T10:00:00.000Z')}`),
    )
  })

  /** A triggered incident enables Acknowledge / Snooze / Resolve (the open-state gate). */
  it('enables all three actions for a triggered incident', async () => {
    listIncidentsMock.mockResolvedValue([makeIncident({ status: 'triggered' })])
    renderWithClient(<IncidentList />)
    expect(await screen.findByRole('button', { name: 'Acknowledge' })).toBeEnabled()
    expect(screen.getByRole('button', { name: /Snooze/ })).toBeEnabled()
    expect(screen.getByRole('button', { name: 'Resolve' })).toBeEnabled()
  })

  /** Acknowledge fires the acknowledge transition for the row's incident id. */
  it('dispatches the acknowledge transition', async () => {
    listIncidentsMock.mockResolvedValue([makeIncident({ status: 'triggered' })])
    transitionIncidentMock.mockResolvedValue(makeIncident({ status: 'acknowledged' }))
    const user = userEvent.setup()
    renderWithClient(<IncidentList />)
    await user.click(await screen.findByRole('button', { name: 'Acknowledge' }))
    await waitFor(() => expect(transitionIncidentMock).toHaveBeenCalledTimes(1))
    expect(transitionIncidentMock.mock.calls[0]?.[0]).toBe('i1')
    expect(transitionIncidentMock.mock.calls[0]?.[1]).toBe('acknowledge')
  })

  /** Resolve fires the resolve transition (Resolve is offered until resolved). */
  it('dispatches the resolve transition', async () => {
    listIncidentsMock.mockResolvedValue([makeIncident({ status: 'triggered' })])
    transitionIncidentMock.mockResolvedValue(makeIncident({ status: 'resolved' }))
    const user = userEvent.setup()
    renderWithClient(<IncidentList />)
    await user.click(await screen.findByRole('button', { name: 'Resolve' }))
    await waitFor(() => expect(transitionIncidentMock).toHaveBeenCalledTimes(1))
    expect(transitionIncidentMock.mock.calls[0]?.[1]).toBe('resolve')
  })

  /** Snooze opens the duration menu and fires the snooze transition with the picked duration. */
  it('dispatches the snooze transition with the chosen duration', async () => {
    listIncidentsMock.mockResolvedValue([makeIncident({ status: 'triggered' })])
    transitionIncidentMock.mockResolvedValue(makeIncident({ status: 'snoozed' }))
    const user = userEvent.setup()
    renderWithClient(<IncidentList />)
    await user.click(await screen.findByRole('button', { name: /Snooze/ }))
    await user.click(await screen.findByRole('menuitem', { name: '4h' }))
    await waitFor(() => expect(transitionIncidentMock).toHaveBeenCalledTimes(1))
    expect(transitionIncidentMock.mock.calls[0]?.[1]).toBe('snooze')
    expect(transitionIncidentMock.mock.calls[0]?.[3]).toBe('4h')
  })

  /** An acknowledged incident gates Acknowledge off but keeps Snooze and Resolve. */
  it('gates actions for an acknowledged incident', async () => {
    listIncidentsMock.mockResolvedValue([makeIncident({ status: 'acknowledged' })])
    renderWithClient(<IncidentList />)
    expect(await screen.findByRole('button', { name: 'Acknowledge' })).toBeDisabled()
    expect(screen.getByRole('button', { name: /Snooze/ })).toBeEnabled()
    expect(screen.getByRole('button', { name: 'Resolve' })).toBeEnabled()
  })

  /** A resolved incident disables every action (the !== 'resolved' resolve gate). */
  it('disables all actions for a resolved incident', async () => {
    listIncidentsMock.mockResolvedValue([
      makeIncident({ status: 'resolved', resolvedAt: '2026-01-01T12:00:00.000Z' }),
    ])
    renderWithClient(<IncidentList />)
    expect(await screen.findByRole('button', { name: 'Acknowledge' })).toBeDisabled()
    expect(screen.getByRole('button', { name: /Snooze/ })).toBeDisabled()
    expect(screen.getByRole('button', { name: 'Resolve' })).toBeDisabled()
  })

  /** A snoozed incident shows its "snoozed until" hint and keeps the open-state actions. */
  it('renders the snoozed-until hint for a snoozed incident', async () => {
    const until = '2026-01-01T14:00:00.000Z'
    listIncidentsMock.mockResolvedValue([makeIncident({ status: 'snoozed', resolvedAt: until })])
    renderWithClient(<IncidentList />)
    expect(
      await screen.findByText(`snoozed until ${new Date(until).toLocaleString()}`),
    ).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Acknowledge' })).toBeEnabled()
  })

  /** Viewers cannot transition — every lifecycle action is disabled (RBAC gate). */
  it('disables all actions for a viewer', async () => {
    currentRole = 'viewer'
    listIncidentsMock.mockResolvedValue([makeIncident({ status: 'triggered' })])
    renderWithClient(<IncidentList />)
    expect(await screen.findByRole('button', { name: 'Acknowledge' })).toBeDisabled()
    expect(screen.getByRole('button', { name: /Snooze/ })).toBeDisabled()
    expect(screen.getByRole('button', { name: 'Resolve' })).toBeDisabled()
  })

  /** An incident with no rule and no logKey falls back to "Unknown rule" and a range link. */
  it('falls back to Unknown rule and a relative link when rule and logKey are absent', async () => {
    listIncidentsMock.mockResolvedValue([makeIncident({ rule: undefined, logKey: null })])
    renderWithClient(<IncidentList />)
    expect(await screen.findByText('Unknown rule')).toBeInTheDocument()
    // No logKey badge renders when logKey is null.
    expect(screen.queryByText('ORDER_FAILED')).not.toBeInTheDocument()
  })

  /** A failed transition surfaces the error toast carrying the Error message (onError). */
  it('shows an error toast when a transition rejects with an Error', async () => {
    listIncidentsMock.mockResolvedValue([makeIncident({ status: 'triggered' })])
    transitionIncidentMock.mockRejectedValue(new Error('conflict'))
    const user = userEvent.setup()
    renderWithClient(<IncidentList />)
    await user.click(await screen.findByRole('button', { name: 'Acknowledge' }))
    await waitFor(() =>
      expect(toastErrorMock).toHaveBeenCalledWith('Transition failed', { description: 'conflict' }),
    )
  })

  /** A non-Error transition rejection toasts with an undefined description (the ?: branch). */
  it('toasts with no description when a transition rejects with a non-Error', async () => {
    listIncidentsMock.mockResolvedValue([makeIncident({ status: 'triggered' })])
    transitionIncidentMock.mockRejectedValue('gateway')
    const user = userEvent.setup()
    renderWithClient(<IncidentList />)
    await user.click(await screen.findByRole('button', { name: 'Resolve' }))
    await waitFor(() =>
      expect(toastErrorMock).toHaveBeenCalledWith('Transition failed', { description: undefined }),
    )
  })

  /** Only the in-flight row blocks its actions, proving the per-row pending guard. */
  it('blocks only the in-flight row while its transition is pending', async () => {
    listIncidentsMock.mockResolvedValue([
      makeIncident({ id: 'i1', status: 'triggered' }),
      makeIncident({
        id: 'i2',
        status: 'triggered',
        logKey: 'PAYMENT_FAILED',
        rule: { ...makeIncident().rule!, id: 'r2', name: 'Latency spike' },
      }),
    ])
    let resolveTransition: (value: Incident) => void = () => {}
    transitionIncidentMock.mockReturnValue(
      new Promise<Incident>((resolve) => {
        resolveTransition = resolve
      }),
    )
    const user = userEvent.setup()
    renderWithClient(<IncidentList />)
    await screen.findByText('Error spike')

    const firstRow = screen.getByText('Error spike').closest('li')!
    const secondRow = screen.getByText('Latency spike').closest('li')!
    await user.click(within(firstRow).getByRole('button', { name: 'Acknowledge' }))

    // The acted row's buttons go disabled (rowPending); the other row stays interactive.
    await waitFor(() =>
      expect(within(firstRow).getByRole('button', { name: 'Acknowledge' })).toBeDisabled(),
    )
    expect(within(secondRow).getByRole('button', { name: 'Acknowledge' })).toBeEnabled()

    resolveTransition(makeIncident({ id: 'i1', status: 'acknowledged' }))
    await waitFor(() => expect(transitionIncidentMock).toHaveBeenCalledTimes(1))
  })
})
