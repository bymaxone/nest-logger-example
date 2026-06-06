/**
 * @fileoverview Component tests for {@link ChannelRegistry} — the channel list,
 * the admin-only create form, and the per-row test-fire action.
 *
 * The TanStack Query layer is real (per-test `QueryClientProvider`); the network
 * boundary (`@/lib/alerts-api`), the RBAC identity (`@/hooks/use-rbac`), and the
 * toast portal (`sonner`) are mocked. `maskEndpoint` is the real implementation
 * so the rendered, redacted endpoint is asserted. Each test drives one branch:
 * the viewer gate, loading / error / list rendering, create validation + success
 * + error, severity toggling, and the test-fire ok / failed / error paths.
 *
 * @module components/alerts/channel-registry.test
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import type { ReactElement } from 'react'

import type { NotificationChannel } from '@/lib/alerts-api'
import { maskEndpoint } from '@/lib/alerts-api'
import type { RbacContext, RbacRole } from '@/lib/types'

/** Mutable role the mocked `useRbac` returns; flipped per test before render. */
let currentRole: RbacRole = 'admin'

vi.mock('@/hooks/use-rbac', () => ({
  useRbac: (): RbacContext => ({ role: currentRole, tenantId: '' }),
}))

// Hoisted so the (also-hoisted) `vi.mock` factory can reference them — a value
// import of the mocked module evaluates the factory before const initializers run.
const { listChannelsMock, createChannelMock, testChannelMock } = vi.hoisted(() => ({
  listChannelsMock: vi.fn<(rbac: unknown) => Promise<NotificationChannel[]>>(),
  createChannelMock:
    vi.fn<(channel: unknown, rbac: unknown) => Promise<{ ok: boolean; channel: unknown }>>(),
  testChannelMock: vi.fn<(id: string, rbac: unknown) => Promise<{ ok: boolean }>>(),
}))

vi.mock('@/lib/alerts-api', async (orig) => {
  // Keep the real `maskEndpoint` so the redacted endpoint can be asserted from output.
  const actual = await orig<typeof import('@/lib/alerts-api')>()
  return {
    maskEndpoint: actual.maskEndpoint,
    listChannels: listChannelsMock,
    createChannel: createChannelMock,
    testChannel: testChannelMock,
  }
})

const toastSuccessMock = vi.fn<(message: string, options?: unknown) => void>()
const toastErrorMock = vi.fn<(message: string, options?: unknown) => void>()

vi.mock('sonner', () => ({
  toast: { success: toastSuccessMock, error: toastErrorMock },
}))

// Radix Select probes Pointer Events APIs jsdom lacks; stub them so the listbox
// opens under keyboard interaction (the documented Radix-in-jsdom workaround).
if (!HTMLElement.prototype.hasPointerCapture) {
  HTMLElement.prototype.hasPointerCapture = () => false
}
if (!HTMLElement.prototype.releasePointerCapture) {
  HTMLElement.prototype.releasePointerCapture = () => {}
}

// Imported after the mocks so the component binds the mocked modules.
const { ChannelRegistry } = await import('./channel-registry')

/** A registered-channel fixture; override fields per test. */
function makeChannel(overrides: Partial<NotificationChannel> = {}): NotificationChannel {
  return {
    id: 'slack-critical',
    type: 'slack',
    name: 'Slack #alerts',
    endpoint: 'https://hooks.slack.com/services/T000/B000/secrettoken',
    severities: ['critical', 'warning'],
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
  listChannelsMock.mockReset()
  createChannelMock.mockReset()
  testChannelMock.mockReset()
  toastSuccessMock.mockReset()
  toastErrorMock.mockReset()
})

afterEach(() => {
  cleanup()
  vi.clearAllMocks()
})

