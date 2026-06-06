/**
 * Unit tests for `AdminController`.
 *
 * Covers the `PATCH /admin/log-level` handler:
 *   - it Zod-validates the raw request body against `logLevelSchema` before delegating,
 *   - it forwards the parsed DTO to `AdminService.setLogLevel` and returns its result,
 *   - it rejects an invalid body by throwing (the Zod parse failure) so the service is
 *     never reached with bad input.
 *
 * The service is mocked; the controller is constructed directly without the Nest DI
 * container since the constructor only takes the service dependency.
 */
import { describe, expect, it, jest, beforeEach } from '@jest/globals'

import { AdminController } from './admin.controller.js'
import { AdminService } from './admin.service.js'

/**
 * Builds an `AdminController` wired to a mock `AdminService` whose `setLogLevel`
 * returns a fixed transition payload.
 */
function buildController(): {
  controller: AdminController
  setLogLevelSpy: ReturnType<typeof jest.fn>
} {
  const setLogLevelSpy = jest
    .fn<AdminService['setLogLevel']>()
    .mockReturnValue({ previous: 'info', current: 'debug' })
  const service = { setLogLevel: setLogLevelSpy } as unknown as AdminService
  const controller = new AdminController(service)
  return { controller, setLogLevelSpy }
}

describe('AdminController.setLogLevel', () => {
  beforeEach(() => {
    jest.clearAllMocks()
  })

  /**
   * Happy path: a well-formed body must be parsed and the resulting DTO forwarded to
   * the service unchanged, with the controller returning the service's transition result.
   */
  it('parses the body and delegates the validated DTO to the service', () => {
    const { controller, setLogLevelSpy } = buildController()

    const result = controller.setLogLevel({ level: 'debug' })

    expect(setLogLevelSpy).toHaveBeenCalledTimes(1)
    expect(setLogLevelSpy).toHaveBeenCalledWith({ level: 'debug' })
    expect(result).toEqual({ previous: 'info', current: 'debug' })
  })

  /**
   * Validation gate: an unknown level value must fail `logLevelSchema.parse`, causing the
   * handler to throw before reaching the service — bad input never mutates the log level.
   */
  it('throws on an invalid level and never calls the service', () => {
    const { controller, setLogLevelSpy } = buildController()

    expect(() => controller.setLogLevel({ level: 'verbose' })).toThrow()
    expect(setLogLevelSpy).not.toHaveBeenCalled()
  })

  /**
   * Validation gate: a body missing the `level` key (or otherwise non-conforming) must
   * also fail the Zod parse, guaranteeing the service contract receives a typed DTO.
   */
  it('throws on a body missing the level field', () => {
    const { controller, setLogLevelSpy } = buildController()

    expect(() => controller.setLogLevel({})).toThrow()
    expect(setLogLevelSpy).not.toHaveBeenCalled()
  })
})
