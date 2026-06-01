/**
 * Admin controller — exposes `PATCH /admin/log-level`.
 *
 * @module
 */
import { Body, Controller, Patch } from '@nestjs/common'

import { logLevelSchema } from './dto/log-level.dto.js'
import { AdminService } from './admin.service.js'

/**
 * REST controller for the runtime log-level admin endpoint.
 *
 * SECURITY: this endpoint is intentionally unauthenticated in the example app to keep
 * the focus on the logger library. A production deployment must protect it with a guard
 * (e.g., `@UseGuards(AdminGuard)`) or restrict it to an internal network interface.
 */
@Controller('admin')
export class AdminController {
  constructor(private readonly admin: AdminService) {}

  /**
   * Change the live log level. The level is Zod-validated before reaching the service.
   *
   * @param body - Raw request body validated against {@link logLevelSchema}.
   * @returns Previous and new log level.
   */
  @Patch('log-level')
  setLogLevel(@Body() body: unknown) {
    return this.admin.setLogLevel(logLevelSchema.parse(body))
  }
}
