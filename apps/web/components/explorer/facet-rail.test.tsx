/**
 * @fileoverview Component tests for {@link FacetRail} — the Explorer faceted rail.
 *
 * The URL-state hook (`@/lib/filters` `useLogQuery`) and the facet data hook
 * (`@/hooks/use-facets`) are mocked so each test drives one rendered branch:
 * the error banner, the per-section loading skeletons, the empty "No values"
 * state, populated value buttons with counts, the active-vs-inactive highlight,
 * the level-dot decoration, and the click-to-filter / Alt-click-to-clear setters
 * for each facet field (`level`, `service`, `logKey`, `tenantId`).
 *
 * @module components/explorer/facet-rail.test
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'

import type { FacetsResult, LogQuery } from '@/lib/types'

/** The mocked nuqs setter; assertions check the exact patch object per field. */
const setQueryMock = vi.fn()

/** Mutable URL-derived filter the mocked `useLogQuery` returns; reshaped per test. */
let logQuery: LogQuery

vi.mock('@/lib/filters', () => ({
  useLogQuery: () => ({ query: logQuery, setQuery: setQueryMock, live: false, isRelative: true }),
}))

/** Mutable facet-hook result the mocked `useFacets` returns; reshaped per test. */
let facetsReturn: { data: FacetsResult | undefined; isLoading: boolean; isError: boolean }

vi.mock('@/hooks/use-facets', () => ({
  useFacets: () => facetsReturn,
}))

// Imported after the mocks so the component binds the mocked hooks.
const { FacetRail } = await import('./facet-rail')

beforeEach(() => {
  setQueryMock.mockReset()
  logQuery = { source: 'loki' }
  facetsReturn = {
    data: {
      level: [
        { value: 'error', count: 12 },
        { value: 'info', count: 340 },
      ],
      service: [{ value: 'api', count: 99 }],
      logKey: [{ value: 'AUTH_LOGIN_FAILED', count: 7 }],
      tenantId: [{ value: 'acme', count: 3 }],
    },
    isLoading: false,
    isError: false,
  }
})

afterEach(() => {
  cleanup()
  vi.clearAllMocks()
})

