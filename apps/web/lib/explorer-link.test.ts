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
})
