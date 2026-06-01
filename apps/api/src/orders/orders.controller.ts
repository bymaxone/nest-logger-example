/**
 * Orders controller — exposes `POST /orders`, `GET /orders/slow`, `GET /orders/:id`.
 *
 * Route order matters: `slow` must be declared BEFORE `:id` so `/orders/slow`
 * is not captured as an order id.
 *
 * @module
 */
import { Body, Controller, Get, Param, Post } from '@nestjs/common'

import { createOrderSchema } from './dto/create-order.dto.js'
import { OrdersService } from './orders.service.js'

/** REST controller for the orders demo domain. */
@Controller('orders')
export class OrdersController {
  constructor(private readonly orders: OrdersService) {}

  /**
   * Create an order and emit `ORDER_CREATE_SUCCESS`.
   *
   * @param body - Raw request body validated against {@link createOrderSchema}.
   * @returns Created order id and amount.
   */
  @Post()
  create(@Body() body: unknown) {
    return this.orders.create(createOrderSchema.parse(body))
  }

  /**
   * Deliberate slow path — exercises `@LogPerformance(50)` on the service method.
   * Declared before `/:id` so `/orders/slow` is not matched as an id parameter.
   *
   * @returns `{ ok: true }` after ≥75 ms.
   */
  @Get('slow')
  slow() {
    return this.orders.slow()
  }

  /**
   * Fetch a single order. The library `HttpLoggingInterceptor` normalises the access-log
   * URL to `/orders/:id` (not the raw id value).
   *
   * @param id - Order id from the URL parameter.
   * @returns Order fields.
   */
  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.orders.findOne(id)
  }
}
