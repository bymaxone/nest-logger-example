/**
 * Health and metrics endpoints for `apps/api`.
 *
 * Layer: app/health. These two routes are the ones Phase 4 silences via
 * `http.excludePaths` (`/^\/health$/`, `/^\/metrics$/`). They require no logger
 * injection so they respond before the Phase-4 logger wiring exists, and the first
 * request to either proves the OTel SDK (P3-2) patched Express before NestJS loaded.
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
   * Minimal metrics placeholder (a real exporter lands in a later phase).
   *
   * SECURITY: this route is intentionally unauthenticated because it currently exposes
   * only coarse process uptime. Before it serves real operational metrics (request
   * rates, error counts, latency histograms) it MUST be restricted to internal callers
   * — via the RBAC/guard layer introduced in Phase 13 or an IP allowlist — so the
   * richer data is not world-readable.
   *
   * @returns The process uptime in whole seconds with HTTP 200.
   */
  @Get('metrics')
  metrics(): { uptimeSeconds: number } {
    return { uptimeSeconds: Math.floor(process.uptime()) }
  }
}
