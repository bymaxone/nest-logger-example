/**
 * @fileoverview Component tests for {@link TriggerCard} — the per-card fire flow:
 * each input kind (level / status / burst / none), the loading-disabled state,
 * the success / expected-error / unexpected-error toasts, the catch-path toast
 * (Error and non-Error rejections), and the post-fire result strip (HTTP status,
 * sliced request/trace ids, destructive styling, and the Explorer deep-link).
 *
 * The card is presentational + local state only; the `fire` callback and the
 * `explorerTarget` builder are injected via the descriptor, and `sonner`'s toast
 * is mocked, so each test drives exactly one branch.
 *
 * @module components/trigger/trigger-card.test
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

/** A userEvent instance that skips the pointer-events check jsdom cannot satisfy. */
const pointerUser = userEvent.setup({ pointerEventsCheck: 0 })

import type { TriggerResult } from '@/lib/trigger-api'
import type { ExplorerTarget } from '@/lib/explorer-link'

const toastSuccessMock = vi.fn<(message: string, options?: unknown) => void>()
const toastErrorMock = vi.fn<(message: string, options?: unknown) => void>()

vi.mock('sonner', () => ({
  toast: { success: toastSuccessMock, error: toastErrorMock },
}))

// Imported after the mock so the component binds the mocked toast.
const { TriggerCard } = await import('./trigger-card')
type TriggerDescriptor = import('./trigger-grid').TriggerDescriptor
type FireContext = import('./trigger-grid').FireContext

/** A successful (status 200) fire result with both correlation ids set. */
function okResult(over: Partial<TriggerResult> = {}): TriggerResult {
  return {
    requestId: 'req_abcdef012345',
    traceId: 'trc_abcdef012345',
    status: 200,
    body: null,
    ...over,
  }
}

/** Build a descriptor whose `fire` resolves to `result` (captures the ctx it sees). */
function descriptorResolving(
  result: TriggerResult,
  over: Partial<TriggerDescriptor> = {},
): {
  descriptor: TriggerDescriptor
  seen: { ctx: FireContext | null }
  explorerTarget: ExplorerTarget
} {
  const seen: { ctx: FireContext | null } = { ctx: null }
  const explorerTarget: ExplorerTarget = { requestId: 'req_abcdef012345' }
  const descriptor: TriggerDescriptor = {
    id: 'demo',
    title: 'Demo card',
    demonstrates: 'what it proves',
    endpoint: 'POST /demo',
    logKeys: ['DEMO_FIRE_OK'],
    fire: (ctx) => {
      seen.ctx = ctx
      return Promise.resolve(result)
    },
    explorerTarget: () => explorerTarget,
    ...over,
  }
  return { descriptor, seen, explorerTarget }
}

/** Build a descriptor whose `fire` rejects with `err`. */
function descriptorRejecting(
  err: unknown,
  over: Partial<TriggerDescriptor> = {},
): TriggerDescriptor {
  return {
    id: 'demo',
    title: 'Demo card',
    demonstrates: 'what it proves',
    endpoint: 'POST /demo',
    logKeys: ['DEMO_FIRE_OK'],
    // An async throw rejects with `err` as-is, so the non-Error fallback branch
    // stays reachable without handing a bare value to `Promise.reject`.
    fire: async () => {
      throw err
    },
    explorerTarget: () => ({}),
    ...over,
  }
}

