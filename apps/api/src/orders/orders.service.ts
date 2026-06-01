/**
 * Orders service — hot-path `info` logging, URL `:id` normalization, and slow-path detection.
 *
 * Demonstrates:
 *   - `@InjectLogger(context)` child-logger pattern (host property MUST be `logger`).
 *   - `PinoLoggerService.info(logKey, msg, userId, meta)` on the hot path.
 *   - `warnStructured` for a lookup miss.
 *   - `@LogPerformance(thresholdMs)` on `slow()` — emits `METHOD_SLOW_EXECUTION` above the threshold.
 *
 * @module
 */
import { HttpException, HttpStatus, Injectable } from '@nestjs/common'
import { InjectLogger, LogPerformance, PinoLoggerService } from '@bymax-one/nest-logger'

import { PrismaService } from '../prisma/prisma.service.js'
import type { CreateOrderDto } from './dto/create-order.dto.js'

/** Manages order creation and retrieval, proving hot-path structured logging. */
@Injectable()
export class OrdersService {
  constructor(
    // Host property MUST be named `logger` — @LogPerformance reads `this.logger`.
    @InjectLogger(OrdersService.name) private readonly logger: PinoLoggerService,
    private readonly prisma: PrismaService,
  ) {}

  /**
   * Create a new order and emit one `ORDER_CREATE_SUCCESS` info line.
   *
   * @param dto - Validated order creation payload.
   * @returns Created order id and amount.
   */
  async create(dto: CreateOrderDto): Promise<{ id: string; amount: number }> {
    const order = await this.prisma.order.create({
      data: { amount: dto.amount, tenantId: dto.tenantId },
    })
    this.logger.info('ORDER_CREATE_SUCCESS', 'Order created', dto.userId, {
      orderId: order.id,
      amount: order.amount,
    })
    return { id: order.id, amount: order.amount }
  }

  /**
   * Fetch a single order by id. Emits `ORDER_LOOKUP_MISS` (warn) when absent.
   *
   * @param id - Order id. The library `HttpLoggingInterceptor` normalizes the URL
   *   to `/orders/:id` — do NOT hand-roll normalization here.
   * @returns Order fields, or throws 404.
   * @throws HttpException 404 when the order is absent.
   */
  async findOne(id: string): Promise<{ id: string; amount: number; status: string }> {
    const order = await this.prisma.order.findUnique({ where: { id } })
    if (!order) {
      this.logger.warnStructured('ORDER_LOOKUP_MISS', 'Order not found', undefined, { orderId: id })
      throw new HttpException('Order not found', HttpStatus.NOT_FOUND)
    }
    this.logger.info('ORDER_LOOKUP_SUCCESS', 'Order fetched', undefined, { orderId: order.id })
    return { id: order.id, amount: order.amount, status: order.status }
  }

  /**
   * Deliberate slow path — sleeps 75 ms so `@LogPerformance(50)` fires `METHOD_SLOW_EXECUTION`.
   *
   * @returns Constant ok response.
   */
  @LogPerformance(50)
  async slow(): Promise<{ ok: true }> {
    await new Promise<void>((resolve) => setTimeout(resolve, 75))
    this.logger.info('ORDER_SLOW_SUCCESS', 'Slow path completed')
    return { ok: true }
  }
}
