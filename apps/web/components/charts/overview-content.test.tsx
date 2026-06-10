/**
 * @fileoverview Component tests for {@link OverviewContent} — the Overview page
 * body that composes the health strip, brushable volume, RED row, breakdown row,
 * and pipeline health, wiring every breakdown panel's click back to the URL filter.
 *
 * The global filter (`useLogQuery`) and the facet hook (`useFacets`) are mocked so
 * the breakdown data and the click-to-filter `setQuery` calls can be asserted. The
 * leaf chart components are stubbed to thin, prop-reflecting harnesses: this keeps
 * the test focused on OverviewContent's own logic — the top-N rollup, the
 * error-scoped facet query, and each `onPick` filter pivot (including the special
 * "other" tenant bucket that must NOT change the filter).
 *
 * @module components/charts/overview-content.test
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

import type { FacetField, FacetValue, FacetsResult, LogQuery } from '@/lib/types'

/** Spy capturing every `setQuery` patch the page dispatches. */
const setQueryMock = vi.fn()

/** Mutable global filter the mocked `useLogQuery` returns. */
let query: LogQuery = { source: 'loki' }

vi.mock('@/lib/filters', () => ({
  useLogQuery: () => ({ query, setQuery: setQueryMock, live: false, isRelative: true }),
}))

/** Records the fields + query each `useFacets` call received, keyed per call. */
const facetCalls: Array<{ fields: FacetField[]; q: LogQuery }> = []

/** Map of the field-set signature → the facet result to return for it. */
let facetResults: { breakdown: FacetsResult; error: FacetsResult }
let facetLoading: boolean

vi.mock('@/hooks/use-facets', () => ({
  useFacets: (fields: FacetField[], q: LogQuery) => {
    facetCalls.push({ fields, q })
    // The breakdown call faces logKey+tenantId; the error call faces logKey only.
    const isBreakdown = fields.length === 2
    return {
      data: isBreakdown ? facetResults.breakdown : facetResults.error,
      isLoading: facetLoading,
    }
  },
}))

// Leaf charts are stubbed to prop-reflecting harnesses so the test asserts
// OverviewContent's own wiring (data, loading, onPick) without recharts internals.
vi.mock('./health-strip', () => ({
  HealthStrip: ({ query: q }: { query: LogQuery }) => (
    <div data-testid="health-strip">{q.source}</div>
  ),
}))
vi.mock('./volume-bar', () => ({
  VolumeBar: ({ onBrush }: { onBrush: (from: string, to: string) => void }) => (
    <button type="button" onClick={() => onBrush('F', 'T')}>
      brush
    </button>
  ),
}))
vi.mock('./requests-line', () => ({ RequestsLine: () => <div>requests</div> }))
vi.mock('./error-rate-line', () => ({ ErrorRateLine: () => <div>errorrate</div> }))
vi.mock('./latency-lines', () => ({ LatencyLines: () => <div>latency</div> }))
vi.mock('./latency-heatmap', () => ({ LatencyHeatmap: () => <div>heatmap</div> }))
vi.mock('./level-donut', () => ({ LevelDonut: () => <div>donut</div> }))
vi.mock('./status-mix', () => ({ StatusMix: () => <div>statusmix</div> }))
vi.mock('./pipeline-health', () => ({ PipelineHealth: () => <div>pipeline</div> }))

vi.mock('./top-bar', () => ({
  TopBar: ({
    title,
    rows,
    onPick,
    loading,
  }: {
    title: string
    rows: FacetValue[]
    onPick: (value: string) => void
    loading?: boolean
  }) => (
    <div>
      <span>{title}</span>
      {loading === true && <span>{`${title}:loading`}</span>}
      {rows.map((r) => (
        <button key={r.value} type="button" onClick={() => onPick(r.value)}>
          {`${title}:${r.value}`}
        </button>
      ))}
    </div>
  ),
}))

const { OverviewContent } = await import('./overview-content')

beforeEach(() => {
  query = { source: 'loki' }
  facetResults = { breakdown: {}, error: {} }
  facetLoading = false
  facetCalls.length = 0
  setQueryMock.mockReset()
})

afterEach(() => {
  cleanup()
  vi.clearAllMocks()
})

