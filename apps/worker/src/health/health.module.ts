/**
 * Health module — registers the health-check controller.
 *
 * @module
 */
import { Module } from '@nestjs/common'

import { HealthController } from './health.controller.js'

@Module({ controllers: [HealthController] })
export class HealthModule {}