describe('FacetRail', () => {
  /** The rail renders a heading and one section per faceted field. */
  it('renders the section headings', () => {
    render(<FacetRail />)
    expect(screen.getByRole('heading', { name: 'Facets' })).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'Level' })).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'Service' })).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'Log key' })).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'Tenant' })).toBeInTheDocument()
  })

  /** A facet load failure surfaces the error banner. */
  it('renders the error banner when the facet query fails', () => {
    facetsReturn = { ...facetsReturn, isError: true }
    render(<FacetRail />)
    expect(screen.getByText('Failed to load facet counts.')).toBeInTheDocument()
  })

  /** While loading, each section shows skeleton placeholders (no value buttons). */
  it('renders skeletons while facets load', () => {
    facetsReturn = { data: undefined, isLoading: true, isError: false }
    render(<FacetRail />)
    expect(screen.queryByRole('button')).not.toBeInTheDocument()
    expect(screen.queryByText('No values')).not.toBeInTheDocument()
  })

  /** A field with no values renders the "No values" placeholder. */
  it('renders the empty placeholder for a field with no values', () => {
    facetsReturn = { data: { level: [] }, isLoading: false, isError: false }
    render(<FacetRail />)
    // `service`, `logKey`, `tenantId` are absent → `?? []` → empty; `level` is [].
    expect(screen.getAllByText('No values')).toHaveLength(4)
  })

  /** Each value renders as a button showing its name and count. */
  it('renders value buttons with counts', () => {
    render(<FacetRail />)
    expect(screen.getByRole('button', { name: /error/ })).toBeInTheDocument()
    expect(screen.getByText('12')).toBeInTheDocument()
    expect(screen.getByText('340')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /api/ })).toBeInTheDocument()
  })

  /** Clicking a level value sets that field's filter via the nuqs setter. */
  it('applies a level filter on click', () => {
    render(<FacetRail />)
    fireEvent.click(screen.getByRole('button', { name: /info/ }))
    expect(setQueryMock).toHaveBeenCalledWith({ level: 'info' })
  })

  /** Clicking a service value sets the service filter. */
  it('applies a service filter on click', () => {
    render(<FacetRail />)
    fireEvent.click(screen.getByRole('button', { name: /api/ }))
    expect(setQueryMock).toHaveBeenCalledWith({ service: 'api' })
  })

  /** Clicking a logKey value sets the logKey filter. */
  it('applies a logKey filter on click', () => {
    render(<FacetRail />)
    fireEvent.click(screen.getByRole('button', { name: /AUTH_LOGIN_FAILED/ }))
    expect(setQueryMock).toHaveBeenCalledWith({ logKey: 'AUTH_LOGIN_FAILED' })
  })

  /** Clicking a tenantId value sets the tenantId filter. */
  it('applies a tenantId filter on click', () => {
    render(<FacetRail />)
    fireEvent.click(screen.getByRole('button', { name: /acme/ }))
    expect(setQueryMock).toHaveBeenCalledWith({ tenantId: 'acme' })
  })

  /**
   * An active value is highlighted and its title invites Alt-click to clear;
   * Alt-clicking it removes the field filter (sets it to the empty string).
   */
  it('clears an active level filter on Alt-click', () => {
    logQuery = { source: 'loki', level: 'error' }
    render(<FacetRail />)
    const activeBtn = screen.getByRole('button', { name: /error/ })
    expect(activeBtn).toHaveAttribute('title', 'Alt-click to clear this filter')
    fireEvent.click(activeBtn, { altKey: true })
    expect(setQueryMock).toHaveBeenCalledWith({ level: '' })
  })

  /**
   * Alt-clicking an INACTIVE value applies it (the clear path requires the value
   * to already be the active one), so a plain Alt-click still sets the filter.
   */
  it('applies (does not clear) an Alt-click on an inactive value', () => {
    logQuery = { source: 'loki', level: 'error' }
    render(<FacetRail />)
    // `info` is not the active value, so Alt-click still applies it.
    fireEvent.click(screen.getByRole('button', { name: /info/ }), { altKey: true })
    expect(setQueryMock).toHaveBeenCalledWith({ level: 'info' })
  })

  /**
   * A non-level facet's active value is read from the plain string field (the
   * `activeValue` branch that is not `level`), so its title flips to the clear hint.
   */
  it('marks a non-level facet value active from its string field', () => {
    logQuery = { source: 'loki', service: 'api' }
    render(<FacetRail />)
    expect(screen.getByRole('button', { name: /api/ })).toHaveAttribute(
      'title',
      'Alt-click to clear this filter',
    )
  })

  /**
   * When `level` is a comparison object (`{ gte }`) rather than a string, the
   * `activeValue` guard treats the level facet as having no active string value,
   * so the value title stays the "Filter …" hint.
   */
  it('treats a comparison-object level as no active string value', () => {
    logQuery = { source: 'loki', level: { gte: 'warn' } }
    render(<FacetRail />)
    expect(screen.getByRole('button', { name: /error/ })).toHaveAttribute(
      'title',
      'Filter Level = error',
    )
  })

  /**
   * A non-level facet whose field is absent from the query yields an empty active
   * value (the `?? ''` fallback in `activeValue`), so no value is highlighted.
   */
  it('falls back to empty active value when a non-level field is unset', () => {
    logQuery = { source: 'loki' }
    render(<FacetRail />)
    expect(screen.getByRole('button', { name: /acme/ })).toHaveAttribute(
      'title',
      'Filter Tenant = acme',
    )
  })

  /**
   * The level facet draws a colour dot only for recognised levels. A `level`
   * value that is not a real log level renders without the decorative dot.
   */
  it('omits the level dot for an unrecognized level value', () => {
    facetsReturn = {
      data: { level: [{ value: 'notalevel', count: 1 }] },
      isLoading: false,
      isError: false,
    }
    const { container } = render(<FacetRail />)
    // The decorative dot is the only aria-hidden span; an unknown level omits it.
    expect(container.querySelector('span[aria-hidden="true"]')).toBeNull()
    expect(screen.getByRole('button', { name: /notalevel/ })).toBeInTheDocument()
  })

  /** A recognised level value renders its decorative colour dot. */
  it('renders the level dot for a recognized level value', () => {
    const { container } = render(<FacetRail />)
    expect(container.querySelector('span[aria-hidden="true"]')).not.toBeNull()
  })
})
