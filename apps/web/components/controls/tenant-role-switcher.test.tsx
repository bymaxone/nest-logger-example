/**
 * @fileoverview Component tests for {@link TenantRoleSwitcher} — the tenant select
 * (including the "all tenants" sentinel ⇄ a concrete tenant) and the role select
 * (with the `isRole` narrowing guard), asserting the URL writes for each.
 *
 * The two Radix selects are bound to the nuqs URL state, so each test seeds a
 * `NuqsTestingAdapter`, opens a select with `userEvent`, picks an option, and
 * asserts the `onUrlUpdate` write. The seeded `value` also drives the rendered
 * trigger label so both the sentinel and the concrete-value branches are covered.
 *
 * @module components/controls/tenant-role-switcher.test
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { NuqsTestingAdapter } from 'nuqs/adapters/testing'
import type { OnUrlUpdateFunction } from 'nuqs/adapters/testing'
import type { ReactElement, ReactNode } from 'react'

import { TenantRoleSwitcher } from './tenant-role-switcher'

/**
 * Render the switcher under a memory-backed nuqs adapter seeded from `search`.
 * `onUrlUpdate` is always a concrete spy so the adapter never receives `undefined`.
 */
function renderSwitcher(search: string, onUrlUpdate: OnUrlUpdateFunction = vi.fn()): void {
  const wrapper = ({ children }: { children: ReactNode }): ReactElement => (
    <NuqsTestingAdapter searchParams={search} hasMemory onUrlUpdate={onUrlUpdate}>
      {children}
    </NuqsTestingAdapter>
  )
  render(<TenantRoleSwitcher />, { wrapper })
}

/** A userEvent instance that skips the pointer-events check jsdom cannot satisfy. */
const user = userEvent.setup({ pointerEventsCheck: 0 })

beforeEach(() => {
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

describe('TenantRoleSwitcher', () => {
  /** With no tenant the trigger shows "All tenants" (the `tenantId === ''` sentinel branch). */
  it('shows the all-tenants sentinel when no tenant is set', () => {
    renderSwitcher('')
    expect(screen.getByRole('combobox', { name: 'Tenant' })).toHaveTextContent('All tenants')
  })

  /** A seeded tenantId renders the concrete tenant label (the non-sentinel branch). */
  it('shows the concrete tenant when tenantId is set', () => {
    renderSwitcher('?tenantId=acme')
    expect(screen.getByRole('combobox', { name: 'Tenant' })).toHaveTextContent('acme')
  })

  /** Picking a concrete tenant writes `tenantId=globex` to the URL. */
  it('writes the selected tenant to the URL', async () => {
    const onUrlUpdate = vi.fn()
    renderSwitcher('', onUrlUpdate)
    await user.click(screen.getByRole('combobox', { name: 'Tenant' }))
    const listbox = await screen.findByRole('listbox')
    await user.click(within(listbox).getByRole('option', { name: 'globex' }))
    expect(onUrlUpdate.mock.calls[0]![0].searchParams.get('tenantId')).toBe('globex')
  })

  /** Picking "All tenants" from a concrete tenant clears `tenantId` (the sentinel→empty write). */
  it('clears the tenant when all-tenants is chosen', async () => {
    const onUrlUpdate = vi.fn()
    renderSwitcher('?tenantId=acme', onUrlUpdate)
    await user.click(screen.getByRole('combobox', { name: 'Tenant' }))
    const listbox = await screen.findByRole('listbox')
    await user.click(within(listbox).getByRole('option', { name: 'All tenants' }))
    // `''` is the parser default, so nuqs drops the param from the query string.
    expect(onUrlUpdate.mock.calls[0]![0].searchParams.get('tenantId')).toBeNull()
  })

  /** The role trigger defaults to "Admin" (the default-enum branch of the parser). */
  it('shows Admin as the default role', () => {
    renderSwitcher('')
    expect(screen.getByRole('combobox', { name: 'Role' })).toHaveTextContent('Admin')
  })

  /** Picking a role writes the narrowed `role` value (the `isRole` true branch). */
  it('writes the selected role to the URL', async () => {
    const onUrlUpdate = vi.fn()
    renderSwitcher('', onUrlUpdate)
    await user.click(screen.getByRole('combobox', { name: 'Role' }))
    const listbox = await screen.findByRole('listbox')
    await user.click(within(listbox).getByRole('option', { name: 'Viewer' }))
    expect(onUrlUpdate.mock.calls[0]![0].searchParams.get('role')).toBe('viewer')
  })
})
