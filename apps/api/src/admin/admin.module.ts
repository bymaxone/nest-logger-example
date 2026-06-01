/**
 * Admin feature module.
 *
 * @module
 */
import { Module } from '@nestjs/common'

import { AdminController } from './admin.controller.js'
import { AdminService } from './admin.service.js'

/** Provides the runtime log-level admin endpoint. */
@Module({ controllers: [AdminController], providers: [AdminService] })
export class AdminModule {}
