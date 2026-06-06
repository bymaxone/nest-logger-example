/**
 * Unit tests for the worker {@link TasksController}.
 *
 * Covers that the thin controller delegates to {@link TasksService} and returns
 * its result verbatim.
 */
import { describe, expect, it, jest } from '@jest/globals'

import { TasksController } from './tasks.controller.js'
import type { TasksService } from './tasks.service.js'

describe('TasksController', () => {
  it('delegates POST /tasks/process to TasksService and returns its result', () => {
    // The controller is a pass-through: it must return exactly what the service produces,
    // calling it once per request.
    const tasks = { process: jest.fn(() => ({ received: true })) } as unknown as TasksService
    const controller = new TasksController(tasks)

    expect(controller.process()).toEqual({ received: true })
    expect(tasks.process).toHaveBeenCalledTimes(1)
  })
})
