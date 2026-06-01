/**
 * Payments service — `@LogPerformance`, `errorStructured`, and double-log avoidance demo.
 *
 * Demonstrates:
 *   - `@LogPerformance()` (no threshold → always emits `METHOD_EXECUTION`).
 *   - `errorStructured(logKey, Error, userId, meta)` with the Error OBJECT as 2nd arg.
 *   - Throwing `HttpException` after logging so the library `HttpExceptionFilter` emits
 *     exactly one `HTTP_EXCEPTION_HANDLED` (double-log avoidance).
 *
 * @module
 */
import { HttpException, HttpStatus, Injectable } from '@nestjs/common'
import { InjectLogger, LogPerformance, PinoLoggerService } from '@bymax-one/nest-logger'

import type { CreatePaymentDto } from './dto/create-payment.dto.js'

/** Processes payment charges, proving the error-path + performance-logging pattern. */
@Injectable()
export class PaymentsService {
  constructor(
    // Host property MUST be named `logger` — @LogPerformance reads `this.logger`.
    @InjectLogger(PaymentsService.name) private readonly logger: PinoLoggerService,
  ) {}

  /**
   * Attempt a payment charge. Always fails (deliberate) to demonstrate the error path.
   * Decorated with `@LogPerformance()` so every call emits `METHOD_EXECUTION`.
   *
   * @param dto - Validated payment request.
   * @throws HttpException 502 after logging the underlying failure.
   */
  @LogPerformance()
  async charge(dto: CreatePaymentDto): Promise<never> {
    this.logger.info('PAYMENT_CHARGE_ATTEMPT', 'Charge initiated', dto.userId, {
      orderId: dto.orderId,
      amount: dto.amount,
    })
    // Simulate an async gateway call that always declines. `await` is required both
    // for @LogPerformance to measure a real Promise and for the ESLint require-await rule.
    const error = await Promise.resolve(
      new Error(`Gateway declined charge for order ${dto.orderId}`),
    )
    // errorStructured takes the Error OBJECT as the 2nd arg (never a string).
    this.logger.errorStructured('PAYMENT_CHARGE_FAILED', error, dto.userId, {
      orderId: dto.orderId,
    })
    // Throwing a 4xx HttpException → the library HttpExceptionFilter logs HTTP_EXCEPTION_HANDLED.
    // A 5xx would emit HTTP_EXCEPTION_UNHANDLED instead. PAYMENT_REQUIRED (402) is correct
    // semantically and exercises the handled-exception path. Do NOT catch this at the controller
    // level — that would produce a duplicate log and break the double-log avoidance proof.
    throw new HttpException('Payment failed', HttpStatus.PAYMENT_REQUIRED)
  }
}
