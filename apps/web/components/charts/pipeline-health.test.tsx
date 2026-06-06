/**
 * @fileoverview Component tests for {@link PipelineHealth} — the logger fail-soft
 * saturation row built from the `logKey` facet.
 *
 * `useFacets` (`/logs/facets`) is mocked so the loading skeleton and the populated
 * stat row can both be driven. The populated case covers both colour branches: a
 * non-zero counter (danger) and a zero counter (success), plus the missing-facet
 * fallback that resolves an absent key to `0`.
 *
 * @module components/charts/pipeline-health.test
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, render, screen } from '@testing-library/react'

import type { FacetsResult, LogQuery } from '@/lib/types'

/** Minimal TanStack-shaped result the mocked `useFacets` returns. */
interface FakeFacets {
  data?: FacetsResult
  isLoading: boolean
}

/** Mutable result the mocked hook reads; set per test before render. */
let facets: FakeFacets

vi.mock('@/hooks/use-facets', () => ({
  useFacets: (): FakeFacets => facets,
}))

const { PipelineHealth } = await import('./pipeline-health')

const BASE_QUERY: LogQuery = { source: 'loki' }

beforeEach(() => {
  // Omit `data` entirely so the optional key is absent (exactOptionalPropertyTypes).
  facets = { isLoading: false }
})

afterEach(() => {
  cleanup()
  vi.clearAllMocks()
})

describe('PipelineHealth', () => {
  /** While the facet query loads, a single skeleton stands in for the row. */
  it('renders a skeleton while the facet query loads', () => {
    facets = { isLoading: true }
    render(<PipelineHealth query={BASE_QUERY} />)
    expect(screen.queryByText('Write failed')).not.toBeInTheDocument()
  })

  /** Each fail-soft key renders its label, count, and raw key once loaded. */
  it('renders a stat per fail-soft key with danger and success counts', () => {
    facets = {
      isLoading: false,
      data: {
        logKey: [
          { value: 'LOGGER_DESTINATION_WRITE_FAILED', count: 7 },
          { value: 'LOGGER_DESTINATION_INIT_FAILED', count: 0 },
          // LOGGER_ENTRY_TRUNCATED is intentionally absent → the `?? 0` fallback.
        ],
      },
    }
    render(<PipelineHealth query={BASE_QUERY} />)
    expect(screen.getByText('Write failed')).toBeInTheDocument()
    expect(screen.getByText('Init failed')).toBeInTheDocument()
    expect(screen.getByText('Entries truncated')).toBeInTheDocument()
    // The non-zero write-failed counter (danger branch).
    expect(screen.getByText('7')).toBeInTheDocument()
    // The init-failed (0) and the absent truncated key (?? 0) both render zero.
    expect(screen.getAllByText('0')).toHaveLength(2)
    // The raw reserved keys appear as the small mono caption under each stat.
    expect(screen.getByText('LOGGER_DESTINATION_WRITE_FAILED')).toBeInTheDocument()
    expect(
      screen.getByText(/Write-lag readouts require per-destination latency metrics/),
    ).toBeInTheDocument()
  })

  /** A fully absent `logKey` facet resolves every counter to zero (`?? []`). */
  it('falls back to zero counts when the logKey facet is missing', () => {
    facets = { isLoading: false, data: {} }
    render(<PipelineHealth query={BASE_QUERY} />)
    expect(screen.getAllByText('0')).toHaveLength(3)
  })
})
