/**
 * @fileoverview Component tests for {@link Sidebar} — the nav landmark, the
 * active/inactive branch per route (exact root match vs prefix match for the
 * sub-routes), the mobile open/closed visibility branch, and the optional
 * `onNavClick` close handler (present vs absent).
 *
 * `next/navigation`'s `usePathname` is mocked so each test pins the current
 * route and asserts which item carries `aria-current="page"`.
 *
 * @module components/layout/sidebar.test
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

/** Mutable pathname the mocked `usePathname` returns; set per test before render. */
let currentPathname = '/dashboard'
/** Mutable query string the mocked `useSearchParams` returns; set per test before render. */
let currentSearch = ''

vi.mock('next/navigation', () => ({
  usePathname: (): string => currentPathname,
  useSearchParams: (): URLSearchParams => new URLSearchParams(currentSearch),
}))

// Imported after the mock so the component binds the mocked navigation module.
const { Sidebar } = await import('./sidebar')

beforeEach(() => {
  currentPathname = '/dashboard'
  currentSearch = ''
})

afterEach(() => {
  cleanup()
  vi.clearAllMocks()
})

describe('Sidebar', () => {
  /** The rail renders as a labelled navigation landmark holding every item. */
  it('renders a Main navigation landmark with all six links', () => {
    render(<Sidebar isOpen={false} />)
    const nav = screen.getByRole('navigation', { name: 'Main navigation' })
    expect(nav).toBeInTheDocument()
    for (const label of [
      'Overview',
      'Explorer',
      'Trigger Center',
      'Alerts',
      'Maintenance',
      'Settings',
    ]) {
      expect(screen.getByRole('link', { name: label })).toBeInTheDocument()
    }
  })

  /** The root route uses exact matching, so only Overview is current at `/`. */
  it('marks only Overview active on the exact root route', () => {
    currentPathname = '/dashboard'
    render(<Sidebar isOpen={false} />)
    expect(screen.getByRole('link', { name: 'Overview' })).toHaveAttribute('aria-current', 'page')
    expect(screen.getByRole('link', { name: 'Explorer' })).not.toHaveAttribute('aria-current')
  })

  /** A non-root pathname must NOT mark the exact root item active (exact=false branch). */
  it('does not mark Overview active when the route is not the root', () => {
    currentPathname = '/dashboard/explorer'
    render(<Sidebar isOpen={false} />)
    expect(screen.getByRole('link', { name: 'Overview' })).not.toHaveAttribute('aria-current')
    expect(screen.getByRole('link', { name: 'Explorer' })).toHaveAttribute('aria-current', 'page')
  })

  /** Each non-exact item is active on its own exact href (the `pathname === href` branch). */
  it.each([
    ['/dashboard/explorer', 'Explorer'],
    ['/dashboard/trigger', 'Trigger Center'],
    ['/dashboard/alerts', 'Alerts'],
    ['/dashboard/maintenance', 'Maintenance'],
    ['/dashboard/settings', 'Settings'],
  ])('marks %s active for its exact route', (path, label) => {
    currentPathname = path
    render(<Sidebar isOpen={false} />)
    expect(screen.getByRole('link', { name: label })).toHaveAttribute('aria-current', 'page')
  })

  /** A nested sub-route activates its parent via the `startsWith(href + '/')` branch. */
  it('marks a non-exact item active for a nested sub-route', () => {
    currentPathname = '/dashboard/explorer/details'
    render(<Sidebar isOpen={false} />)
    expect(screen.getByRole('link', { name: 'Explorer' })).toHaveAttribute('aria-current', 'page')
    // The exact root must stay inactive when a sub-route is open.
    expect(screen.getByRole('link', { name: 'Overview' })).not.toHaveAttribute('aria-current')
  })

  /** With no matching route every item is inactive (both active branches false). */
  it('marks no item active for an unmatched route', () => {
    currentPathname = '/dashboard/nowhere'
    render(<Sidebar isOpen={false} />)
    for (const label of ['Overview', 'Explorer', 'Trigger Center', 'Alerts']) {
      expect(screen.getByRole('link', { name: label })).not.toHaveAttribute('aria-current')
    }
  })

  /** When `onNavClick` is provided, clicking a link invokes it (mobile close). */
  it('calls onNavClick when a link is clicked', async () => {
    const onNavClick = vi.fn()
    const user = userEvent.setup()
    render(<Sidebar isOpen onNavClick={onNavClick} />)
    await user.click(screen.getByRole('link', { name: 'Alerts' }))
    expect(onNavClick).toHaveBeenCalledTimes(1)
  })

  /** Without `onNavClick`, clicking a link must not throw (the absent-handler branch). */
  it('renders clickable links when onNavClick is omitted', async () => {
    const user = userEvent.setup()
    render(<Sidebar isOpen />)
    await user.click(screen.getByRole('link', { name: 'Settings' }))
    expect(screen.getByRole('link', { name: 'Settings' })).toBeInTheDocument()
  })

  /**
   * A path that starts with a nav href but is not a true sub-route (no `/` separator)
   * must NOT activate the parent. This kills the `item.href + '/'` → `item.href + ''`
   * StringLiteral mutation on the `startsWith` guard.
   */
  it('does not mark Explorer active for a path that only shares a prefix with its href', () => {
    currentPathname = '/dashboard/explorerx'
    render(<Sidebar isOpen={false} />)
    expect(screen.getByRole('link', { name: 'Explorer' })).not.toHaveAttribute('aria-current')
  })

  /** With no active filter state the links stay bare (the empty-query branch). */
  it('keeps bare hrefs when there is no active query state', () => {
    render(<Sidebar isOpen={false} />)
    expect(screen.getByRole('link', { name: 'Overview' })).toHaveAttribute('href', '/dashboard')
    expect(screen.getByRole('link', { name: 'Explorer' })).toHaveAttribute(
      'href',
      '/dashboard/explorer',
    )
  })

  /**
   * When open, the rail resolves to a visible `flex` display (no `hidden`); the
   * conditional `'flex'` literal lands last after tailwind-merge dedup, so the
   * class string must end in `flex`. Kills the `'flex'`→"" StringLiteral mutation.
   */
  it('resolves the nav to a visible flex display when open', () => {
    render(<Sidebar isOpen />)
    const nav = screen.getByRole('navigation', { name: 'Main navigation' })
    expect(nav.className).toMatch(/ flex$/)
    expect(nav.className).not.toContain('hidden')
  })

  /**
   * When closed, the rail is `hidden` on mobile and `lg:flex` on desktop, and the
   * base `flex` is overridden away. Kills the `'hidden lg:flex'`→"" StringLiteral
   * mutation (which would leave a visible base `flex` instead).
   */
  it('resolves the nav to hidden (lg:flex) when closed', () => {
    render(<Sidebar isOpen={false} />)
    const nav = screen.getByRole('navigation', { name: 'Main navigation' })
    expect(nav.className).toContain('hidden')
    expect(nav.className).toContain('lg:flex')
    expect(nav.className).not.toMatch(/ flex$/)
  })

  /**
   * The active filter query (the nuqs URL state) is carried onto every destination
   * so navigating between pages preserves the lens instead of resetting it.
   */
  it('appends the active query string to every nav href', () => {
    currentSearch = 'source=postgres&live=true&tenantId=acme'
    render(<Sidebar isOpen={false} />)
    expect(screen.getByRole('link', { name: 'Overview' })).toHaveAttribute(
      'href',
      '/dashboard?source=postgres&live=true&tenantId=acme',
    )
    expect(screen.getByRole('link', { name: 'Settings' })).toHaveAttribute(
      'href',
      '/dashboard/settings?source=postgres&live=true&tenantId=acme',
    )
  })
})
