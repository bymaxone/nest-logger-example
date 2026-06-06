/**
 * OrdersController — thin delegation + DTO validation unit coverage.
 *
 * Covers:
 *   - `create` parses the body against `createOrderSchema` and delegates to
 *     `OrdersService.create`, returning the service result. An invalid body makes
 *     `schema.parse` throw before the service is touched.
 *   - `slow` delegates to `OrdersService.slow` and returns its result.
 *   - `findOne` delegates to `OrdersService.findOne` with the route id and returns its result.
 *
 * The controller is constructed directly with a mocked `OrdersService` — no DI container.
 */
import { ZodError } from 'zod'
import { describe, it, expect, jest, beforeEach } from '@jest/globals'

import { OrdersController } from './orders.controller.js'
import type { OrdersService } from './orders.service.js'

// ─── Mock factory ───────────────────────────────────────────────────────────

/** Build a service mock exposing exactly the methods the controller delegates to. */
function makeService() {
  return {
    create: jest.fn(),
    slow: jest.fn(),
    findOne: jest.fn(),
  } as unknown as OrdersService
}

// ─── Suite ──────────────────────────────────────────────────────────────────

describe('OrdersController (unit)', () => {
  let service: OrdersService
  let controller: OrdersController

  beforeEach(() => {
    service = makeService()
    controller = new OrdersController(service)
  })

  /**
   * `create` must validate the raw body with `createOrderSchema.parse`, pass the parsed DTO
   * to the service, and return whatever the service returns. Protects the parse-then-delegate
   * contract on the create route.
   */
  it('create parses the body and delegates to OrdersService.create', () => {
    const serviceResult = { id: 'ord_1', amount: 4200 }
    ;(service.create as jest.Mock).mockReturnValue(serviceResult as never)

    const body = { amount: 4200, tenantId: 't_1', userId: 'u_1' }
    const result = controller.create(body)

    expect(service.create).toHaveBeenCalledTimes(1)
    expect(service.create).toHaveBeenCalledWith({ amount: 4200, tenantId: 't_1', userId: 'u_1' })
    expect(result).toBe(serviceResult)
  })

  /**
   * `create` must reject an invalid body at the schema boundary: `schema.parse` throws a
   * `ZodError` and the service is never invoked. Protects DTO validation precedence.
   */
  it('create throws ZodError and never calls the service on an invalid body', () => {
    expect(() => controller.create({ amount: -1, tenantId: '' })).toThrow(ZodError)
    expect(service.create).not.toHaveBeenCalled()
  })

  /**
   * `slow` is a pure delegation: it returns exactly what `OrdersService.slow` returns.
   * Protects the slow route wiring.
   */
  it('slow delegates to OrdersService.slow and returns its result', () => {
    const promised = Promise.resolve({ ok: true as const })
    ;(service.slow as jest.Mock).mockReturnValue(promised as never)

    const result = controller.slow()

    expect(service.slow).toHaveBeenCalledTimes(1)
    expect(result).toBe(promised)
  })

  /**
   * `findOne` must forward the route id parameter to `OrdersService.findOne` and return its
   * result. Protects the id pass-through on the lookup route.
   */
  it('findOne delegates to OrdersService.findOne with the route id', () => {
    const promised = Promise.resolve({ id: 'ord_9', amount: 999, status: 'PAID' })
    ;(service.findOne as jest.Mock).mockReturnValue(promised as never)

    const result = controller.findOne('ord_9')

    expect(service.findOne).toHaveBeenCalledTimes(1)
    expect(service.findOne).toHaveBeenCalledWith('ord_9')
    expect(result).toBe(promised)
  })
})
