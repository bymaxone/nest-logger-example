/**
 * Trigger feature module.
 *
 * @module
 */
import { Module } from '@nestjs/common'

import { TriggerController } from './trigger.controller.js'
import { TriggerService } from './trigger.service.js'

/** Exposes Playground trigger hooks for the `apps/web` Trigger Center. */
@Module({ controllers: [TriggerController], providers: [TriggerService] })
export class TriggerModule {}
