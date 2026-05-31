/**
 * Health module — wires the `/health` + `/metrics` routes into `AppModule`.
 *
 * Layer: app/health. No providers and no logger dependency: the controller must
 * respond on the bare Phase-3 skeleton before the Phase-4 logger wiring exists.
 */
import { Module } from '@nestjs/common'

import { HealthController } from './health.controller.js'

/** Registers {@link HealthController}. */
@Module({ controllers: [HealthController] })
export class HealthModule {}
