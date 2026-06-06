/**
 * @fileoverview Component tests for {@link AppShell} — the app chrome that wires
 * the topbar, the sidebar, and the page content well, and owns the mobile
 * sidebar open/close state. The Topbar and Sidebar children are mocked with
 * stand-ins that surface the props they receive, so the test can drive the
 * `onMenuOpen` → open and `onNavClick` → close state transitions and assert the
 * `isOpen` value the shell passes down.
 *
 * @module components/layout/app-shell.test
 */
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

/** Stand-in topbar exposing a button that fires the shell's `onMenuOpen`. */
vi.mock('./topbar', () => ({
  Topbar: ({ onMenuOpen }: { onMenuOpen: () => void }) => (
    <button type="button" onClick={onMenuOpen}>
      open-menu
    </button>
  ),
}))

/** Stand-in sidebar that surfaces `isOpen` and fires the shell's `onNavClick`. */
vi.mock('./sidebar', () => ({
  Sidebar: ({ isOpen, onNavClick }: { isOpen: boolean; onNavClick?: () => void }) => (
    <div>
      <span data-testid="sidebar-open">{String(isOpen)}</span>
      <button type="button" onClick={onNavClick}>
        nav-click
      </button>
    </div>
  ),
}))

// Imported after the mocks so the shell binds the mocked children.
const { AppShell } = await import('./app-shell')

afterEach(() => {
  cleanup()
  vi.clearAllMocks()
})

describe('AppShell', () => {
  /** The shell renders its content well as a main landmark wrapping children. */
  it('renders children inside the main content well', () => {
    render(
      <AppShell>
        <p>page body</p>
      </AppShell>,
    )
    const main = screen.getByRole('main')
    expect(main).toBeInTheDocument()
    expect(screen.getByText('page body')).toBeInTheDocument()
  })

  /** The sidebar starts closed (initial `isOpen` state is false). */
  it('starts with the mobile sidebar closed', () => {
    render(<AppShell>content</AppShell>)
    expect(screen.getByTestId('sidebar-open')).toHaveTextContent('false')
  })

  /** The topbar's `onMenuOpen` opens the sidebar (state flips to true). */
  it('opens the sidebar when the topbar menu is pressed', async () => {
    const user = userEvent.setup()
    render(<AppShell>content</AppShell>)
    await user.click(screen.getByRole('button', { name: 'open-menu' }))
    expect(screen.getByTestId('sidebar-open')).toHaveTextContent('true')
  })

  /** The sidebar's `onNavClick` closes it again (state flips back to false). */
  it('closes the sidebar when a nav item is clicked', async () => {
    const user = userEvent.setup()
    render(<AppShell>content</AppShell>)
    await user.click(screen.getByRole('button', { name: 'open-menu' }))
    expect(screen.getByTestId('sidebar-open')).toHaveTextContent('true')
    await user.click(screen.getByRole('button', { name: 'nav-click' }))
    expect(screen.getByTestId('sidebar-open')).toHaveTextContent('false')
  })
})
