/**
 * @fileoverview Unit tests for {@link explorerHref} — the Explorer deep-link
 * builder shared by the Trigger Center and the incident list.
 *
 * @module lib/explorer-link.test
 */
import { describe, expect, it } from 'vitest'

import { explorerHref } from './explorer-link'

describe('explorerHref', () => {
  /**
   * A requestId pivot must set the `requestId` param and apply the default
   * relative range so the just-fired request falls inside the window.
   */
  it('builds a requestId link with the default relative range', () => {
    const href = explorerHref({ requestId: 'req_123' })
    const params = new URLSearchParams(href.split('?')[1])
    expect(params.get('requestId')).toBe('req_123')
    expect(params.get('range')).toBe('15m')
    expect(params.get('from')).toBeNull()
  })

  /**
   * A traceId pivot (cross-service) must set the `traceId` param so the Explorer
   * shows every service row sharing that trace.
   */
  it('builds a traceId link', () => {
    const href = explorerHref({ traceId: 'trace_abc' })
    expect(href).toContain('traceId=trace_abc')
  })

  /**
   * An explicit absolute window (burst) must use `from`/`to` and omit the
   * relative `range` so the link targets exactly the burst interval.
   */
  it('uses an absolute from/to window over the relative range', () => {
    const href = explorerHref({
      logKey: 'TRIGGER_BURST_TICK',
      from: '2026-06-04T00:00:00.000Z',
      to: '2026-06-04T00:01:00.000Z',
    })
    const params = new URLSearchParams(href.split('?')[1])
    expect(params.get('logKey')).toBe('TRIGGER_BURST_TICK')
    expect(params.get('from')).toBe('2026-06-04T00:00:00.000Z')
    expect(params.get('to')).toBe('2026-06-04T00:01:00.000Z')
    expect(params.get('range')).toBeNull()
  })

  /**
   * Empty-string fields must be skipped so a blank correlation id never produces
   * a dangling, match-nothing query param.
   */
  it('omits empty-string fields', () => {
    const href = explorerHref({ requestId: '', traceId: 'trace_only' })
    const params = new URLSearchParams(href.split('?')[1])
    expect(params.get('requestId')).toBeNull()
    expect(params.get('traceId')).toBe('trace_only')
  })

  /**
   * An absolute `from` with no `to` (open-ended window) sets `from`, omits `to`,
   * and still drops the relative `range` — the absolute branch wins even when the
   * upper bound is left unset.
   */
  it('sets from without to when only the lower bound is given', () => {
    const href = explorerHref({ from: '2026-06-04T00:00:00.000Z' })
    const params = new URLSearchParams(href.split('?')[1])
    expect(params.get('from')).toBe('2026-06-04T00:00:00.000Z')
    expect(params.get('to')).toBeNull()
    expect(params.get('range')).toBeNull()
  })

  /**
   * An empty-string `to` alongside a real `from` is treated as "no upper bound":
   * `to` is skipped so a blank value never reaches the Explorer query state.
   */
  it('skips an empty-string to while keeping the from window', () => {
    const href = explorerHref({ from: '2026-06-04T00:00:00.000Z', to: '' })
    const params = new URLSearchParams(href.split('?')[1])
    expect(params.get('from')).toBe('2026-06-04T00:00:00.000Z')
    expect(params.get('to')).toBeNull()
  })

  /**
   * A caller-supplied relative `range` overrides the default so a non-id pivot can
   * widen or narrow the window (covers the `range ?? DEFAULT_RANGE` left branch).
   */
  it('honours an explicit relative range over the default', () => {
    const href = explorerHref({ logKey: 'PAYMENT_CHARGE_FAILED', range: '1h' })
    const params = new URLSearchParams(href.split('?')[1])
    expect(params.get('range')).toBe('1h')
    expect(params.get('logKey')).toBe('PAYMENT_CHARGE_FAILED')
  })

  /** The href must be root-relative and begin with the exact `/explorer?` prefix. */
  it('returns an href rooted at /explorer', () => {
    const href = explorerHref({ requestId: 'req_x' })
    expect(href.startsWith('/explorer?')).toBe(true)
  })

  /**
   * An empty-string `traceId` must be omitted so the Explorer does not receive
   * a blank trace filter (covers the `!== ''` guard on the traceId branch).
   */
  it('omits an empty-string traceId', () => {
    const href = explorerHref({ traceId: '' })
    const params = new URLSearchParams(href.split('?')[1])
    expect(params.get('traceId')).toBeNull()
    // Falls back to the default relative range.
    expect(params.get('range')).toBe('15m')
  })

  /**
   * An empty-string `logKey` must be omitted so the Explorer does not apply a
   * blank key filter (covers the `!== ''` guard on the logKey branch).
   */
  it('omits an empty-string logKey', () => {
    const href = explorerHref({ logKey: '' })
    const params = new URLSearchParams(href.split('?')[1])
    expect(params.get('logKey')).toBeNull()
  })

  /**
   * An empty-string `from` must NOT trigger the absolute-window branch — the
   * function falls through to the relative range (covers the `!== ''` guard on from).
   */
  it('falls back to relative range when from is an empty string', () => {
    const href = explorerHref({ from: '' })
    const params = new URLSearchParams(href.split('?')[1])
    expect(params.get('from')).toBeNull()
    expect(params.get('range')).toBe('15m')
  })

  /**
   * The default range is exactly `15m` — pins the `DEFAULT_RANGE` constant so a
   * mutation to its value (e.g. `'1h'`) is caught.
   */
  it('applies the 15m default range when no range or from/to is given', () => {
    const params = new URLSearchParams(explorerHref({ requestId: 'r1' }).split('?')[1])
    expect(params.get('range')).toBe('15m')
  })
})

describe('explorerHref — absent optional fields must not appear in the URL', () => {
  /**
   * When `traceId` is not provided the URL must not contain a `traceId=`
   * param at all. Asserting null kills the ConditionalExpression→true mutation
   * that always calls `params.set('traceId', undefined)` regardless of whether
   * the field is present.
   */
  it('omits traceId from the URL when target.traceId is undefined', () => {
    const href = explorerHref({ requestId: 'req_1' })
    const params = new URLSearchParams(href.split('?')[1])
    expect(params.get('traceId')).toBeNull()
  })

  /**
   * When `requestId` is not provided the URL must not contain a `requestId=`
   * param. Mirrors the traceId guard test and kills the ConditionalExpression→true
   * mutation on the `target.requestId !== undefined` branch.
   */
  it('omits requestId from the URL when target.requestId is undefined', () => {
    const href = explorerHref({ traceId: 'trace_1' })
    const params = new URLSearchParams(href.split('?')[1])
    expect(params.get('requestId')).toBeNull()
  })

  /**
   * When `logKey` is not provided the URL must not contain a `logKey=` param.
   * Kills the ConditionalExpression→true mutation on the `target.logKey !== undefined`
   * branch that always calls `params.set('logKey', undefined)`.
   */
  it('omits logKey from the URL when target.logKey is undefined', () => {
    const href = explorerHref({ requestId: 'req_1' })
    const params = new URLSearchParams(href.split('?')[1])
    expect(params.get('logKey')).toBeNull()
  })
})
