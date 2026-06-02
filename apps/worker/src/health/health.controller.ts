/**
 * Health controller — exposes `GET /health`.
 *
 * Layer: app/health. Returns `{ status: 'ok' }` for readiness checks.
 *
 * @module
 */
import { Controller, Get } from '@nestjs/common'

/** Health-check endpoint for orchestrator readiness probes. */
@Controller('health')
export class HealthController {
  /**
   * Return a minimal liveness / readiness response.
   *
   * @returns `{ status: 'ok' }`
   */
  @Get()
  check(): { status: string } {
    return { status: 'ok' }
  }
}
