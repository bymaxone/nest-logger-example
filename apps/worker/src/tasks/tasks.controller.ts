/**
 * Tasks controller — exposes `POST /tasks/process`.
 *
 * Layer: app/tasks. Receives dispatch requests from upstream services and delegates
 * to `TasksService`. The W3C `traceparent` header is extracted by the HTTP
 * auto-instrumentation, so the service logs carry the caller's `trace_id`.
 *
 * @module
 */
import { Controller, HttpCode, Post } from '@nestjs/common'

import { TasksService } from './tasks.service.js'

/** REST controller for inbound task dispatch. */
@Controller('tasks')
export class TasksController {
  constructor(private readonly tasks: TasksService) {}

  /**
   * Accept and process an inbound task dispatched from an upstream service.
   *
   * @returns `{ received: true }` with HTTP 202.
   */
  @Post('process')
  @HttpCode(202)
  process(): { received: boolean } {
    return this.tasks.process()
  }
}
