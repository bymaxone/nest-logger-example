/**
 * Health and metrics endpoints for `apps/api`.
 *
 * Layer: app/health. These two routes are the ones the logger silences via
 * `http.excludePaths` (`/^\/health$/`, `/^\/metrics$/`). They require no logger
 * injection so they respond before the logger wiring exists, and the first request
 * to either proves the OTel SDK patched Express before NestJS loaded.
 */
import { Controller, Get } from '@nestjs/common'

/** Liveness/metrics controller mounted at the application root. */
@Controller()
export class HealthController {
  /**
   * Liveness probe.
   *
   * @returns A constant `{ status: 'ok' }` payload with HTTP 200.
   */
  @Get('health')
  health(): { status: 'ok' } {
    return { status: 'ok' }
  }

  /**
   * Minimal metrics placeholder (a real exporter is planned).
   *
   * SECURITY: this route is intentionally unauthenticated because it currently exposes
   * only coarse process uptime. Before it serves real operational metrics (request
   * rates, error counts, latency histograms) it MUST be restricted to internal callers
   * — via the RBAC/guard layer or an IP allowlist — so the
   * richer data is not world-readable.
   *
   * @returns The process uptime in whole seconds with HTTP 200.
   */
  @Get('metrics')
  metrics(): { uptimeSeconds: number } {
    return { uptimeSeconds: Math.floor(process.uptime()) }
  }
}
