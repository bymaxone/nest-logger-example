/**
 * Downstream feature module.
 *
 * @module
 */
import { Module } from '@nestjs/common'

import { DownstreamController } from './downstream.controller.js'
import { DownstreamService } from './downstream.service.js'

/** Encapsulates the cross-service correlation demo with a fail-soft worker stub. */
@Module({ controllers: [DownstreamController], providers: [DownstreamService] })
export class DownstreamModule {}
