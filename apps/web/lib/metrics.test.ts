/**
 * @fileoverview Unit tests for the pure aggregate transforms in `lib/metrics`.
 *
 * Each helper is exercised table-driven across every branch: the volume pivot
 * (new bucket, repeat bucket, known vs unknown level), level sums, status totals,
 * the two mean helpers (empty + null-skipping), the trend direction (short series,
 * zero baseline, both-zero, rising/falling), and the count/duration/timestamp
 * formatters (each magnitude boundary, plus the unparseable-timestamp fallback).
 *
 * @module lib/metrics.test
 */
import { describe, expect, it } from 'vitest'

import type { ErrorRateRow, StatusMixRow, VolumeRow } from './types'
import {
  formatBucket,
  formatCount,
  formatMs,
  meanErrorRate,
  meanOf,
  pivotVolume,
  statusTotals,
  sumLevels,
  trendPct,
} from './metrics'

describe('pivotVolume', () => {
  it(/* An empty input yields an empty output — the no-rows branch of the loop. */
  'returns no points for no rows', () => {
    expect(pivotVolume([])).toEqual([])
  })

  it(/* Rows for one bucket across two levels collapse into a single wide point with
       all other levels zero-filled — covers the new-bucket and the repeat-bucket
       (point already exists) branches plus the known-level assignment. */
  'pivots rows of the same bucket into one zero-filled wide point', () => {
    const rows: VolumeRow[] = [
      { bucket: '2026-06-05T10:00:00Z', level: 'error', n: 3 },
      { bucket: '2026-06-05T10:00:00Z', level: 'info', n: 7 },
    ]
    expect(pivotVolume(rows)).toEqual([
      {
        bucket: '2026-06-05T10:00:00Z',
        fatal: 0,
        error: 3,
        warn: 0,
        info: 7,
        debug: 0,
        trace: 0,
      },
    ])
  })

  it(/* Distinct buckets produce distinct points in first-seen order. */
  'emits one point per distinct bucket in order', () => {
    const rows: VolumeRow[] = [
      { bucket: 'b1', level: 'warn', n: 1 },
      { bucket: 'b2', level: 'warn', n: 2 },
    ]
    const out = pivotVolume(rows)
    expect(out.map((p) => p.bucket)).toEqual(['b1', 'b2'])
    expect(out[0]!.warn).toBe(1)
    expect(out[1]!.warn).toBe(2)
  })

  it(/* A row whose level is not one of the known levels is ignored (stays zero) —
       covers the false branch of the `includes(row.level)` guard. */
  'ignores rows carrying an unknown level', () => {
    const rows: VolumeRow[] = [
      { bucket: 'b1', level: 'info', n: 5 },
      { bucket: 'b1', level: 'bogus', n: 99 },
    ]
    const [point] = pivotVolume(rows)
    expect(point!.info).toBe(5)
    // The unknown level contributes nothing; every known level except info is zero.
    expect(point).toEqual({
      bucket: 'b1',
      fatal: 0,
      error: 0,
      warn: 0,
      info: 5,
      debug: 0,
      trace: 0,
    })
  })
})

describe('sumLevels', () => {
  it(/* Only the requested levels contribute — covers both the matched (accumulate)
       and unmatched (skip) reducer branches. */
  'sums counts only for the requested levels', () => {
    const rows: VolumeRow[] = [
      { bucket: 'b1', level: 'error', n: 2 },
      { bucket: 'b1', level: 'fatal', n: 1 },
      { bucket: 'b1', level: 'info', n: 10 },
    ]
    expect(sumLevels(rows, ['error', 'fatal'])).toBe(3)
  })

  it(/* No rows sums to zero — the reducer's initial value. */
  'returns zero for no rows', () => {
    expect(sumLevels([], ['error'])).toBe(0)
  })
})

describe('statusTotals', () => {
  it(/* Each bucket maps to the sum of all four status classes — the traffic proxy. */
  'reduces each bucket to the sum of its status classes', () => {
    const rows: StatusMixRow[] = [{ bucket: 'b1', s2xx: 4, s3xx: 1, s4xx: 2, s5xx: 3 }]
    expect(statusTotals(rows)).toEqual([{ bucket: 'b1', total: 10 }])
  })

  it(/* No rows yields no totals. */
  'returns no totals for no rows', () => {
    expect(statusTotals([])).toEqual([])
  })
})

