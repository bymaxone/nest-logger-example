/**
 * Downstream controller — exposes `POST /downstream/dispatch`.
 *
 * @module
 */
import { Controller, Post } from '@nestjs/common'

import { DownstreamService } from './downstream.service.js'

/** REST controller for the cross-service correlation demo. */
@Controller('downstream')
export class DownstreamController {
  constructor(private readonly downstream: DownstreamService) {}

  /**
   * Dispatch a task to the worker via both auto-instrumented and manual propagation
   * paths. Fail-soft: returns success flags for each path.
   *
   * @returns `{ auto: boolean, manual: boolean }` with success flags.
   */
  @Post('dispatch')
  dispatch() {
    return this.downstream.dispatch()
  }
}
