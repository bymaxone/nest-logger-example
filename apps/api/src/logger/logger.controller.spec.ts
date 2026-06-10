/**
 * Unit coverage for `LoggerController` (`GET /logger/redact-paths`).
 *
 * Proves the controller:
 *   - Builds the RBAC context from request headers and DENIES viewers
 *     (`ForbiddenException`) — the redact-path list is operator/admin-only.
 *   - Delegates to `LogAuditService.listEffectiveRedactPaths()` for operators and
 *     admins and returns a fresh array copy (the spread `[...]` defensively decouples
 *     the response from the service's internal list).
 *
 * The controller is constructed directly with a mocked `LogAuditService`
 * (constructor injection — no DI container needed). `buildRbacContext` reads
 * `process.env.NODE_ENV`; the test runner sets it to `test`, which the demo RBAC
 * path permits.
 */
import { ForbiddenException } from '@nestjs/common'
import { describe, expect, it, jest } from '@jest/globals'

import type { LogAuditService } from './log-audit.service.js'
import { LoggerController } from './logger.controller.js'

/**
 * Build a `LoggerController` over a mocked audit service.
 *
 * @param effective - The list `listEffectiveRedactPaths` should return.
 * @returns The controller plus the mock fn for assertion.
 */
function makeController(effective: readonly string[]): {
  controller: LoggerController
  listEffective: jest.Mock
} {
  const listEffective = jest.fn(() => effective)
  const audit = { listEffectiveRedactPaths: listEffective } as unknown as LogAuditService
  return { controller: new LoggerController(audit), listEffective }
}

describe('LoggerController', () => {
  // ─── viewer denied ──────────────────────────────────────────────────────────

  /**
   * Scenario: caller sends `x-role: viewer`.
   * Contract: viewers cannot read the redact-path list — the controller throws
   * `ForbiddenException` and never touches the audit service.
   */
  it('throws ForbiddenException for a viewer and does not call the audit service', () => {
    const { controller, listEffective } = makeController(['x.y'])

    expect(() => controller.redactPaths({ 'x-role': 'viewer' })).toThrow(ForbiddenException)
    expect(listEffective).not.toHaveBeenCalled()
  })

  // ─── operator allowed (default role) ──────────────────────────────────────────

  /**
   * Scenario: no `x-role` header → `buildRbacContext` defaults to `operator`.
   * Contract: operators may read; the controller delegates to
   * `listEffectiveRedactPaths()` and returns its contents.
   */
  it('delegates to the audit service and returns the effective paths for the default (operator) role', () => {
    const effective = ['*.password', 'custom.token']
    const { controller, listEffective } = makeController(effective)

    const result = controller.redactPaths({})

    expect(listEffective).toHaveBeenCalledTimes(1)
    expect(result).toEqual(effective)
    // Returned value is a fresh copy — not the same reference the service handed back.
    expect(result).not.toBe(effective)
  })

  // ─── admin allowed ────────────────────────────────────────────────────────────

  /**
   * Scenario: caller sends `x-role: admin`.
   * Contract: admins may read; the controller returns the delegated list.
   */
  it('returns the effective paths for an admin', () => {
    const effective = ['email', 'cpf']
    const { controller, listEffective } = makeController(effective)

    expect(controller.redactPaths({ 'x-role': 'admin' })).toEqual(effective)
    expect(listEffective).toHaveBeenCalledTimes(1)
  })

  // ─── exact ForbiddenException message ─────────────────────────────────────────

  it('throws ForbiddenException with the exact viewer-denied message', () => {
    /**
     * Scenario: viewer calls GET /logger/redact-paths.
     * Rule: the ForbiddenException message must equal the exact string
     * `'Viewers cannot access the redact-path list'` — kills the StringLiteral
     * mutation that changes the message text while `toThrow(ForbiddenException)`
     * alone would still pass.
     */
    const { controller } = makeController(['x.y'])
    let thrown: unknown
    try {
      controller.redactPaths({ 'x-role': 'viewer' })
    } catch (e) {
      thrown = e
    }
    expect(thrown).toBeInstanceOf(ForbiddenException)
    expect((thrown as ForbiddenException).message).toBe(
      'Viewers cannot access the redact-path list',
    )
  })
})
