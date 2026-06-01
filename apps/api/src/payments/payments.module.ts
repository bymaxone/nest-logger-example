/**
 * Payments feature module.
 *
 * @module
 */
import { Module } from '@nestjs/common'

import { PaymentsController } from './payments.controller.js'
import { PaymentsService } from './payments.service.js'

/** Encapsulates the payments demo domain. */
@Module({ controllers: [PaymentsController], providers: [PaymentsService] })
export class PaymentsModule {}
