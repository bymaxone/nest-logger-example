/**
 * Unit tests for `PaymentsService`.
 *
 * Covers the deliberate error-path demo:
 *   - `charge()` emits `PAYMENT_CHARGE_ATTEMPT` via `logger.info` with the userId and meta.
 *   - It emits `PAYMENT_CHARGE_FAILED` via `logger.errorStructured` passing the Error OBJECT
 *     (never a string) as the 2nd arg, with the userId and `{ orderId }` meta.
 *   - It always throws an `HttpException` with status 402 (PAYMENT_REQUIRED) — proving the
 *     handled-exception path the library `HttpExceptionFilter` relies on for double-log avoidance.
 *   - The `@LogPerformance()` wrapper fires its timing log (`METHOD_EXECUTION`) in its `finally`
 *     block even though the wrapped method throws.
 *
 * The service is constructed directly with a mocked `PinoLoggerService`; no DI container is needed.
 */
import { HttpException, HttpStatus } from '@nestjs/common'
import { describe, expect, it, jest, beforeEach } from '@jest/globals'

import type { PinoLoggerService } from '@bymax-one/nest-logger'
import type { CreatePaymentDto } from './dto/create-payment.dto.js'
import { PaymentsService } from './payments.service.js'

/** Minimal mocked logger surface the service (and the `@LogPerformance` wrapper) touches. */
interface LoggerMock {
  info: ReturnType<typeof jest.fn>
  errorStructured: ReturnType<typeof jest.fn>
  warnStructured: ReturnType<typeof jest.fn>
}

describe('PaymentsService', () => {
  let logger: LoggerMock
  let service: PaymentsService

  beforeEach(() => {
    // `info`/`warnStructured` are also read by the `@LogPerformance` timing wrapper;
    // `errorStructured` is read by the service's own failure log.
    logger = {
      info: jest.fn(),
      errorStructured: jest.fn(),
      warnStructured: jest.fn(),
    }
    service = new PaymentsService(logger as unknown as PinoLoggerService)
  })

  /**
   * Scenario: a valid charge request is processed.
   * Contract: `charge()` always rejects with an `HttpException` whose status is
   * `402 PAYMENT_REQUIRED` — the deliberate decline that exercises the handled-exception
   * path. This protects the demo's core invariant that the gateway always declines.
   */
  it('always throws HttpException 402 (PAYMENT_REQUIRED)', async () => {
    const dto: CreatePaymentDto = { orderId: 'order-1', amount: 1500, userId: 'user-9' }

    await expect(service.charge(dto)).rejects.toBeInstanceOf(HttpException)

    let caught: HttpException | undefined
    try {
      await service.charge(dto)
    } catch (err) {
      caught = err as HttpException
    }
    expect(caught).toBeInstanceOf(HttpException)
    expect(caught?.getStatus()).toBe(HttpStatus.PAYMENT_REQUIRED)
    expect(caught?.message).toBe('Payment failed')
  })

  /**
   * Scenario: the charge attempt is logged before the gateway call.
   * Contract: `logger.info('PAYMENT_CHARGE_ATTEMPT', ...)` is called with the message,
   * the dto's `userId`, and `{ orderId, amount }` meta — proving the attempt is recorded
   * with the structured fields downstream alerting depends on.
   */
  it('logs PAYMENT_CHARGE_ATTEMPT with userId and { orderId, amount } meta', async () => {
    const dto: CreatePaymentDto = { orderId: 'order-7', amount: 4200, userId: 'user-42' }

    await expect(service.charge(dto)).rejects.toBeInstanceOf(HttpException)

    expect(logger.info).toHaveBeenCalledWith(
      'PAYMENT_CHARGE_ATTEMPT',
      'Charge initiated',
      'user-42',
      {
        orderId: 'order-7',
        amount: 4200,
      },
    )
  })

  /**
   * Scenario: the gateway declines and the failure is logged structurally.
   * Contract: `logger.errorStructured('PAYMENT_CHARGE_FAILED', error, userId, { orderId })`
   * is called with the Error OBJECT (not a string) as the 2nd arg, carrying the
   * order-specific decline message — this is the exact `errorStructured` shape the library
   * expects (Error object, then userId, then meta).
   */
  it('logs PAYMENT_CHARGE_FAILED with the Error object, userId and { orderId } meta', async () => {
    const dto: CreatePaymentDto = { orderId: 'order-3', amount: 999, userId: 'user-3' }

    await expect(service.charge(dto)).rejects.toBeInstanceOf(HttpException)

    expect(logger.errorStructured).toHaveBeenCalledTimes(1)
    const call = logger.errorStructured.mock.calls[0] as [
      string,
      Error,
      string,
      { orderId: string },
    ]
    expect(call[0]).toBe('PAYMENT_CHARGE_FAILED')
    expect(call[1]).toBeInstanceOf(Error)
    expect(call[1].message).toBe('Gateway declined charge for order order-3')
    expect(call[2]).toBe('user-3')
    expect(call[3]).toEqual({ orderId: 'order-3' })
  })

  /**
   * Scenario: `userId` is optional on the DTO and omitted.
   * Contract: the service passes `undefined` straight through to both the attempt log and
   * the failure log without substituting a default — it must not crash on the optional field.
   */
  it('passes undefined userId through to both logs when userId is omitted', async () => {
    const dto: CreatePaymentDto = { orderId: 'order-x', amount: 10 }

    await expect(service.charge(dto)).rejects.toBeInstanceOf(HttpException)

    expect(logger.info).toHaveBeenCalledWith(
      'PAYMENT_CHARGE_ATTEMPT',
      'Charge initiated',
      undefined,
      {
        orderId: 'order-x',
        amount: 10,
      },
    )
    const failCall = logger.errorStructured.mock.calls[0] as [
      string,
      Error,
      string | undefined,
      unknown,
    ]
    expect(failCall[2]).toBeUndefined()
  })

  /**
   * Scenario: the `@LogPerformance()` wrapper measures the call.
   * Contract: even though `charge` throws, the decorator's `finally` block still emits the
   * fast-path timing log `METHOD_EXECUTION` via `logger.info` (the elapsed time is far below
   * the default 1000ms threshold), proving the performance wrapper is active on the method.
   */
  it('emits the METHOD_EXECUTION timing log from @LogPerformance despite the throw', async () => {
    const dto: CreatePaymentDto = { orderId: 'order-perf', amount: 5, userId: 'user-perf' }

    await expect(service.charge(dto)).rejects.toBeInstanceOf(HttpException)

    const methodExecutionCalls = logger.info.mock.calls.filter(
      (args) => (args as unknown[])[0] === 'METHOD_EXECUTION',
    )
    expect(methodExecutionCalls).toHaveLength(1)
    // Fast path stays under threshold → no slow-execution warning.
    const slowCalls = logger.warnStructured.mock.calls.filter(
      (args) => (args as unknown[])[0] === 'METHOD_SLOW_EXECUTION',
    )
    expect(slowCalls).toHaveLength(0)
  })
})
