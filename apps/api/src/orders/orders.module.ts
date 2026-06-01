/**
 * Orders feature module.
 *
 * @module
 */
import { Module } from '@nestjs/common'

import { PrismaModule } from '../prisma/prisma.module.js'
import { OrdersController } from './orders.controller.js'
import { OrdersService } from './orders.service.js'

/** Encapsulates the orders demo domain. Imports `PrismaModule` for database access. */
@Module({
  imports: [PrismaModule],
  controllers: [OrdersController],
  providers: [OrdersService],
})
export class OrdersModule {}
