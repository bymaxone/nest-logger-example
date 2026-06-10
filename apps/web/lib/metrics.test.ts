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

describe('formatCount — boundary values', () => {
  /**
   * Exactly 1 000 000 is the million threshold.
   * `(1_000_000 / 1_000_000).toFixed(1) = '1.0'` → `'1.0M'`.
   */
  it('formats exactly 1 000 000 as 1.0M', () => {
    expect(formatCount(1_000_000)).toBe('1.0M')
  })

  /**
   * Exactly 1 000 is the thousand threshold.
   * `(1_000 / 1_000).toFixed(1) = '1.0'` → `'1.0k'`.
   */
  it('formats exactly 1 000 as 1.0k', () => {
    expect(formatCount(1_000)).toBe('1.0k')
  })

  /**
   * 999 is below both thresholds and must be rounded to a plain integer.
   */
  it('formats 999 as 999 with no suffix', () => {
    expect(formatCount(999)).toBe('999')
  })

  /** 0 is a valid count and must render as '0' (the Math.round path). */
  it('formats 0 as 0', () => {
    expect(formatCount(0)).toBe('0')
  })
})

describe('formatMs — boundary values', () => {
  /**
   * Exactly 1 000 ms is the seconds threshold.
   * `(1000 / 1000).toFixed(2) = '1.00'` → `'1.00s'`.
   */
  it('formats exactly 1000 ms as 1.00s', () => {
    expect(formatMs(1_000)).toBe('1.00s')
  })

  /**
   * 999 ms is below the threshold and must render as rounded milliseconds.
   */
  it('formats 999 ms as 999ms', () => {
    expect(formatMs(999)).toBe('999ms')
  })

  /** 0 ms formats as '0ms'. */
  it('formats 0 ms as 0ms', () => {
    expect(formatMs(0)).toBe('0ms')
  })
})

describe('statusTotals — multiple buckets', () => {
  /** Multiple buckets each reduce to the sum of their four status classes. */
  it('maps each bucket to the sum of all its status classes', () => {
    const rows: StatusMixRow[] = [
      { bucket: 'b1', s2xx: 10, s3xx: 0, s4xx: 2, s5xx: 1 },
      { bucket: 'b2', s2xx: 5, s3xx: 2, s4xx: 0, s5xx: 0 },
    ]
    expect(statusTotals(rows)).toEqual([
      { bucket: 'b1', total: 13 },
      { bucket: 'b2', total: 7 },
    ])
  })
})

describe('trendPct — multi-point even series', () => {
  /**
   * A four-element series splits evenly: earlier=[1,3], recent=[5,7].
   * avg(earlier)=2, avg(recent)=6; pct = (6−2)/2 × 100 = 200.
   * Pins the `Math.floor(series.length / 2)` midpoint split.
   */
  it('splits a four-element series evenly and returns the correct trend', () => {
    expect(trendPct([1, 3, 5, 7])).toBe(200)
  })
})

describe('trendPct — odd-length series (kills ArithmeticOperator mutation)', () => {
  /**
   * A three-element series splits as earlier=[10], recent=[20,30].
   * avg(earlier) = 10/1 = 10, avg(recent) = 50/2 = 25.
   * pct = (25−10)/10 × 100 = 150.
   *
   * The ArithmeticOperator→* mutation changes `/ xs.length` to `* xs.length`
   * inside the local `avg` helper. For even-length halves the percentage formula
   * cancels the length factor, so the result is identical. An odd-length split
   * (earlier.length ≠ recent.length) breaks the cancellation: with the mutation,
   * avg_mut(earlier)=10*1=10, avg_mut(recent)=50*2=100 → pct=900, not 150.
   */
  it('returns 150 for a three-element rising series [10, 20, 30]', () => {
    expect(trendPct([10, 20, 30])).toBe(150)
  })
})

describe('meanOf — exact value', () => {
  /** The mean of three numbers with nulls is the exact numeric mean. */
  it('returns the exact mean ignoring nulls', () => {
    expect(meanOf([1, null, 3, null, 5])).toBe(3)
  })
})

describe('pivotVolume — all six known levels counted', () => {
  /**
   * The ALL_LEVELS constant lists all six log levels. Tests for `fatal`, `debug`,
   * and `trace` are intentionally separate: each one passes a single-row input for
   * that level and asserts a non-zero count, catching any StringLiteral mutation
   * that replaces one of those level names with an empty string.
   */

  /**
   * A `fatal` row must populate `point.fatal`.
   * If `'fatal'` were replaced with `''` in ALL_LEVELS, the includes-guard would
   * reject the `fatal` row and leave the count at zero, failing this assertion.
   */
  it('assigns the count for the fatal level', () => {
    const [pt] = pivotVolume([{ bucket: 'b', level: 'fatal', n: 3 }])
    expect(pt!.fatal).toBe(3)
  })

  /**
   * A `debug` row must populate `point.debug`.
   * If `'debug'` were replaced with `''`, the includes-guard would skip `debug`
   * rows and the count would remain zero.
   */
  it('assigns the count for the debug level', () => {
    const [pt] = pivotVolume([{ bucket: 'b', level: 'debug', n: 4 }])
    expect(pt!.debug).toBe(4)
  })

  /**
   * A `trace` row must populate `point.trace`.
   * If `'trace'` were replaced with `''`, the includes-guard would skip `trace`
   * rows and the count would remain zero.
   */
  it('assigns the count for the trace level', () => {
    const [pt] = pivotVolume([{ bucket: 'b', level: 'trace', n: 7 }])
    expect(pt!.trace).toBe(7)
  })
})
