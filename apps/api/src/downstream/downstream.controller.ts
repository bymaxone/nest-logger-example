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
   * Dispatch a task to the worker service. Fail-soft: returns `{ ok: false }` when
   * the worker is unreachable rather than propagating the error.
   *
   * @returns `{ ok: true }` on success, `{ ok: false }` when the worker is unreachable.
   */
  @Post('dispatch')
  dispatch() {
    return this.downstream.dispatch()
  }
}
