/**
 * @fileoverview Component tests for {@link RuleForm} — the RBAC submit gate, the
 * logKey-validity guard, the happy-path create payload, the error toast, channel
 * selection, preset/draft editing, the duration-validity guards, and the
 * in-flight (`Saving…`) state.
 *
 * The TanStack Query layer is real (wrapped in a per-test `QueryClientProvider`);
 * the network boundary (`@/lib/alerts-api`), the RBAC identity (`@/hooks/use-rbac`),
 * and the toast portal (`sonner`) are mocked so each test drives one behaviour.
 *
 * @module components/alerts/rule-form.test
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import type { ReactElement } from 'react'

import type { NotificationChannel } from '@/lib/alerts-api'
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
  // Radix Select calls the Pointer Capture API on open/close; jsdom omits it.
  // Stub the trio locally so the dropdown can open under test.
  Element.prototype.hasPointerCapture = (): boolean => false
  Element.prototype.setPointerCapture = (): void => {}
  Element.prototype.releasePointerCapture = (): void => {}
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

  /** A non-Error rejection still toasts, with an undefined description (the ternary's else). */
  it('omits the description when createRule rejects with a non-Error', async () => {
    createRuleMock.mockRejectedValue('plain string failure')
    const user = userEvent.setup()
    renderWithClient(<RuleForm />)
    await user.click(screen.getByRole('button', { name: 'Create rule' }))
    await waitFor(() =>
      expect(toastErrorMock).toHaveBeenCalledWith('Could not create rule', {
        description: undefined,
      }),
    )
  })

  /** On a successful create the parent `onCreated` callback fires (the optional chain). */
  it('invokes onCreated after a successful create', async () => {
    createRuleMock.mockResolvedValue({ id: 'r1' })
    const onCreated = vi.fn()
    const user = userEvent.setup()
    renderWithClient(<RuleForm onCreated={onCreated} />)
    await user.click(screen.getByRole('button', { name: 'Create rule' }))
    await waitFor(() => expect(onCreated).toHaveBeenCalledTimes(1))
  })

  /** While the mutation is in flight the button shows `Saving…` and is disabled. */
  it('shows the saving state while the create is pending', async () => {
    let resolveCreate: ((value: unknown) => void) | undefined
    createRuleMock.mockReturnValue(
      new Promise((resolve) => {
        resolveCreate = resolve
      }),
    )
    const user = userEvent.setup()
    renderWithClient(<RuleForm />)
    await user.click(screen.getByRole('button', { name: 'Create rule' }))
    const saving = await screen.findByRole('button', { name: 'Saving…' })
    expect(saving).toBeDisabled()
    resolveCreate?.({ id: 'r1' })
    await waitFor(() => expect(toastSuccessMock).toHaveBeenCalled())
  })

  /** An empty name blocks submission (the `name.trim() === ''` guard). */
  it('blocks createRule when the name is cleared', async () => {
    const user = userEvent.setup()
    renderWithClient(<RuleForm />)
    await user.clear(screen.getByLabelText('Name'))
    await user.click(screen.getByRole('button', { name: 'Create rule' }))
    expect(createRuleMock).not.toHaveBeenCalled()
  })

  /** Editing the name field flows through `update` into the built payload. */
  it('persists an edited name and disables the submit when the window is invalid', async () => {
    const user = userEvent.setup()
    renderWithClient(<RuleForm />)
    const name = screen.getByLabelText('Name')
    await user.clear(name)
    await user.type(name, 'My custom rule')
    // An invalid duration literal must disable submit (the isInvalid gate) and
    // mark the field as invalid for assistive tech.
    const windowField = screen.getByLabelText('Window')
    await user.clear(windowField)
    await user.type(windowField, 'nope')
    expect(windowField).toHaveAttribute('aria-invalid', 'true')
    expect(screen.getByRole('button', { name: 'Create rule' })).toBeDisabled()
  })

  /** An invalid `for` sustain duration likewise marks the field and gates submit. */
  it('flags an invalid for-duration and disables submit', async () => {
    const user = userEvent.setup()
    renderWithClient(<RuleForm />)
    const forField = screen.getByLabelText('For')
    await user.clear(forField)
    await user.type(forField, 'soon')
    expect(forField).toHaveAttribute('aria-invalid', 'true')
    expect(screen.getByRole('button', { name: 'Create rule' })).toBeDisabled()
  })

  /** A blank threshold input coerces to 0 (the `Number(...) || 0` fallback). */
  it('coerces a cleared threshold to zero in the payload', async () => {
    createRuleMock.mockResolvedValue({ id: 'r1' })
    const user = userEvent.setup()
    renderWithClient(<RuleForm />)
    await user.clear(screen.getByLabelText('Threshold'))
    await user.click(screen.getByRole('button', { name: 'Create rule' }))
    await waitFor(() => expect(createRuleMock).toHaveBeenCalledTimes(1))
    expect(createRuleMock.mock.calls[0]?.[0]).toMatchObject({ threshold: 0 })
  })

  /** Applying the heartbeat preset replaces the draft, reflected in the YAML preview. */
  it('applies a preset draft and reflects it in the payload', async () => {
    createRuleMock.mockResolvedValue({ id: 'r1' })
    const user = userEvent.setup()
    renderWithClient(<RuleForm />)
    await user.click(screen.getByRole('button', { name: 'Any FATAL' }))
    expect(screen.getByLabelText('Name')).toHaveValue('Any fatal log')
    await user.click(screen.getByRole('button', { name: 'Create rule' }))
    await waitFor(() => expect(createRuleMock).toHaveBeenCalledTimes(1))
    expect(createRuleMock.mock.calls[0]?.[0]).toMatchObject({
      name: 'Any fatal log',
      severity: 'critical',
    })
  })

  /** Toggling a level button off removes it; toggling a new level adds it (toggleLevel). */
  it('toggles level filters on and off in the built expr', async () => {
    createRuleMock.mockResolvedValue({ id: 'r1' })
    const user = userEvent.setup()
    renderWithClient(<RuleForm />)
    const levelGroup = screen.getByRole('group', { name: 'Levels' })
    // The error-spike default starts with error + fatal active — remove error,
    // add warn — so the expr's level set changes accordingly.
    await user.click(within(levelGroup).getByRole('button', { name: 'error' }))
    await user.click(within(levelGroup).getByRole('button', { name: 'warn' }))
    await user.click(screen.getByRole('button', { name: 'Create rule' }))
    await waitFor(() => expect(createRuleMock).toHaveBeenCalledTimes(1))
    expect(createRuleMock.mock.calls[0]?.[0]).toMatchObject({
      expr: 'count(level in {fatal,warn}) by logKey over 5m > 10',
    })
  })

  /** Editing the logKey + toggling aggregate flows through `update` into the expr. */
  it('includes a valid logKey and the aggregate toggle in the expr', async () => {
    createRuleMock.mockResolvedValue({ id: 'r1' })
    const user = userEvent.setup()
    renderWithClient(<RuleForm />)
    await user.type(screen.getByLabelText('logKey (optional)'), 'PAYMENT_CHARGE_FAILED')
    // Turn the default aggregate-by-logKey off so the `by logKey` suffix drops.
    await user.click(screen.getByRole('checkbox', { name: /Aggregate by logKey/ }))
    await user.click(screen.getByRole('button', { name: 'Create rule' }))
    await waitFor(() => expect(createRuleMock).toHaveBeenCalledTimes(1))
    expect(createRuleMock.mock.calls[0]?.[0]).toMatchObject({
      expr: 'count(level in {error,fatal} and PAYMENT_CHARGE_FAILED) over 5m > 10',
    })
  })

  /** Changing a Select (severity) routes through `update` and lands in the payload. */
  it('updates the severity via the select and submits it', async () => {
    createRuleMock.mockResolvedValue({ id: 'r1' })
    // Radix Select's pointer gating cannot be satisfied in jsdom; skip the check.
    const user = userEvent.setup({ pointerEventsCheck: 0 })
    renderWithClient(<RuleForm />)
    await user.click(screen.getByRole('combobox', { name: 'Severity' }))
    const listbox = await screen.findByRole('listbox')
    await user.click(within(listbox).getByRole('option', { name: 'warning' }))
    await user.click(screen.getByRole('button', { name: 'Create rule' }))
    await waitFor(() => expect(createRuleMock).toHaveBeenCalledTimes(1))
    expect(createRuleMock.mock.calls[0]?.[0]).toMatchObject({ severity: 'warning' })
  })

  /** Changing the metric + comparator selects routes through `update` into the expr. */
  it('updates metric and comparator via their selects', async () => {
    createRuleMock.mockResolvedValue({ id: 'r1' })
    const user = userEvent.setup({ pointerEventsCheck: 0 })
    renderWithClient(<RuleForm />)
    await user.click(screen.getByRole('combobox', { name: 'Metric' }))
    const metricList = await screen.findByRole('listbox')
    await user.click(within(metricList).getByRole('option', { name: 'rate' }))
    await user.click(screen.getByRole('combobox', { name: 'Comparator' }))
    const comparatorList = await screen.findByRole('listbox')
    await user.click(within(comparatorList).getByRole('option', { name: '>=' }))
    await user.click(screen.getByRole('button', { name: 'Create rule' }))
    await waitFor(() => expect(createRuleMock).toHaveBeenCalledTimes(1))
    expect(createRuleMock.mock.calls[0]?.[0]).toMatchObject({
      expr: 'rate(level in {error,fatal}) by logKey over 5m >= 10',
    })
  })

  /** When channels are returned, the group renders and selections reach the payload. */
  it('renders channel toggles and submits the selected channel ids', async () => {
    const channels: NotificationChannel[] = [
      {
        id: 'slack-ops',
        type: 'slack',
        name: 'Ops Slack',
        endpoint: 'https://hooks.slack.com/xxxx',
        severities: ['critical'],
      },
      {
        id: 'page-oncall',
        type: 'webhook',
        name: 'On-call webhook',
        endpoint: 'https://example.com/hook',
        severities: ['critical', 'warning'],
      },
    ]
    listChannelsMock.mockResolvedValue(channels)
    createRuleMock.mockResolvedValue({ id: 'r1' })
    const user = userEvent.setup()
    renderWithClient(<RuleForm />)
    // The group renders once the editor channels query resolves.
    const channelGroup = await screen.findByRole('group', { name: 'Notify channels' })
    await user.click(within(channelGroup).getByRole('checkbox', { name: 'Ops Slack' }))
    await user.click(within(channelGroup).getByRole('checkbox', { name: 'On-call webhook' }))
    // Toggling the first one off again proves the remove branch of toggleChannel.
    await user.click(within(channelGroup).getByRole('checkbox', { name: 'Ops Slack' }))
    await user.click(screen.getByRole('button', { name: 'Create rule' }))
    await waitFor(() => expect(createRuleMock).toHaveBeenCalledTimes(1))
    expect(createRuleMock.mock.calls[0]?.[0]).toMatchObject({ channels: ['page-oncall'] })
  })

  /** Applying a preset clears any previously selected channels (the reset path). */
  it('clears selected channels when a preset is applied', async () => {
    const channels: NotificationChannel[] = [
      {
        id: 'slack-ops',
        type: 'slack',
        name: 'Ops Slack',
        endpoint: 'https://hooks.slack.com/xxxx',
        severities: ['critical'],
      },
    ]
    listChannelsMock.mockResolvedValue(channels)
    createRuleMock.mockResolvedValue({ id: 'r1' })
    const user = userEvent.setup()
    renderWithClient(<RuleForm />)
    const channelGroup = await screen.findByRole('group', { name: 'Notify channels' })
    const slack = within(channelGroup).getByRole('checkbox', { name: 'Ops Slack' })
    await user.click(slack)
    expect(slack).toBeChecked()
    await user.click(screen.getByRole('button', { name: 'Any FATAL' }))
    expect(within(channelGroup).getByRole('checkbox', { name: 'Ops Slack' })).not.toBeChecked()
    await user.click(screen.getByRole('button', { name: 'Create rule' }))
    await waitFor(() => expect(createRuleMock).toHaveBeenCalledTimes(1))
    expect(createRuleMock.mock.calls[0]?.[0]).toMatchObject({ channels: [] })
  })

  /** Viewers never fetch channels, so the channel group is never rendered. */
  it('does not render channel toggles for a viewer', async () => {
    currentRole = 'viewer'
    renderWithClient(<RuleForm />)
    await waitFor(() => expect(screen.getByRole('button', { name: 'Create rule' })).toBeDisabled())
    expect(listChannelsMock).not.toHaveBeenCalled()
    expect(screen.queryByRole('group', { name: 'Notify channels' })).not.toBeInTheDocument()
  })
})