describe('ChannelRegistry', () => {
  /** Viewers cannot list channels — only the gated note renders (canList branch). */
  it('renders the viewer-blocked note for a viewer', () => {
    currentRole = 'viewer'
    listChannelsMock.mockResolvedValue([])
    renderWithClient(<ChannelRegistry />)
    expect(screen.getByText('Viewers cannot see notification channels.')).toBeInTheDocument()
    // The list query is disabled for viewers, so the boundary is never hit.
    expect(listChannelsMock).not.toHaveBeenCalled()
  })

  /** While the channels query is in flight the loading note shows (isLoading branch). */
  it('shows the loading note while the query is pending', () => {
    listChannelsMock.mockReturnValue(new Promise(() => {}))
    renderWithClient(<ChannelRegistry />)
    expect(screen.getByText('Loading channels…')).toBeInTheDocument()
  })

  /** A rejected channels query surfaces the error note (isError branch). */
  it('shows the error note when the query rejects', async () => {
    listChannelsMock.mockRejectedValue(new Error('boom'))
    renderWithClient(<ChannelRegistry />)
    expect(await screen.findByText('Failed to load channels.')).toBeInTheDocument()
  })

  /** A populated list renders each channel with its masked endpoint and severities. */
  it('renders channels with the masked endpoint and severity badges', async () => {
    const channel = makeChannel()
    listChannelsMock.mockResolvedValue([channel])
    renderWithClient(<ChannelRegistry />)
    expect(await screen.findByText('Slack #alerts')).toBeInTheDocument()
    // The raw token never renders; the masked form does.
    expect(screen.getByText(maskEndpoint(channel.endpoint))).toBeInTheDocument()
    expect(screen.queryByText(/secrettoken/)).not.toBeInTheDocument()
    const list = screen.getByRole('list')
    expect(within(list).getByText('critical')).toBeInTheDocument()
    expect(within(list).getByText('warning')).toBeInTheDocument()
  })

  /** An empty result renders no list (the `data.length > 0` guard is false). */
  it('renders no channel list when the result is empty', async () => {
    listChannelsMock.mockResolvedValue([])
    renderWithClient(<ChannelRegistry />)
    // The admin create form heading proves the component finished loading.
    expect(await screen.findByText('Register a channel')).toBeInTheDocument()
    expect(screen.queryByRole('list')).not.toBeInTheDocument()
  })

  /** Non-admin editors see channels but get the "admins only" note, not the form. */
  it('hides the create form for a non-admin operator', async () => {
    currentRole = 'operator'
    listChannelsMock.mockResolvedValue([makeChannel()])
    renderWithClient(<ChannelRegistry />)
    expect(await screen.findByText('Only admins can register new channels.')).toBeInTheDocument()
    expect(screen.queryByText('Register a channel')).not.toBeInTheDocument()
  })

  /** Submitting an incomplete draft is a no-op — the create boundary is never called. */
  it('blocks create when required fields are blank', async () => {
    listChannelsMock.mockResolvedValue([])
    const user = userEvent.setup()
    renderWithClient(<ChannelRegistry />)
    await screen.findByText('Register a channel')
    await user.click(screen.getByRole('button', { name: 'Add channel' }))
    expect(createChannelMock).not.toHaveBeenCalled()
  })

  /** Clearing both severities blocks create even when the text fields are filled. */
  it('blocks create when no severity is routed', async () => {
    listChannelsMock.mockResolvedValue([])
    const user = userEvent.setup()
    renderWithClient(<ChannelRegistry />)
    await screen.findByText('Register a channel')
    await user.type(screen.getByLabelText('Id'), 'slack-x')
    await user.type(screen.getByLabelText('Name'), 'Slack X')
    await user.type(screen.getByLabelText('Webhook URL'), 'https://hooks.slack.com/x')
    // Toggle both default severities off so the severities-length guard trips.
    await user.click(screen.getByLabelText('critical'))
    await user.click(screen.getByLabelText('warning'))
    await user.click(screen.getByRole('button', { name: 'Add channel' }))
    expect(createChannelMock).not.toHaveBeenCalled()
  })

  /** A complete draft creates the channel and resets the form (onSuccess path). */
  it('creates a channel from a complete draft and resets the form', async () => {
    listChannelsMock.mockResolvedValue([])
    createChannelMock.mockResolvedValue({ ok: true, channel: makeChannel() })
    const user = userEvent.setup()
    renderWithClient(<ChannelRegistry />)
    await screen.findByText('Register a channel')

    const idField = screen.getByLabelText('Id')
    await user.type(idField, 'slack-x')
    await user.type(screen.getByLabelText('Name'), 'Slack X')
    await user.type(screen.getByLabelText('Webhook URL'), 'https://hooks.slack.com/x')
    await user.click(screen.getByRole('button', { name: 'Add channel' }))

    await waitFor(() => expect(createChannelMock).toHaveBeenCalledTimes(1))
    expect(createChannelMock.mock.calls[0]?.[0]).toMatchObject({
      id: 'slack-x',
      type: 'slack',
      name: 'Slack X',
      endpoint: 'https://hooks.slack.com/x',
      severities: ['critical', 'warning'],
    })
    await waitFor(() => expect(toastSuccessMock).toHaveBeenCalledWith('Channel registered'))
    // onSuccess resets the draft back to EMPTY_DRAFT — the id field clears.
    await waitFor(() => expect(idField).toHaveValue(''))
  })

  /** While the create is in flight the submit button shows the busy label (isPending). */
  it('shows the busy label and disables submit while the create is in flight', async () => {
    listChannelsMock.mockResolvedValue([])
    let resolveCreate: (value: { ok: boolean; channel: NotificationChannel }) => void = () => {}
    createChannelMock.mockReturnValue(
      new Promise<{ ok: boolean; channel: NotificationChannel }>((resolve) => {
        resolveCreate = resolve
      }),
    )
    const user = userEvent.setup()
    renderWithClient(<ChannelRegistry />)
    await screen.findByText('Register a channel')

    await user.type(screen.getByLabelText('Id'), 'slack-x')
    await user.type(screen.getByLabelText('Name'), 'Slack X')
    await user.type(screen.getByLabelText('Webhook URL'), 'https://hooks.slack.com/x')
    await user.click(screen.getByRole('button', { name: 'Add channel' }))

    const busy = await screen.findByRole('button', { name: 'Registering…' })
    expect(busy).toBeDisabled()
    resolveCreate({ ok: true, channel: makeChannel() })
    await waitFor(() => expect(toastSuccessMock).toHaveBeenCalledWith('Channel registered'))
  })

  /** Re-toggling a severity that was off adds it back (the spread/append branch). */
  it('re-adds a severity after it was toggled off', async () => {
    listChannelsMock.mockResolvedValue([])
    createChannelMock.mockResolvedValue({ ok: true, channel: makeChannel() })
    const user = userEvent.setup()
    renderWithClient(<ChannelRegistry />)
    await screen.findByText('Register a channel')

    await user.type(screen.getByLabelText('Id'), 'slack-x')
    await user.type(screen.getByLabelText('Name'), 'Slack X')
    await user.type(screen.getByLabelText('Webhook URL'), 'https://hooks.slack.com/x')
    const warning = screen.getByLabelText('warning')
    await user.click(warning) // remove → ['critical']
    await user.click(warning) // append back → ['critical','warning']
    expect(warning).toBeChecked()
    await user.click(screen.getByRole('button', { name: 'Add channel' }))
    await waitFor(() =>
      expect(createChannelMock.mock.calls[0]?.[0]).toMatchObject({
        severities: ['critical', 'warning'],
      }),
    )
  })

  /** Choosing the email-mock type relabels the endpoint field to "Address". */
  it('relabels the endpoint field when the channel type is email-mock', async () => {
    listChannelsMock.mockResolvedValue([])
    const user = userEvent.setup()
    renderWithClient(<ChannelRegistry />)
    await screen.findByText('Register a channel')

    // Drive the Radix Select by keyboard — pointer events are unreliable in jsdom.
    const trigger = screen.getByRole('combobox', { name: 'Channel type' })
    trigger.focus()
    await user.keyboard('{Enter}')
    await user.click(await screen.findByRole('option', { name: 'email-mock' }))
    expect(await screen.findByLabelText('Address')).toBeInTheDocument()
    expect(screen.queryByLabelText('Webhook URL')).not.toBeInTheDocument()
  })

  /** A failed create surfaces the error toast carrying the Error message (onError). */
  it('shows an error toast when create rejects with an Error', async () => {
    listChannelsMock.mockResolvedValue([])
    createChannelMock.mockRejectedValue(new Error('dup id'))
    const user = userEvent.setup()
    renderWithClient(<ChannelRegistry />)
    await screen.findByText('Register a channel')
    await user.type(screen.getByLabelText('Id'), 'slack-x')
    await user.type(screen.getByLabelText('Name'), 'Slack X')
    await user.type(screen.getByLabelText('Webhook URL'), 'https://hooks.slack.com/x')
    await user.click(screen.getByRole('button', { name: 'Add channel' }))
    await waitFor(() =>
      expect(toastErrorMock).toHaveBeenCalledWith('Could not register channel', {
        description: 'dup id',
      }),
    )
  })

  /** A non-Error create rejection toasts with an undefined description (the ?: branch). */
  it('toasts with no description when create rejects with a non-Error', async () => {
    listChannelsMock.mockResolvedValue([])
    createChannelMock.mockRejectedValue('weird')
    const user = userEvent.setup()
    renderWithClient(<ChannelRegistry />)
    await screen.findByText('Register a channel')
    await user.type(screen.getByLabelText('Id'), 'slack-x')
    await user.type(screen.getByLabelText('Name'), 'Slack X')
    await user.type(screen.getByLabelText('Webhook URL'), 'https://hooks.slack.com/x')
    await user.click(screen.getByRole('button', { name: 'Add channel' }))
    await waitFor(() =>
      expect(toastErrorMock).toHaveBeenCalledWith('Could not register channel', {
        description: undefined,
      }),
    )
  })

  /** A test-fire that returns ok:true toasts success (the testChannel onSuccess true). */
  it('toasts success when the test delivery dispatches', async () => {
    listChannelsMock.mockResolvedValue([makeChannel()])
    testChannelMock.mockResolvedValue({ ok: true })
    const user = userEvent.setup()
    renderWithClient(<ChannelRegistry />)
    await user.click(await screen.findByRole('button', { name: /Send test/ }))
    await waitFor(() =>
      expect(testChannelMock).toHaveBeenCalledWith('slack-critical', expect.anything()),
    )
    await waitFor(() => expect(toastSuccessMock).toHaveBeenCalledWith('Test delivery dispatched'))
  })

  /** A test-fire that returns ok:false toasts the failure (the onSuccess false branch). */
  it('toasts failure when the test delivery is rejected by the server', async () => {
    listChannelsMock.mockResolvedValue([makeChannel()])
    testChannelMock.mockResolvedValue({ ok: false })
    const user = userEvent.setup()
    renderWithClient(<ChannelRegistry />)
    await user.click(await screen.findByRole('button', { name: /Send test/ }))
    await waitFor(() => expect(toastErrorMock).toHaveBeenCalledWith('Test delivery failed'))
  })

  /** A rejected test-fire surfaces the error toast carrying the message (onError). */
  it('shows an error toast when the test-fire request throws', async () => {
    listChannelsMock.mockResolvedValue([makeChannel()])
    testChannelMock.mockRejectedValue(new Error('network'))
    const user = userEvent.setup()
    renderWithClient(<ChannelRegistry />)
    await user.click(await screen.findByRole('button', { name: /Send test/ }))
    await waitFor(() =>
      expect(toastErrorMock).toHaveBeenCalledWith('Test-fire failed', { description: 'network' }),
    )
  })

  /** A non-Error test-fire rejection toasts with an undefined description (the ?: branch). */
  it('toasts with no description when the test-fire rejects with a non-Error', async () => {
    listChannelsMock.mockResolvedValue([makeChannel()])
    testChannelMock.mockRejectedValue('socket reset')
    const user = userEvent.setup()
    renderWithClient(<ChannelRegistry />)
    await user.click(await screen.findByRole('button', { name: /Send test/ }))
    await waitFor(() =>
      expect(toastErrorMock).toHaveBeenCalledWith('Test-fire failed', { description: undefined }),
    )
  })
})
