/**
 * Payments controller — exposes `POST /payments`.
 *
 * @module
 */
import { Body, Controller, Post } from '@nestjs/common'

import { createPaymentSchema } from './dto/create-payment.dto.js'
import { PaymentsService } from './payments.service.js'

/** REST controller for the payments demo domain. */
@Controller('payments')
export class PaymentsController {
  constructor(private readonly payments: PaymentsService) {}

  /**
   * Initiate a payment charge. Always fails (deliberately) to demonstrate the error path.
   * Do NOT wrap in try/catch at this level — the library `HttpExceptionFilter` logs
   * `HTTP_EXCEPTION_HANDLED` exactly once, proving double-log avoidance.
   *
   * @param body - Raw request body validated against {@link createPaymentSchema}.
   * @returns Never — the service always throws.
   */
  @Post()
  create(@Body() body: unknown) {
    return this.payments.charge(createPaymentSchema.parse(body))
  }
}
