/**
 * Tasks service — handles inbound task processing for `apps/worker`.
 *
 * Layer: app/tasks. Logs the received and processed events using the injected
 * `PinoLoggerService`. Because the OTel HTTP server auto-instrumentation activates
 * the extracted span for the incoming request, these log lines carry the caller's
 * `trace_id` automatically via W3C traceparent extraction.
 *
 * @module
 */
import { Injectable } from '@nestjs/common'
import { InjectLogger, PinoLoggerService } from '@bymax-one/nest-logger'

/** Processes inbound tasks dispatched by upstream services (e.g. `apps/api`). */
@Injectable()
export class TasksService {
  constructor(@InjectLogger(TasksService.name) private readonly logger: PinoLoggerService) {
    this.logger.setContext(TasksService.name)
  }

  /**
   * Log receipt and successful processing of an inbound task.
   * Because the HTTP auto-instrumentation activates the W3C `traceparent` span
   * from the incoming request headers, both log lines carry the caller's `trace_id`.
   *
   * @returns `{ received: true }` after processing.
   */
  process(): { received: boolean } {
    // Inbound traceparent is extracted by HTTP auto-instrumentation — no manual code needed here.
    this.logger.info('WORKER_TASK_RECEIVED', 'Worker received task from upstream')
    this.logger.info('WORKER_TASK_PROCESSED', 'Worker finished task')
    return { received: true }
  }
}
