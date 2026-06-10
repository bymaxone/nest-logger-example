/**
 * OrdersService — hot-path logging, 404 lookup-miss, and `@LogPerformance` slow detection.
 *
 * Covers:
 *   - `create` persists via `prisma.order.create` and emits one `ORDER_CREATE_SUCCESS` info line.
 *   - `findOne` happy path emits `ORDER_LOOKUP_SUCCESS` and returns the order fields.
 *   - `findOne` miss path emits `ORDER_LOOKUP_MISS` (warn) and throws HttpException 404.
 *   - `slow` runs under the real `@LogPerformance(50)` wrapper; the 75 ms sleep exceeds the
 *     threshold so the decorator emits `METHOD_SLOW_EXECUTION` and the body emits
 *     `ORDER_SLOW_SUCCESS`.
 *
 * The unit is constructed directly with mocked `PinoLoggerService` and `PrismaService`
 * (the `@InjectLogger` decorator is metadata only — DI is bypassed). The mock logger MUST
 * expose `info` and `warnStructured` because `@LogPerformance` reads `this.logger`.
 */
import { HttpException, HttpStatus } from '@nestjs/common'
import type { PinoLoggerService } from '@bymax-one/nest-logger'
import { describe, it, expect, jest, beforeEach } from '@jest/globals'

import type { PrismaService } from '../prisma/prisma.service.js'
import { OrdersService } from './orders.service.js'

// ─── Mock factories ─────────────────────────────────────────────────────────

/** Build a logger mock exposing exactly the methods the service / decorator touch. */
function makeLogger() {
  return {
    info: jest.fn(),
    warnStructured: jest.fn(),
  } as unknown as PinoLoggerService
}

/** Build a Prisma mock exposing the `order` model methods the service touches. */
function makePrisma() {
  return {
    order: {
      create: jest.fn(),
      findUnique: jest.fn(),
    },
  } as unknown as PrismaService
}

// ─── Suite ──────────────────────────────────────────────────────────────────

