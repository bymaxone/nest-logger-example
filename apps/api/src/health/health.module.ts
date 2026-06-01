/**
 * Health module — wires the `/health` + `/metrics` routes into `AppModule`.
 *
 * Layer: app/health. No providers and no logger dependency: the controller is
 * intentionally self-contained so liveness and metrics remain available even
 * when the logging module is not yet initialized.
 */
import { Module } from '@nestjs/common'

import { HealthController } from './health.controller.js'

/** Registers {@link HealthController}. */
@Module({ controllers: [HealthController] })
export class HealthModule {}
