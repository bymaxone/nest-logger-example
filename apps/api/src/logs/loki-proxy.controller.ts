/**
 * `GET /logs/loki` — Loki proxy controller.
 *
 * Layer: logs/loki. The Loki half of the source toggle. The same `LogQuery` is
 * compiled to LogQL via `LogsService.buildLogQL` and forwarded to the Loki HTTP
 * API. Three modes are supported:
 *
 *   - `query_range` (default) — paged search + chart buckets.
 *   - `labels` — distinct label values for the facet rail.
 *   - `tail` — returns a hint pointing clients to the SSE feed (live tail is
 *     consumed via `GET /logs/stream`, not the Loki WebSocket directly).
 *
 * Loki errors surface as HTTP 502 so the dashboard degrades gracefully. RBAC
 * (tenantId restriction) is injected into the LogQL pipeline for parity with the
 * Postgres path.
 *
 * 🎓 Scoped demo of **Loki as the full-fidelity tier** (`info`+). The same time
 * window returns more rows than Postgres (`warn`+) — explained in the dashboard
 * source-toggle callout.
 *
 * See `docs/DASHBOARD.md` §13 (Loki mapping table) for the full specification.
 *
 * @module
 */
import { BadGatewayException, Controller, Get, Headers, Query } from '@nestjs/common'
import { z } from 'zod'

import { ZodValidationPipe } from '../common/zod-validation.pipe.js'
import { buildRbacContext, toRestriction } from '../governance/rbac.context.js'
import { logQuerySchema } from './dto/log-query.dto.js'
import { LogsService } from './logs.service.js'
import { LokiClient, LokiUnavailableError } from './loki.client.js'

/** Loki query mode. */
const LOKI_MODES = ['query_range', 'labels', 'tail'] as const

/** Extended schema for the Loki proxy endpoint. */
const lokiQuerySchema = logQuerySchema.extend({
  mode: z.enum(LOKI_MODES).default('query_range'),
  /** Label name for `labels` mode — constrained to bounded known dimensions. */
  labelName: z.enum(['level', 'service', 'logKey', 'tenantId']).optional(),
  /** Step duration for `query_range` chart buckets. Must be a Loki-valid duration string. */
  step: z
    .string()
    .regex(/^\d+[smhdw]$/)
    .optional(),
})

/** Parsed Loki query DTO. */
type LokiQueryDto = z.infer<typeof lokiQuerySchema>

/**
 * Convert a Date to a nanosecond Unix timestamp string for Loki.
 *
 * @param d - Date to convert.
 * @returns Nanosecond timestamp string.
 */
function toNano(d: Date): string {
  // Use BigInt: `getTime() * 1e6` for current Unix times exceeds Number.MAX_SAFE_INTEGER
  // (2^53), so a float multiply would silently lose precision in the low digits.
  return (BigInt(d.getTime()) * 1_000_000n).toString()
}

/**
 * Loki proxy controller.
 *
 * Maps the common `LogQuery` filter to Loki API shapes and proxies the response.
 * All Loki errors are caught and re-thrown as `BadGatewayException` (502) so the
 * dashboard stays usable even when Loki is unreachable.
 */
@Controller('logs')
export class LokiProxyController {
  constructor(
    private readonly logs: LogsService,
    private readonly client: LokiClient,
  ) {}

  /**
   * Proxy to Loki: `query_range`, `labels`, or `tail` hint.
   *
   * @param q - Validated Loki query DTO.
   * @returns The Loki response or a redirect hint for live tail.
   * @throws {BadGatewayException} HTTP 502 when Loki is unavailable.
   */
  @Get('loki')
  async loki(
    @Headers() headers: Record<string, string>,
    @Query(new ZodValidationPipe(lokiQuerySchema)) q: LokiQueryDto,
  ): Promise<unknown> {
    const restriction = toRestriction(buildRbacContext(headers))
    const logql = this.logs.buildLogQL(q, restriction)

    const now = new Date()
    const start = q.from ? new Date(q.from) : new Date(now.getTime() - 60 * 60 * 1000)
    const end = q.to ? new Date(q.to) : now

    try {
      switch (q.mode) {
        case 'labels': {
          // Scope label values to the RBAC selector + time window so the facet rail
          // cannot leak cross-tenant values (e.g. other tenants' `service`/`tenantId`).
          const values = await this.client.labelValues(q.labelName ?? 'level', {
            query: logql,
            startNs: toNano(start),
            endNs: toNano(end),
          })
          return { values }
        }
        case 'tail': {
          // Live tail is consumed via the SSE endpoint — do not stream Loki WebSocket directly.
          return { stream: '/logs/stream', hint: 'consume live via SSE (GET /logs/stream)' }
        }
        case 'query_range':
        default: {
          // `await` is required here so the try-catch catches rejected promises.
          return await this.client.queryRange(
            logql,
            toNano(start),
            toNano(end),
            q.step ?? '60s',
            q.limit,
          )
        }
      }
    } catch (err) {
      if (err instanceof LokiUnavailableError) {
        throw new BadGatewayException(
          `Loki is unavailable — check LOKI_QUERY_URL. Detail: ${err.message}`,
        )
      }
      throw err
    }
  }
}