describe('OrdersService (unit)', () => {
  let logger: PinoLoggerService
  let prisma: PrismaService
  let service: OrdersService

  beforeEach(() => {
    logger = makeLogger()
    prisma = makePrisma()
    service = new OrdersService(logger, prisma)
  })

  /**
   * `create` must persist amount + tenantId, emit a single `ORDER_CREATE_SUCCESS` info line
   * carrying the userId and order meta, and return the created id/amount. Protects the
   * hot-path structured-logging contract.
   */
  it('create persists the order and emits ORDER_CREATE_SUCCESS', async () => {
    const created = { id: 'ord_1', amount: 4200, tenantId: 't_1', status: 'PENDING' }
    ;(prisma.order.create as jest.Mock).mockResolvedValue(created as never)

    const result = await service.create({ amount: 4200, tenantId: 't_1', userId: 'u_1' })

    expect(prisma.order.create).toHaveBeenCalledWith({
      data: { amount: 4200, tenantId: 't_1' },
    })
    expect(logger.info).toHaveBeenCalledTimes(1)
    expect(logger.info).toHaveBeenCalledWith('ORDER_CREATE_SUCCESS', 'Order created', 'u_1', {
      orderId: 'ord_1',
      amount: 4200,
    })
    expect(result).toEqual({ id: 'ord_1', amount: 4200 })
  })

  /**
   * `create` with an absent optional userId still works: the userId argument is forwarded
   * as `undefined`. Protects the optional-userId branch of the logging call.
   */
  it('create forwards an undefined userId when none is supplied', async () => {
    const created = { id: 'ord_2', amount: 100, tenantId: 't_2', status: 'PENDING' }
    ;(prisma.order.create as jest.Mock).mockResolvedValue(created as never)

    const result = await service.create({ amount: 100, tenantId: 't_2' })

    expect(logger.info).toHaveBeenCalledWith('ORDER_CREATE_SUCCESS', 'Order created', undefined, {
      orderId: 'ord_2',
      amount: 100,
    })
    expect(result).toEqual({ id: 'ord_2', amount: 100 })
  })

  /**
   * `findOne` happy path: when the order exists it emits `ORDER_LOOKUP_SUCCESS` (info) and
   * returns id/amount/status. Protects the found branch and its return shape.
   */
  it('findOne returns the order and emits ORDER_LOOKUP_SUCCESS when found', async () => {
    const found = { id: 'ord_9', amount: 999, tenantId: 't_9', status: 'PAID' }
    ;(prisma.order.findUnique as jest.Mock).mockResolvedValue(found as never)

    const result = await service.findOne('ord_9')

    expect(prisma.order.findUnique).toHaveBeenCalledWith({ where: { id: 'ord_9' } })
    expect(logger.info).toHaveBeenCalledWith('ORDER_LOOKUP_SUCCESS', 'Order fetched', undefined, {
      orderId: 'ord_9',
    })
    expect(logger.warnStructured).not.toHaveBeenCalled()
    expect(result).toEqual({ id: 'ord_9', amount: 999, status: 'PAID' })
  })

  /**
   * `findOne` miss path: when the order is absent it emits `ORDER_LOOKUP_MISS` (warn) and
   * throws HttpException 404. Protects the not-found branch, the warn emission, and the
   * exact HTTP status contract.
   */
  it('findOne emits ORDER_LOOKUP_MISS and throws 404 when absent', async () => {
    ;(prisma.order.findUnique as jest.Mock).mockResolvedValue(null as never)

    await expect(service.findOne('missing')).rejects.toBeInstanceOf(HttpException)
    await expect(service.findOne('missing')).rejects.toMatchObject({
      status: HttpStatus.NOT_FOUND,
    })

    expect(logger.warnStructured).toHaveBeenCalledWith(
      'ORDER_LOOKUP_MISS',
      'Order not found',
      undefined,
      { orderId: 'missing' },
    )
    // The success info line must NOT be emitted on the miss path.
    expect(logger.info).not.toHaveBeenCalledWith(
      'ORDER_LOOKUP_SUCCESS',
      expect.anything(),
      expect.anything(),
      expect.anything(),
    )
  })

  it('findOne throws an HttpException whose response body contains the exact "Order not found" message', async () => {
    /**
     * Scenario: the order is absent.
     * Rule: `new HttpException('Order not found', HttpStatus.NOT_FOUND)` must carry
     * the exact response string `'Order not found'` — kills the StringLiteral mutation
     * that changes the message text while `rejects.toBeInstanceOf(HttpException)` alone
     * would still pass.
     */
    ;(prisma.order.findUnique as jest.Mock).mockResolvedValue(null as never)

    let thrown: unknown
    try {
      await service.findOne('missing')
    } catch (e) {
      thrown = e
    }
    const resp = (thrown as HttpException).getResponse()
    expect(resp).toBe('Order not found')
  })

  /**
   * `slow` runs under the real `@LogPerformance(50)` wrapper. Its 75 ms sleep exceeds the
   * 50 ms threshold, so the decorator must emit `METHOD_SLOW_EXECUTION` (warn) while the
   * method body emits `ORDER_SLOW_SUCCESS` (info) and returns `{ ok: true }`. Protects the
   * over-threshold branch of the performance decorator end-to-end.
   */
  it('slow returns { ok: true } and triggers METHOD_SLOW_EXECUTION above the threshold', async () => {
    const result = await service.slow()

    expect(result).toEqual({ ok: true })
    expect(logger.info).toHaveBeenCalledWith('ORDER_SLOW_SUCCESS', 'Slow path completed')
    expect(logger.warnStructured).toHaveBeenCalledTimes(1)
    expect(logger.warnStructured).toHaveBeenCalledWith(
      'METHOD_SLOW_EXECUTION',
      expect.stringContaining('OrdersService.slow took'),
      undefined,
      expect.objectContaining({
        method: 'OrdersService.slow',
        thresholdMs: 50,
      }),
    )
  })
})
