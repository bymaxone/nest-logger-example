/**
 * Unit tests for `PaymentsController`.
 *
 * Covers the single `POST /payments` handler:
 *   - It validates the raw body through `createPaymentSchema.parse(...)` and rejects
 *     malformed input by surfacing the Zod error (no try/catch at this layer).
 *   - It delegates the parsed DTO to `PaymentsService.charge` and returns its (rejected)
 *     result unchanged — the controller must NOT swallow the service's error, which is what
 *     keeps the library `HttpExceptionFilter` logging `HTTP_EXCEPTION_HANDLED` exactly once.
 *
 * The controller is constructed directly with a mocked `PaymentsService`; no DI is needed.
 */
import { describe, expect, it, jest, beforeEach } from '@jest/globals'
import { ZodError } from 'zod'

import type { PaymentsService } from './payments.service.js'
import { PaymentsController } from './payments.controller.js'

/** Minimal mocked service surface the controller delegates to. */
interface ServiceMock {
  charge: ReturnType<typeof jest.fn>
}

describe('PaymentsController', () => {
  let serviceMock: ServiceMock
  let controller: PaymentsController

  beforeEach(() => {
    serviceMock = { charge: jest.fn() }
    controller = new PaymentsController(serviceMock as unknown as PaymentsService)
  })

  /**
   * Scenario: a well-formed body is posted.
   * Contract: the controller parses the body into a `CreatePaymentDto` and forwards exactly
   * that parsed object to `service.charge`, returning whatever the service returns — proving
   * the validate-then-delegate contract with no extra transformation.
   */
  it('parses the body and delegates the validated DTO to PaymentsService.charge', () => {
    const sentinel = Symbol('charge-result')
    serviceMock.charge.mockReturnValue(sentinel)

    const body = { orderId: 'order-1', amount: 2500, userId: 'user-1' }
    const result = controller.create(body)

    expect(serviceMock.charge).toHaveBeenCalledTimes(1)
    expect(serviceMock.charge).toHaveBeenCalledWith({
      orderId: 'order-1',
      amount: 2500,
      userId: 'user-1',
    })
    expect(result).toBe(sentinel)
  })

  /**
   * Scenario: the optional `userId` is omitted from the body.
   * Contract: the schema accepts the body without `userId` and the controller forwards a DTO
   * without that key — confirming the optional field is honoured end-to-end.
   */
  it('forwards a DTO without userId when the optional field is omitted', async () => {
    serviceMock.charge.mockReturnValue('ok')

    await controller.create({ orderId: 'order-2', amount: 100 })

    expect(serviceMock.charge).toHaveBeenCalledWith({ orderId: 'order-2', amount: 100 })
  })

  /**
   * Scenario: the service rejects (the deliberate decline).
   * Contract: the controller returns the service's Promise as-is and does NOT catch the
   * rejection — this is the double-log-avoidance guarantee (the library filter logs the
   * HttpException once; a controller try/catch would duplicate it).
   */
  it('returns the service rejection without catching it', async () => {
    const failure = new Error('Payment failed')
    serviceMock.charge.mockReturnValue(Promise.reject(failure))

    const returned = controller.create({ orderId: 'order-3', amount: 1, userId: 'user-3' })

    await expect(returned).rejects.toBe(failure)
  })

  /**
   * Scenario: a malformed body (missing required `orderId`) is posted.
   * Contract: `createPaymentSchema.parse` throws a `ZodError` and the controller lets it
   * propagate — the service is never called, proving validation gates delegation.
   */
  it('throws a ZodError and never calls the service when orderId is missing', () => {
    expect(() => controller.create({ amount: 100 })).toThrow(ZodError)
    expect(serviceMock.charge).not.toHaveBeenCalled()
  })

  /**
   * Scenario: a body whose `amount` violates the int/positive constraint is posted.
   * Contract: the schema's numeric refinements reject `amount` (non-positive / non-int) by
   * throwing a `ZodError` before the controller delegates, never reaching the service.
   */
  it('throws a ZodError for a non-positive amount and never calls the service', () => {
    expect(() => controller.create({ orderId: 'order-4', amount: 0 })).toThrow(ZodError)
    expect(serviceMock.charge).not.toHaveBeenCalled()
  })
})
