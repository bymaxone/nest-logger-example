/**
 * Unit tests for `PiiDemoController`.
 *
 * The controller is a thin REST surface that delegates to `PiiDemoService`. These
 * tests construct it directly with a mocked service and assert that each route:
 *   - delegates to the matching service method,
 *   - returns the service result verbatim,
 *   - and, for `signup`, parses the raw body through `signupSchema` before delegating
 *     (rejecting an invalid body and forwarding the parsed DTO on a valid one).
 */
import { describe, expect, it, jest, beforeEach } from '@jest/globals'

import type { PiiDemoService } from './pii-demo.service.js'
import type { SignupDto } from './dto/signup.dto.js'
import { PiiDemoController } from './pii-demo.controller.js'

/** Build a service mock exposing every method the controller delegates to. */
function makeServiceMock() {
  return {
    signup: jest.fn<(body: unknown) => { ok: true }>(() => ({ ok: true as const })),
    webhook: jest.fn(() => ({ ok: true as const })),
    nested: jest.fn(() => ({ ok: true as const })),
    echoHeaders: jest.fn<(headers: unknown) => { ok: true }>(() => ({ ok: true as const })),
    huge: jest.fn(() => ({ ok: true as const })),
  }
}

describe('PiiDemoController', () => {
  let pii: ReturnType<typeof makeServiceMock>
  let controller: PiiDemoController

  beforeEach(() => {
    pii = makeServiceMock()
    controller = new PiiDemoController(pii as unknown as PiiDemoService)
  })

  /**
   * `signup` must validate the raw body against `signupSchema` and delegate the parsed
   * DTO to the service, returning its result. Protects the parse-then-delegate contract.
   */
  it('signup parses the body via signupSchema and delegates the parsed DTO to the service', () => {
    const body = {
      nome: 'Ada Lovelace',
      email: 'ada@example.com',
      password: 'hunter2',
      cpf: '123.456.789-00',
      cardNumber: '4111111111111111',
      cardCvv: '123',
      payment: { cardNumber: '5500005555555559' },
    } satisfies SignupDto

    const result = controller.signup(body)

    expect(result).toEqual({ ok: true })
    expect(pii.signup).toHaveBeenCalledTimes(1)
    expect(pii.signup).toHaveBeenCalledWith(body)
  })

  /**
   * An invalid body (missing required fields / wrong types) must be rejected by
   * `signupSchema.parse` before the service is ever called. Protects input validation.
   */
  it('signup throws on an invalid body and never delegates to the service', () => {
    expect(() => controller.signup({ nome: '' })).toThrow()
    expect(pii.signup).not.toHaveBeenCalled()
  })

  /**
   * `webhook` must delegate to `PiiDemoService.webhook` and return its result.
   */
  it('webhook delegates to the service and returns its result', () => {
    const result = controller.webhook()

    expect(result).toEqual({ ok: true })
    expect(pii.webhook).toHaveBeenCalledTimes(1)
    expect(pii.webhook).toHaveBeenCalledWith()
  })

  /**
   * `nested` must delegate to `PiiDemoService.nested` and return its result.
   */
  it('nested delegates to the service and returns its result', () => {
    const result = controller.nested()

    expect(result).toEqual({ ok: true })
    expect(pii.nested).toHaveBeenCalledTimes(1)
    expect(pii.nested).toHaveBeenCalledWith()
  })

  /**
   * `echoHeaders` must forward the raw `@Headers()` map to the service and return its result.
   */
  it('echoHeaders forwards the headers map to the service and returns its result', () => {
    const headers = { authorization: 'Bearer secret', 'x-api-key': 'abc-123' }

    const result = controller.echoHeaders(headers)

    expect(result).toEqual({ ok: true })
    expect(pii.echoHeaders).toHaveBeenCalledTimes(1)
    expect(pii.echoHeaders).toHaveBeenCalledWith(headers)
  })

  /**
   * `huge` must delegate to `PiiDemoService.huge` and return its result.
   */
  it('huge delegates to the service and returns its result', () => {
    const result = controller.huge()

    expect(result).toEqual({ ok: true })
    expect(pii.huge).toHaveBeenCalledTimes(1)
    expect(pii.huge).toHaveBeenCalledWith()
  })
})