describe('OverviewContent', () => {
  /** The error facet query is the base filter narrowed to level ≥ error. */
  it('queries the error facets with a level≥error narrowing of the base filter', () => {
    query = { source: 'postgres', logKey: 'http.request' }
    render(<OverviewContent />)
    const errorCall = facetCalls.find((c) => c.fields.length === 1)
    expect(errorCall?.q).toMatchObject({ source: 'postgres', level: { gte: 'error' } })
    expect(screen.getByTestId('health-strip')).toHaveTextContent('postgres')
  })

  /** Brushing the volume chart pushes the new window and clears the preset range. */
  it('sets the time window when the volume brush fires', async () => {
    const user = userEvent.setup()
    render(<OverviewContent />)
    await user.click(screen.getByRole('button', { name: 'brush' }))
    expect(setQueryMock).toHaveBeenCalledWith({ from: 'F', to: 'T', range: '' })
  })

  /** With no facet data, every TopBar receives empty rows (the `?? []` fallbacks). */
  it('renders empty breakdown panels when facets return no data', () => {
    facetResults = { breakdown: {}, error: {} }
    render(<OverviewContent />)
    expect(screen.getByText('Top logKeys')).toBeInTheDocument()
    expect(screen.getByText('Top errors')).toBeInTheDocument()
    expect(screen.getByText('Top tenants')).toBeInTheDocument()
    expect(screen.queryByText('Top logKeys:loading')).not.toBeInTheDocument()
  })

  /** Loading facets propagate the loading flag into the breakdown panels. */
  it('propagates the loading state into the breakdown panels', () => {
    facetLoading = true
    render(<OverviewContent />)
    expect(screen.getByText('Top logKeys:loading')).toBeInTheDocument()
    expect(screen.getByText('Top errors:loading')).toBeInTheDocument()
  })

  /** Picking a logKey / error / tenant pivots the filter via setQuery. */
  it('pivots the filter when a breakdown bar is picked', async () => {
    facetResults = {
      breakdown: {
        logKey: [{ value: 'http.request', count: 12 }],
        tenantId: [{ value: 'acme', count: 8 }],
      },
      error: { logKey: [{ value: 'db.timeout', count: 3 }] },
    }
    const user = userEvent.setup()
    render(<OverviewContent />)

    await user.click(screen.getByRole('button', { name: 'Top logKeys:http.request' }))
    expect(setQueryMock).toHaveBeenCalledWith({ logKey: 'http.request' })

    await user.click(screen.getByRole('button', { name: 'Top errors:db.timeout' }))
    expect(setQueryMock).toHaveBeenCalledWith({ logKey: 'db.timeout', level: '>=error' })

    await user.click(screen.getByRole('button', { name: 'Top tenants:acme' }))
    expect(setQueryMock).toHaveBeenCalledWith({ tenantId: 'acme' })
  })

  /** Tenants beyond the top-N roll into an "other" bucket that does NOT filter. */
  it('rolls excess tenants into a non-clickable "other" bucket', async () => {
    facetResults = {
      breakdown: {
        tenantId: [
          { value: 't1', count: 60 },
          { value: 't2', count: 50 },
          { value: 't3', count: 40 },
          { value: 't4', count: 30 },
          { value: 't5', count: 20 },
          { value: 't6', count: 10 },
          { value: 't7', count: 5 },
        ],
      },
      error: {},
    }
    const user = userEvent.setup()
    render(<OverviewContent />)
    // The 6th+ rows collapse into a single "other" bar with their summed count.
    const otherBar = screen.getByRole('button', { name: 'Top tenants:other' })
    await user.click(otherBar)
    // Clicking "other" is a no-op — the filter is never patched by this pick.
    expect(setQueryMock).not.toHaveBeenCalled()
    // The named top-5 tenants are still present (rollup keeps the leaders).
    expect(screen.getByRole('button', { name: 'Top tenants:t1' })).toBeInTheDocument()
  })

  /** When the tail sums to zero, rollupOther keeps only the named top-N rows. */
  it('omits the "other" bucket when the collapsed tail count is zero', () => {
    facetResults = {
      breakdown: {
        tenantId: [
          { value: 't1', count: 5 },
          { value: 't2', count: 4 },
          { value: 't3', count: 3 },
          { value: 't4', count: 2 },
          { value: 't5', count: 1 },
          { value: 't6', count: 0 },
        ],
      },
      error: {},
    }
    render(<OverviewContent />)
    expect(screen.queryByRole('button', { name: 'Top tenants:other' })).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Top tenants:t5' })).toBeInTheDocument()
  })

  /** At or below the top-N count, rows pass through unchanged (no rollup). */
  it('passes tenant rows through unchanged when at or below the top-N', () => {
    facetResults = {
      breakdown: {
        tenantId: [
          { value: 't1', count: 5 },
          { value: 't2', count: 4 },
        ],
      },
      error: {},
    }
    render(<OverviewContent />)
    expect(screen.getByRole('button', { name: 'Top tenants:t1' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Top tenants:other' })).not.toBeInTheDocument()
  })

  /**
   * Exactly TOP_N (5) tenant rows must pass through without rolling up into "other"
   * (the `rows.length <= n` boundary). Asserting this kills the `<= n` → `< n` mutation.
   */
  it('does not roll up when the tenant count is exactly the top-N limit', () => {
    facetResults = {
      breakdown: {
        tenantId: [
          { value: 't1', count: 50 },
          { value: 't2', count: 40 },
          { value: 't3', count: 30 },
          { value: 't4', count: 20 },
          { value: 't5', count: 10 },
        ],
      },
      error: {},
    }
    render(<OverviewContent />)
    // Exactly 5 rows = TOP_N (5) so no "other" bucket and all 5 rows are visible.
    expect(screen.queryByRole('button', { name: 'Top tenants:other' })).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Top tenants:t1' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Top tenants:t5' })).toBeInTheDocument()
  })

  /**
   * Six tenants exceed TOP_N (5), so the sixth rolls into "other".
   * Asserting "other" is present kills the `TOP_N = 5` → `TOP_N = 6` mutation:
   * with TOP_N=6, all six rows pass through unchanged and "other" never appears.
   */
  it('rolls the sixth tenant into "other" when there are exactly six tenants', () => {
    facetResults = {
      breakdown: {
        tenantId: [
          { value: 't1', count: 60 },
          { value: 't2', count: 50 },
          { value: 't3', count: 40 },
          { value: 't4', count: 30 },
          { value: 't5', count: 20 },
          { value: 't6', count: 10 },
        ],
      },
      error: {},
    }
    render(<OverviewContent />)
    // With TOP_N=5: t6 is collapsed into "other" (count 10 > 0).
    expect(screen.getByRole('button', { name: 'Top tenants:other' })).toBeInTheDocument()
    // t1 remains as a named row; t6 is gone (subsumed by "other").
    expect(screen.getByRole('button', { name: 'Top tenants:t1' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Top tenants:t6' })).not.toBeInTheDocument()
  })

  /**
   * `useFacets` must be called with the exact field arrays defined by the
   * `BREAKDOWN_FACETS` and `ERROR_FACETS` constants. Asserting the exact values
   * kills StringLiteral mutations to those constants (e.g. 'logKey' → '' or
   * 'tenantId' → '').
   */
  it('passes the correct facet fields for breakdown and error queries', () => {
    render(<OverviewContent />)
    const breakdownCall = facetCalls.find((c) => c.fields.length === 2)
    const errorCall = facetCalls.find((c) => c.fields.length === 1)
    expect(breakdownCall?.fields).toEqual(['logKey', 'tenantId'])
    expect(errorCall?.fields).toEqual(['logKey'])
  })
})

/**
 * Re-import tests for the module-level BREAKDOWN_FACETS and ERROR_FACETS constants.
 *
 * Those arrays are initialised at module load time so Stryker's perTest coverage
 * analysis reports `coveredBy: []` for their string-literal mutations (e.g.
 * 'logKey' → '' or 'tenantId' → ''). Calling vi.resetModules() and re-importing
 * inside the test body forces module re-evaluation with the active mutation,
 * attributing coverage to this specific test so Stryker can detect the kill.
 */
describe('OverviewContent — BREAKDOWN_FACETS and ERROR_FACETS module-level re-import', () => {
  afterEach(() => {
    vi.resetModules()
    cleanup()
    vi.clearAllMocks()
  })

  it('re-imports and verifies BREAKDOWN_FACETS passes logKey and tenantId to useFacets', async () => {
    facetCalls.length = 0
    facetResults = { breakdown: {}, error: {} }
    facetLoading = false
    query = { source: 'loki' }
    vi.resetModules()
    const { OverviewContent: FreshContent } = await import('./overview-content')
    render(<FreshContent />)
    const breakdownCall = facetCalls.find((c) => c.fields.length === 2)
    expect(breakdownCall?.fields).toEqual(['logKey', 'tenantId'])
  })

  it('re-imports and verifies ERROR_FACETS passes only logKey to useFacets', async () => {
    facetCalls.length = 0
    facetResults = { breakdown: {}, error: {} }
    facetLoading = false
    query = { source: 'loki' }
    vi.resetModules()
    const { OverviewContent: FreshContent } = await import('./overview-content')
    render(<FreshContent />)
    const errorCall = facetCalls.find((c) => c.fields.length === 1)
    expect(errorCall?.fields).toEqual(['logKey'])
  })
})