describe('meanErrorRate', () => {
  it(/* Null buckets are skipped and the mean is over the remaining values. */
  'averages only the non-null buckets', () => {
    const rows: ErrorRateRow[] = [
      { bucket: 'b1', errorRate: 0.2 },
      { bucket: 'b2', errorRate: null },
      { bucket: 'b3', errorRate: 0.4 },
    ]
    expect(meanErrorRate(rows)).toBeCloseTo(0.3)
  })

  it(/* With no non-null values the mean is zero — the empty-after-filter branch. */
  'returns zero when there is no data', () => {
    const rows: ErrorRateRow[] = [{ bucket: 'b1', errorRate: null }]
    expect(meanErrorRate(rows)).toBe(0)
  })
})

describe('meanOf', () => {
  it(/* Nulls are ignored and the mean is over the numbers. */
  'averages ignoring null entries', () => {
    expect(meanOf([2, null, 4])).toBe(3)
  })

  it(/* An empty (or all-null) series averages to zero. */
  'returns zero when empty', () => {
    expect(meanOf([null, null])).toBe(0)
  })
})

describe('trendPct', () => {
  it(/* A series shorter than two points has no direction — returns zero. */
  'returns zero for fewer than two points', () => {
    expect(trendPct([5])).toBe(0)
  })

  it(/* Equal halves mean no change. */
  'returns zero for a flat series', () => {
    expect(trendPct([4, 4])).toBe(0)
  })

  it(/* A rising recent half yields a positive percent change. */
  'returns a positive percent for a rising series', () => {
    // earlier = [10], recent = [20] → +100%.
    expect(trendPct([10, 20])).toBe(100)
  })

  it(/* A falling recent half yields a negative percent change. */
  'returns a negative percent for a falling series', () => {
    // earlier = [20], recent = [10] → -50%.
    expect(trendPct([20, 10])).toBe(-50)
  })

  it(/* A zero earlier baseline with a non-zero recent half reads as +100% (rising
       from nothing) — covers `a === 0 && b !== 0`. */
  'returns 100 when rising from a zero baseline', () => {
    expect(trendPct([0, 5])).toBe(100)
  })

  it(/* Both halves averaging zero is flat — covers `a === 0 && b === 0`. */
  'returns zero when both halves are zero', () => {
    expect(trendPct([0, 0])).toBe(0)
  })
})

describe('formatCount', () => {
  it(/* Millions collapse to one decimal with an "M" suffix. */
  'formats millions with an M suffix', () => {
    expect(formatCount(2_500_000)).toBe('2.5M')
  })

  it(/* Thousands collapse to one decimal with a "k" suffix. */
  'formats thousands with a k suffix', () => {
    expect(formatCount(1234)).toBe('1.2k')
  })

  it(/* Sub-thousand counts are rounded integers with no suffix. */
  'formats sub-thousand counts as rounded integers', () => {
    expect(formatCount(42.6)).toBe('43')
  })
})

describe('formatMs', () => {
  it(/* A second or more renders as fixed-two seconds. */
  'formats durations of a second or more as seconds', () => {
    expect(formatMs(1500)).toBe('1.50s')
  })

  it(/* Sub-second durations render as rounded milliseconds. */
  'formats sub-second durations as milliseconds', () => {
    expect(formatMs(240.4)).toBe('240ms')
  })
})

describe('formatBucket', () => {
  it(/* A parseable ISO timestamp renders as a short HH:MM label. */
  'formats a valid ISO timestamp as a short time label', () => {
    const out = formatBucket('2026-06-05T10:30:00Z')
    // Locale/timezone vary, but a valid time always contains "30" minutes here.
    expect(out).toMatch(/30/)
    expect(out).not.toBe('2026-06-05T10:30:00Z')
  })

  it(/* An unparseable value falls through unchanged — the NaN-time fallback branch. */
  'returns the raw value when the timestamp is unparseable', () => {
    expect(formatBucket('not-a-date')).toBe('not-a-date')
  })
})
