/**
 * @fileoverview Unit tests for the chart-series metadata tables.
 *
 * Each exported table is the single source of truth a chart and its legend share,
 * so the exact key/label/colour/unit of every series is load-bearing: a drifted
 * colour or a missing series makes a panel unreadable. These tests pin the full
 * contents of every table (including the severity-derived {@link LEVEL_SERIES}).
 *
 * @module lib/chart-series.test
 */
import { describe, expect, it, vi } from 'vitest'

/**
 * Re-imports the module from scratch so its top-level series arrays are
 * re-evaluated *inside* the test. The arrays, their object elements, and their
 * string fields are produced by module-load initializers; a hoisted top-level
 * import would capture the values before any mutation is applied, leaving those
 * mutants alive. A fresh `import()` after `resetModules()` runs the initializers
 * now, so the asserted contents reflect the (possibly mutated) source.
 */
async function freshChartSeries(): Promise<typeof import('./chart-series')> {
  vi.resetModules()
  return import('./chart-series')
}

describe('LATENCY_SERIES', () => {
  it(/* Pins the three latency percentile series with their exact keys, labels,
       colours and `ms` unit — kills the empty-array, empty-object and per-string mutants. */
  'lists p50/p95/p99 with exact colour, label and ms unit', async () => {
    const { LATENCY_SERIES } = await freshChartSeries()
    expect(LATENCY_SERIES).toEqual([
      { key: 'p50', label: 'p50', color: '#60a5fa', unit: 'ms' },
      { key: 'p95', label: 'p95', color: '#f59e0b', unit: 'ms' },
      { key: 'p99', label: 'p99', color: '#ef4444', unit: 'ms' },
    ])
  })
})

describe('ERROR_RATE_SERIES', () => {
  it(/* Pins the 4xx/5xx error-rate series with their exact keys, labels, colours
       and `%` unit — kills the empty-array, empty-object and per-string mutants. */
  'lists rate4xx/rate5xx with exact colour, label and % unit', async () => {
    const { ERROR_RATE_SERIES } = await freshChartSeries()
    expect(ERROR_RATE_SERIES).toEqual([
      { key: 'rate4xx', label: '4xx', color: '#f59e0b', unit: '%' },
      { key: 'rate5xx', label: '5xx', color: '#ef4444', unit: '%' },
    ])
  })
})

describe('STATUS_SERIES', () => {
  it(/* Pins the four HTTP status-class series with exact keys, labels and colours
       and asserts they carry no `unit` — kills the empty-array, empty-object and
       per-string mutants. */
  'lists s2xx/s3xx/s4xx/s5xx with exact colour and label and no unit', async () => {
    const { STATUS_SERIES } = await freshChartSeries()
    expect(STATUS_SERIES).toEqual([
      { key: 's2xx', label: '2xx', color: '#22c55e' },
      { key: 's3xx', label: '3xx', color: '#60a5fa' },
      { key: 's4xx', label: '4xx', color: '#f59e0b' },
      { key: 's5xx', label: '5xx', color: '#ef4444' },
    ])
  })
})

describe('LEVEL_STACK', () => {
  it(/* Pins the severity-ordered level list (base → top) exactly — kills the
       empty-array mutant and any reordering. */
  'lists the six levels in severity order', async () => {
    const { LEVEL_STACK } = await freshChartSeries()
    expect(LEVEL_STACK).toEqual(['trace', 'debug', 'info', 'warn', 'error', 'fatal'])
  })
})

describe('LEVEL_SERIES', () => {
  it(/* Pins the level series derived from the shared severity tokens, so each entry
       carries the level key plus the matching severity label and colour — kills the
       empty-object mutant in the `.map` callback. */
  'derives one entry per level with the severity label and colour', async () => {
    const { LEVEL_SERIES } = await freshChartSeries()
    expect(LEVEL_SERIES).toEqual([
      { key: 'trace', label: 'Trace', color: '#93c5fd' },
      { key: 'debug', label: 'Debug', color: '#60a5fa' },
      { key: 'info', label: 'Info', color: '#22c55e' },
      { key: 'warn', label: 'Warn', color: '#f59e0b' },
      { key: 'error', label: 'Error', color: '#ef4444' },
      { key: 'fatal', label: 'Fatal', color: '#a855f7' },
    ])
  })
})
