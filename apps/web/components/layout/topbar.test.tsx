/**
 * @fileoverview Component tests for {@link Topbar} — the banner landmark, the
 * brand wordmark, the global-controls slot, and the hamburger button wiring
 * (clicking it invokes the `onMenuOpen` callback that toggles the sidebar).
 *
 * The four control widgets are mocked with lightweight stand-ins so the test
 * exercises the topbar's own layout/wiring rather than the controls' internals.
 *
 * @module components/layout/topbar.test
 */
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

vi.mock('@/components/controls/time-range-picker', () => ({
  TimeRangePicker: () => <div data-testid="time-range-picker" />,
}))
vi.mock('@/components/controls/source-toggle', () => ({
  SourceToggle: () => <div data-testid="source-toggle" />,
}))
vi.mock('@/components/controls/tenant-role-switcher', () => ({
  TenantRoleSwitcher: () => <div data-testid="tenant-role-switcher" />,
}))
vi.mock('@/components/controls/live-toggle', () => ({
  LiveToggle: () => <div data-testid="live-toggle" />,
}))

// Imported after the mocks so the component binds the mocked controls.
const { Topbar } = await import('./topbar')

afterEach(() => {
  cleanup()
  vi.clearAllMocks()
})

describe('Topbar', () => {
  /** The bar renders as a banner landmark carrying the brand wordmark. */
  it('renders a banner landmark with the brand wordmark', () => {
    render(<Topbar onMenuOpen={() => {}} />)
    expect(screen.getByRole('banner')).toBeInTheDocument()
    expect(screen.getByText('nest-logger-example')).toBeInTheDocument()
  })

  /** All four global controls are mounted in the right-hand slot. */
  it('mounts the four global control widgets', () => {
    render(<Topbar onMenuOpen={() => {}} />)
    expect(screen.getByTestId('time-range-picker')).toBeInTheDocument()
    expect(screen.getByTestId('source-toggle')).toBeInTheDocument()
    expect(screen.getByTestId('tenant-role-switcher')).toBeInTheDocument()
    expect(screen.getByTestId('live-toggle')).toBeInTheDocument()
  })

  /** Pressing the hamburger invokes `onMenuOpen` to open the mobile sidebar. */
  it('calls onMenuOpen when the hamburger button is pressed', async () => {
    const onMenuOpen = vi.fn()
    const user = userEvent.setup()
    render(<Topbar onMenuOpen={onMenuOpen} />)
    await user.click(screen.getByRole('button', { name: 'Open navigation menu' }))
    expect(onMenuOpen).toHaveBeenCalledTimes(1)
  })
})
