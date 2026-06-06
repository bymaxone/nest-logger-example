/**
 * DownstreamController — delegation unit coverage.
 *
 * Proves `POST /downstream/dispatch` is a thin delegate: it forwards to
 * `DownstreamService.dispatch()` and returns its `{ auto, manual }` result
 * verbatim without reshaping it. The service is mocked so the test asserts on
 * the controller's wiring alone.
 */
import { describe, expect, it, jest } from '@jest/globals'

import { DownstreamController } from './downstream.controller.js'
import type { DownstreamService } from './downstream.service.js'

describe('DownstreamController — dispatch delegation (unit)', () => {
  /**
   * `dispatch()` must delegate to `DownstreamService.dispatch()` exactly once and
   * return the service result unchanged — the controller adds no transformation.
   */
  it('delegates to DownstreamService.dispatch and returns its result verbatim', () => {
    const expected = { auto: true, manual: false }
    const dispatch = jest
      .fn<() => Promise<{ auto: boolean; manual: boolean }>>()
      .mockResolvedValue(expected)
    const service = { dispatch } as unknown as DownstreamService
    const controller = new DownstreamController(service)

    const result = controller.dispatch()

    expect(dispatch).toHaveBeenCalledTimes(1)
    // The controller returns the service's promise directly (no await/reshape).
    return expect(result).resolves.toBe(expected)
  })
})
