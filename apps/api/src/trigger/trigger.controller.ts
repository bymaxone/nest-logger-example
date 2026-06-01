/**
 * Trigger controller — Playground hooks for the `apps/web` Trigger Center.
 *
 * The `/status/:code` route throws an `HttpException` for non-2xx codes so the library
 * interceptor observes the exception and logs the matching `HTTP_REQUEST_CLIENT_ERROR` /
 * `HTTP_REQUEST_SERVER_ERROR` key. Using `@Res()` + `res.status()` would bypass the
 * interceptor's Observable error path and prevent the access-log keys from appearing.
 *
 * @module
 */
import { Body, Controller, Get, HttpException, Param, Post } from '@nestjs/common'

import { triggerBurstSchema, triggerLevelSchema } from './dto/trigger.dto.js'
import { TriggerService } from './trigger.service.js'

/** REST controller for the Playground trigger hooks. */
@Controller('trigger')
export class TriggerController {
  constructor(private readonly trigger: TriggerService) {}

  /**
   * Fire `count` log lines at the requested level.
   *
   * @param body - Raw request body validated against {@link triggerLevelSchema}.
   * @returns Number of lines fired.
   */
  @Post('level')
  level(@Body() body: unknown) {
    return this.trigger.fireLevel(triggerLevelSchema.parse(body))
  }

  /**
   * Throw an `HttpException` with the requested status code so the library interceptor
   * logs the matching `HTTP_REQUEST_*` key (CLIENT_ERROR / SERVER_ERROR). Returns normally
   * for 2xx codes (interceptor logs `HTTP_REQUEST_SUCCESS`).
   *
   * @param code - Requested status code as a URL parameter string.
   * @throws HttpException for any non-2xx status code.
   */
  @Get('status/:code')
  status(@Param('code') code: string): { status: number } {
    const parsed = Number.parseInt(code, 10)
    const httpStatus = Number.isFinite(parsed) && parsed >= 200 && parsed <= 599 ? parsed : 400
    if (httpStatus >= 200 && httpStatus < 300) {
      return { status: httpStatus }
    }
    // Throw so the library interceptor can observe the exception and emit the HTTP_REQUEST_*
    // key. Using @Res() + res.status() would bypass the interceptor's error path.
    throw new HttpException({ status: httpStatus }, httpStatus)
  }

  /**
   * Emit a `TRIGGER_FAULT_REQUESTED` log — a labelled hook for the Loki-destination fault demo.
   * The real `LOGGER_DESTINATION_WRITE_FAILED` proof is wired with the Loki sink.
   *
   * @returns Constant requested response.
   */
  @Post('fault/loki')
  fault() {
    return this.trigger.requestFault()
  }

  /**
   * Fire `count` `TRIGGER_BURST_TICK` lines in a tight loop (capped at ≤500).
   *
   * @param body - Raw request body validated against {@link triggerBurstSchema}.
   * @returns Number of lines fired.
   */
  @Post('burst')
  burst(@Body() body: unknown) {
    return this.trigger.burst(triggerBurstSchema.parse(body).count)
  }
}
