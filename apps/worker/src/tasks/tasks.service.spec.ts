/**
 * Unit tests for the worker {@link TasksService}.
 *
 * Covers the constructor's log-context labelling and that processing emits both
 * lifecycle log keys in order before acknowledging receipt. The logger is mocked,
 * so no OTel SDK or HTTP request is required.
 */
import { describe, expect, it, jest } from '@jest/globals'
import type { PinoLoggerService } from '@bymax-one/nest-logger'

import { TasksService } from './tasks.service.js'

/** Build a minimal PinoLoggerService double exposing the methods the service calls. */
function buildLogger(): PinoLoggerService {
  return { setContext: jest.fn(), info: jest.fn() } as unknown as PinoLoggerService
}

describe('TasksService', () => {
  it('labels its log context with the service name on construction', () => {
    // The child logger must be tagged so worker lines are attributable to TasksService.
    const logger = buildLogger()
    new TasksService(logger)
    expect(logger.setContext).toHaveBeenCalledWith('TasksService')
  })

  it('emits WORKER_TASK_RECEIVED then WORKER_TASK_PROCESSED and acknowledges receipt', () => {
    // Processing must log both lifecycle keys in order (each carrying the inbound trace_id)
    // and return the receipt acknowledgement.
    const logger = buildLogger()
    const service = new TasksService(logger)

    expect(service.process()).toEqual({ received: true })
    expect(logger.info).toHaveBeenNthCalledWith(
      1,
      'WORKER_TASK_RECEIVED',
      'Worker received task from upstream',
    )
    expect(logger.info).toHaveBeenNthCalledWith(2, 'WORKER_TASK_PROCESSED', 'Worker finished task')
  })
})
