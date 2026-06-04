/**
 * Thin HTTP client for the Loki query API.
 *
 * Layer: logs/loki. Reads `LOKI_QUERY_URL` from the config service and exposes
 * typed wrappers for `query_range` and `label/<name>/values`. Non-2xx responses
 * and network errors are raised as `LokiUnavailableError` so the controller can
 * map them to HTTP 502.
 *
 * @module
 */
import { Injectable } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'

/** Thrown when Loki returns a non-2xx status or the network request fails. */
export class LokiUnavailableError extends Error {
  constructor(
    message: string,
    public readonly status?: number,
  ) {
    super(message)
    this.name = 'LokiUnavailableError'
  }
}

/** Minimal shape of a Loki `query_range` response. */
export interface LokiQueryResponse {
  status: string
  data: {
    resultType: string
    result: unknown[]
  }
}

/**
 * Loki HTTP API client.
 *
 * Uses native `fetch`; on a non-2xx response or a network throw, raises a typed
 * `LokiUnavailableError` so the controller can respond with a 502.
 */
@Injectable()
export class LokiClient {
  private readonly baseUrl: string

  constructor(config: ConfigService) {
    this.baseUrl = config.getOrThrow<string>('LOKI_QUERY_URL')
  }

  /**
   * Execute a Loki `query_range` request.
   *
   * @param logql - The LogQL query string.
   * @param startNs - Start time as a nanosecond Unix timestamp string.
   * @param endNs - End time as a nanosecond Unix timestamp string.
   * @param step - Query step duration (e.g. `60s`, `5m`).
   * @param limit - Maximum number of entries.
   * @returns The parsed Loki response.
   * @throws {LokiUnavailableError} On a non-2xx status or network failure.
   */
  async queryRange(
    logql: string,
    startNs: string,
    endNs: string,
    step: string,
    limit: number,
  ): Promise<LokiQueryResponse> {
    const params = new URLSearchParams({
      query: logql,
      start: startNs,
      end: endNs,
      step,
      limit: String(limit),
    })
    return this.get<LokiQueryResponse>(`/loki/api/v1/query_range?${params.toString()}`)
  }

  /**
   * Fetch distinct values for a Loki label.
   *
   * When `opts.query` (an RBAC-scoped stream selector) and a time window are
   * supplied, Loki restricts the returned values to streams matching the
   * selector within the window — this is what prevents the facet rail from
   * leaking cross-tenant label values. Omitting them falls back to the global,
   * unscoped enumeration.
   *
   * @param name - The label name (e.g. `level`, `service`).
   * @param opts - Optional scoping: `query` selector and `startNs`/`endNs` window.
   * @returns Array of distinct string values.
   * @throws {LokiUnavailableError} On a non-2xx status or network failure.
   */
  async labelValues(
    name: string,
    opts?: { query?: string; startNs?: string; endNs?: string },
  ): Promise<string[]> {
    const params = new URLSearchParams()
    if (opts?.query) params.set('query', opts.query)
    if (opts?.startNs) params.set('start', opts.startNs)
    if (opts?.endNs) params.set('end', opts.endNs)
    const qs = params.toString()
    const suffix = qs ? `?${qs}` : ''
    const response = await this.get<{ status: string; data: string[] }>(
      `/loki/api/v1/label/${encodeURIComponent(name)}/values${suffix}`,
    )
    return response.data
  }

  /**
   * Internal GET helper — raises `LokiUnavailableError` on any failure.
   *
   * @param path - The URL path (including query string).
   * @returns Parsed JSON response body.
   * @throws {LokiUnavailableError} On non-2xx or network error.
   */
  private async get<T>(path: string): Promise<T> {
    let response: Response
    try {
      response = await fetch(`${this.baseUrl}${path}`, {
        headers: { Accept: 'application/json' },
        // Abort after 10 s — a hung Loki exhausts the event loop under load.
        signal: AbortSignal.timeout(10_000),
      })
    } catch (err) {
      throw new LokiUnavailableError(
        `Loki unreachable: ${err instanceof Error ? err.message : String(err)}`,
      )
    }

    if (!response.ok) {
      throw new LokiUnavailableError(
        `Loki returned ${response.status}: ${response.statusText}`,
        response.status,
      )
    }

    return response.json() as Promise<T>
  }
}
