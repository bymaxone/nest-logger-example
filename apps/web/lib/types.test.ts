/**
 * @fileoverview Unit tests for the runtime surface of the data-layer types module.
 *
 * Everything in `lib/types` is a compile-time type except {@link ApiError}; these
 * tests pin the error's status carrying, message propagation, name override, and
 * its `instanceof Error` identity so callers can branch on `status` reliably.
 *
 * @module lib/types.test
 */
import { describe, expect, it } from 'vitest'

import { ApiError } from './types'

describe('ApiError', () => {
  it(/* The status code passed in must be readable as `.status` so callers can branch
       (e.g. 410 resets pagination, 403 is an RBAC denial). */
  'carries the HTTP status code', () => {
    const err = new ApiError(403, 'forbidden')
    expect(err.status).toBe(403)
  })

  it(/* The message must propagate to the standard Error `.message` so existing
       error-rendering paths keep working. */
  'propagates the message to Error.message', () => {
    const err = new ApiError(500, 'boom')
    expect(err.message).toBe('boom')
  })

  it(/* The name is overridden to "ApiError" so logs and toasts label it correctly
       rather than showing the generic "Error". */
  'overrides the error name to "ApiError"', () => {
    const err = new ApiError(404, 'missing')
    expect(err.name).toBe('ApiError')
  })

  it(/* It must remain a real Error subclass so `instanceof Error` checks and
       try/catch flows treat it normally. */
  'is an instance of both ApiError and Error', () => {
    const err = new ApiError(410, 'gone')
    expect(err).toBeInstanceOf(ApiError)
    expect(err).toBeInstanceOf(Error)
  })
})