beforeEach(() => {
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

describe('TriggerCard', () => {
  /** The card renders its title, demonstrates line, endpoint badge, and every logKey badge. */
  it('renders the descriptor header, endpoint, and logKey badges', () => {
    const { descriptor } = descriptorResolving(okResult(), {
      logKeys: ['DEMO_FIRE_OK', 'DEMO_FIRE_ALT'],
    })
    render(<TriggerCard descriptor={descriptor} tenantId="acme" />)
    expect(screen.getByRole('heading', { name: 'Demo card' })).toBeInTheDocument()
    expect(screen.getByText('what it proves')).toBeInTheDocument()
    expect(screen.getByText('POST /demo')).toBeInTheDocument()
    expect(screen.getByText('DEMO_FIRE_OK')).toBeInTheDocument()
    expect(screen.getByText('DEMO_FIRE_ALT')).toBeInTheDocument()
  })

  /** A no-input card renders no Level/Status/Burst control (the `input === undefined` branch). */
  it('renders no input control when the descriptor declares no input', () => {
    const { descriptor } = descriptorResolving(okResult())
    render(<TriggerCard descriptor={descriptor} tenantId="acme" />)
    expect(screen.queryByLabelText('Level')).not.toBeInTheDocument()
    expect(screen.queryByLabelText('Status code')).not.toBeInTheDocument()
    expect(screen.queryByLabelText('Burst count')).not.toBeInTheDocument()
  })

  /** A level card renders the Level select and passes the chosen level through the fire ctx. */
  it('passes the selected level through the fire context', async () => {
    const { descriptor, seen } = descriptorResolving(okResult(), { input: 'level' })
    render(<TriggerCard descriptor={descriptor} tenantId="acme" />)
    // Open the level select and choose `warn` (exercises the onValueChange branch).
    await pointerUser.click(screen.getByRole('combobox', { name: 'Level' }))
    const listbox = await screen.findByRole('listbox')
    await pointerUser.click(within(listbox).getByRole('option', { name: 'warn' }))
    await pointerUser.click(screen.getByRole('button', { name: 'Fire' }))
    await waitFor(() => expect(seen.ctx?.level).toBe('warn'))
  })

  /** A status card renders the Status select and passes the chosen code through the fire ctx. */
  it('passes the selected status code through the fire context', async () => {
    const { descriptor, seen } = descriptorResolving(okResult(), {
      input: 'status',
      isExpectedError: true,
    })
    render(<TriggerCard descriptor={descriptor} tenantId="acme" />)
    // Open the status select and choose 503 (exercises the Number() onValueChange branch).
    await pointerUser.click(screen.getByRole('combobox', { name: 'Status code' }))
    const listbox = await screen.findByRole('listbox')
    await pointerUser.click(within(listbox).getByRole('option', { name: '503' }))
    await pointerUser.click(screen.getByRole('button', { name: 'Fire' }))
    await waitFor(() => expect(seen.ctx?.code).toBe(503))
  })

  /** A burst card renders the count input and forwards the typed count through the fire ctx. */
  it('passes the typed burst count through the fire context', async () => {
    const { descriptor, seen } = descriptorResolving(okResult(), { input: 'burst' })
    const user = userEvent.setup()
    render(<TriggerCard descriptor={descriptor} tenantId="acme" />)
    const input = screen.getByLabelText('Burst count') as HTMLInputElement
    // Set the whole value at once; per-keystroke typing would re-clamp each prefix.
    fireEvent.change(input, { target: { value: '120' } })
    expect(input.value).toBe('120')
    await user.click(screen.getByRole('button', { name: 'Fire' }))
    await waitFor(() => expect(seen.ctx?.count).toBe(120))
  })

  /** Clearing the burst input falls back to the minimum (the `|| BURST_MIN` branch). */
  it('clamps an empty burst count to the minimum', async () => {
    const { descriptor } = descriptorResolving(okResult(), { input: 'burst' })
    const user = userEvent.setup()
    render(<TriggerCard descriptor={descriptor} tenantId="acme" />)
    const input = screen.getByLabelText('Burst count') as HTMLInputElement
    // Clearing yields an empty value → Number('') is NaN → `|| BURST_MIN` (1) applies.
    await user.clear(input)
    expect(input.value).toBe('1')
  })

  /** A burst count above the max clamps to the upper bound (the Math.min branch). */
  it('clamps a burst count above the maximum', () => {
    const { descriptor } = descriptorResolving(okResult(), { input: 'burst' })
    render(<TriggerCard descriptor={descriptor} tenantId="acme" />)
    const input = screen.getByLabelText('Burst count') as HTMLInputElement
    // A value above BURST_MAX (500) is clamped down by the Math.min bound.
    fireEvent.change(input, { target: { value: '900' } })
    expect(input.value).toBe('500')
  })

  /** A successful fire toasts success with the requestId description and shows the result strip. */
  it('toasts success and reveals the result with the request id description', async () => {
    const { descriptor } = descriptorResolving(okResult())
    const user = userEvent.setup()
    render(<TriggerCard descriptor={descriptor} tenantId="acme" />)
    await user.click(screen.getByRole('button', { name: 'Fire' }))
    await waitFor(() =>
      expect(toastSuccessMock).toHaveBeenCalledWith('Demo card fired', {
        description: 'requestId req_abcdef012345',
      }),
    )
    // The result strip shows the HTTP status plus the sliced request and trace ids.
    expect(screen.getByText(/HTTP 200/)).toBeInTheDocument()
    expect(screen.getByText(/req req_abcdef01/)).toBeInTheDocument()
    expect(screen.getByText(/trace trc_abcdef01/)).toBeInTheDocument()
    // The Explorer deep-link is rendered with the built href.
    expect(screen.getByRole('link', { name: /View in Explorer/ })).toHaveAttribute(
      'href',
      expect.stringContaining('/explorer?'),
    )
  })

  /** A success with no requestId omits the toast description (the undefined branch). */
  it('omits the toast description when no request id is returned', async () => {
    const { descriptor } = descriptorResolving(okResult({ requestId: null, traceId: null }))
    const user = userEvent.setup()
    render(<TriggerCard descriptor={descriptor} tenantId="acme" />)
    await user.click(screen.getByRole('button', { name: 'Fire' }))
    await waitFor(() =>
      expect(toastSuccessMock).toHaveBeenCalledWith('Demo card fired', { description: undefined }),
    )
    // With both ids null the strip shows only the bare HTTP status (no `· req`/`· trace`).
    const strip = screen.getByText(/HTTP 200/)
    expect(strip.textContent).toBe('HTTP 200')
  })

  /** A 4xx/5xx response on a card that EXPECTS it still toasts success (isExpectedError true). */
  it('toasts success for an expected 4xx/5xx response', async () => {
    const { descriptor } = descriptorResolving(okResult({ status: 402 }), {
      isExpectedError: true,
    })
    const user = userEvent.setup()
    render(<TriggerCard descriptor={descriptor} tenantId="acme" />)
    await user.click(screen.getByRole('button', { name: 'Fire' }))
    await waitFor(() => expect(toastSuccessMock).toHaveBeenCalled())
    expect(toastErrorMock).not.toHaveBeenCalled()
    // The destructive status styling branch (status >= 400) renders the failure-coloured strip.
    expect(screen.getByText(/HTTP 402/)).toBeInTheDocument()
  })

  /** A 4xx/5xx response on a card that does NOT expect it toasts an error. */
  it('toasts an error for an unexpected 4xx/5xx response', async () => {
    const { descriptor } = descriptorResolving(okResult({ status: 500 }))
    const user = userEvent.setup()
    render(<TriggerCard descriptor={descriptor} tenantId="acme" />)
    await user.click(screen.getByRole('button', { name: 'Fire' }))
    await waitFor(() => expect(toastErrorMock).toHaveBeenCalledWith('Demo card returned 500'))
    expect(toastSuccessMock).not.toHaveBeenCalled()
    // The result strip still appears (the catch path is not taken on an HTTP error).
    expect(screen.getByText(/HTTP 500/)).toBeInTheDocument()
  })

  /** A rejected fire with an Error toasts the failure with the error message (the catch path). */
  it('toasts the error message when the fire rejects with an Error', async () => {
    const descriptor = descriptorRejecting(new Error('network down'))
    const user = userEvent.setup()
    render(<TriggerCard descriptor={descriptor} tenantId="acme" />)
    await user.click(screen.getByRole('button', { name: 'Fire' }))
    await waitFor(() =>
      expect(toastErrorMock).toHaveBeenCalledWith('Demo card failed', {
        description: 'network down',
      }),
    )
    // No result strip is revealed when the fire throws.
    expect(screen.queryByText(/HTTP/)).not.toBeInTheDocument()
  })

  /** A rejected fire with a non-Error falls back to the generic "Network error" description. */
  it('falls back to a generic description for a non-Error rejection', async () => {
    const descriptor = descriptorRejecting('boom')
    const user = userEvent.setup()
    render(<TriggerCard descriptor={descriptor} tenantId="acme" />)
    await user.click(screen.getByRole('button', { name: 'Fire' }))
    await waitFor(() =>
      expect(toastErrorMock).toHaveBeenCalledWith('Demo card failed', {
        description: 'Network error',
      }),
    )
  })

  /** While a fire is in flight the button shows "Firing…" and is disabled (the loading branch). */
  it('disables the button and shows the firing label while in flight', async () => {
    let resolveFire: (value: TriggerResult) => void = () => {}
    const descriptor: TriggerDescriptor = {
      id: 'demo',
      title: 'Demo card',
      demonstrates: 'what it proves',
      endpoint: 'POST /demo',
      logKeys: ['DEMO_FIRE_OK'],
      // Hold the promise open so the in-flight (loading) state is observable.
      fire: () => new Promise<TriggerResult>((resolve) => (resolveFire = resolve)),
      explorerTarget: () => ({}),
    }
    const user = userEvent.setup()
    render(<TriggerCard descriptor={descriptor} tenantId="acme" />)
    await user.click(screen.getByRole('button', { name: 'Fire' }))
    const firing = await screen.findByRole('button', { name: 'Firing…' })
    expect(firing).toBeDisabled()
    // Resolve so the finally clause clears the loading state and the button returns.
    resolveFire(okResult())
    await waitFor(() => expect(screen.getByRole('button', { name: 'Fire' })).toBeEnabled())
  })
})
