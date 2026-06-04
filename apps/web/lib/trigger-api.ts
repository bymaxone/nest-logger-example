/**
 * @fileoverview Typed client for the `apps/api` demo endpoints fired by the
 * Trigger Center (Log Playground).
 *
 * Each method fires one documented demo route to emit a specific kind of log,
 * then returns the correlation ids the library echoes on the response
 * (`X-Request-Id` / `X-Trace-Id`, CORS-exposed) so the card can deep-link the
 * result into the Explorer. The client only **fires** endpoints — it never reads
 * or aggregates log data (that is the Explorer/Overview's job).
 *
 * Request bodies mirror the real `apps/api` DTOs exactly (e.g. `/orders` requires
 * a `tenantId`, `/trigger/level` accepts only `info|warn|error`, `/trigger/burst`
 * takes a `count`), so every fire passes server-side validation.
 *
 * @module lib/trigger-api
 */

import { z } from 'zod'

/** API base URL — the demo + read API. Defaults to the local `apps/api` port. */
const API = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001'

/** Levels the `/trigger/level` endpoint accepts (its Zod enum). */
export type TriggerLevel = 'info' | 'warn' | 'error'

/** HTTP status codes the 4xx/5xx card may request (mirrors the card's options). */
const ALLOWED_STATUS_CODES = new Set([400, 404, 500, 503])

/**
 * Inclusive bounds the server enforces on `POST /trigger/burst` (its Zod
 * `count: number().int().min(1).max(500)`); mirrored here for defence-in-depth.
 */
const BURST_MIN_COUNT = 1
const BURST_MAX_COUNT = 500

/**
 * Boundary schema for the correlation ids read off the response headers. The
 * values come from `Headers.get`, so each is either a string or `null`; parsing
 * them here keeps {@link TriggerResult} honest even if a header is ever absent.
 */
const correlationIdsSchema = z.object({
  requestId: z.string().nullable(),
  traceId: z.string().nullable(),
})

/** The outcome of firing one trigger — correlation ids + the raw response. */
export interface TriggerResult {
  /** Per-request correlation id echoed by the library (`X-Request-Id`). */
  requestId: string | null
  /** Distributed trace id echoed by the library (`X-Trace-Id`); shared across services. */
  traceId: string | null
  /** HTTP status code of the fired request. */
  status: number
  /** Parsed JSON response body, or `null` when the body is empty/non-JSON. */
  body: unknown
}

/**
 * Fire a single demo request and capture the echoed correlation ids.
 *
 * @param method - HTTP method (`GET` / `POST`).
 * @param path - Path relative to {@link API} (e.g. `/orders`).
 * @param body - Optional JSON body; sets the `content-type` header when present.
 * @param headers - Optional extra request headers (e.g. demo sensitive headers).
 * @returns The correlation ids, status, and parsed body.
 */
async function call(
  method: 'GET' | 'POST',
  path: string,
  body?: unknown,
  headers?: Record<string, string>,
): Promise<TriggerResult> {
  const res = await fetch(`${API}${path}`, {
    method,
    headers: {
      ...(body !== undefined ? { 'content-type': 'application/json' } : {}),
      ...(headers ?? {}),
    },
    ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
  })
  // The library echoes correlation ids on every response (correlation-headers interceptor);
  // validate them at the boundary before trusting them on the result.
  const { requestId, traceId } = correlationIdsSchema.parse({
    requestId: res.headers.get('x-request-id'),
    traceId: res.headers.get('x-trace-id'),
  })
  const parsed: unknown = await res.json().catch(() => null)
  return { requestId, traceId, status: res.status, body: parsed }
}

/**
 * The twelve Trigger Center fire actions, one per `DASHBOARD.md` §8 row. Each
 * targets the documented endpoint and emits its specific log key(s).
 */
export const triggerApi = {
  /**
   * Emit `count` lines at the chosen level (`POST /trigger/level`).
   *
   * @param level - Log level to emit (`info` / `warn` / `error`).
   * @param count - How many lines to emit; defaults to `1`.
   * @returns The correlation ids, status, and parsed body of the fire.
   */
  level: (level: TriggerLevel, count = 1): Promise<TriggerResult> =>
    call('POST', '/trigger/level', { level, count }),
  /**
   * Structured success: create an order for a tenant (`POST /orders`).
   *
   * @param tenantId - Tenant the demo order is attributed to.
   * @returns The correlation ids, status, and parsed body of the fire.
   */
  order: (tenantId: string): Promise<TriggerResult> =>
    call('POST', '/orders', { amount: 4200, tenantId, userId: 'u_demo' }),
  /**
   * Error with stack: a refund that fails (`POST /payments`).
   *
   * @returns The correlation ids, status, and parsed body of the fire.
   */
  payment: (): Promise<TriggerResult> =>
    call('POST', '/payments', { orderId: 'demo', amount: 4200, userId: 'u_demo' }),
  /**
   * PII payload redacted at source (`POST /pii-demo/signup`).
   *
   * @returns The correlation ids, status, and parsed body of the fire.
   */
  piiSignup: (): Promise<TriggerResult> =>
    call('POST', '/pii-demo/signup', {
      nome: 'Demo User',
      email: 'demo@bymax.one',
      password: 's3cret',
      cpf: '111.222.333-44',
      cardNumber: '4111111111111111',
      cardCvv: '123',
      payment: { cardNumber: '4111111111111111' },
    }),
  /**
   * Deep-nested PII redaction-depth boundary (`POST /pii-demo/nested`).
   *
   * @returns The correlation ids, status, and parsed body of the fire.
   */
  piiNested: (): Promise<TriggerResult> => call('POST', '/pii-demo/nested'),
  /**
   * Sensitive-header redaction (`GET /pii-demo/echo-headers`).
   *
   * @returns The correlation ids, status, and parsed body of the fire.
   */
  echoHeaders: (): Promise<TriggerResult> =>
    call('GET', '/pii-demo/echo-headers', undefined, {
      authorization: 'Bearer demo-token',
      'x-api-key': 'demo-api-key',
    }),
  /**
   * Oversized entry truncation (`POST /pii-demo/huge`).
   *
   * @returns The correlation ids, status, and parsed body of the fire.
   */
  huge: (): Promise<TriggerResult> => call('POST', '/pii-demo/huge'),
  /**
   * Slow method performance log (`GET /orders/slow`).
   *
   * @returns The correlation ids, status, and parsed body of the fire.
   */
  slow: (): Promise<TriggerResult> => call('GET', '/orders/slow'),
  /**
   * HTTP 4xx/5xx access log for the chosen code (`GET /trigger/status/:code`).
   *
   * @param code - One of the documented status codes (`400 | 404 | 500 | 503`).
   * @returns The correlation ids, status, and parsed body of the fire.
   * @throws {Error} When `code` is not one of the documented status codes.
   */
  status: (code: number): Promise<TriggerResult> => {
    // Defence-in-depth: only the documented codes may reach the path (never arbitrary input).
    if (!ALLOWED_STATUS_CODES.has(code)) {
      return Promise.reject(new Error(`Unsupported status code: ${code}`))
    }
    return call('GET', `/trigger/status/${code}`)
  },
  /**
   * Cross-service dispatch sharing one `traceId` (`POST /downstream/dispatch`).
   *
   * @returns The correlation ids, status, and parsed body of the fire.
   */
  dispatch: (): Promise<TriggerResult> => call('POST', '/downstream/dispatch'),
  /**
   * Fault-inject the Loki destination, fail-soft (`POST /trigger/fault/loki`).
   *
   * @returns The correlation ids, status, and parsed body of the fire.
   */
  faultLoki: (): Promise<TriggerResult> => call('POST', '/trigger/fault/loki'),
  /**
   * Load burst of `count` lines to populate charts / live tail
   * (`POST /trigger/burst`).
   *
   * @param count - Lines to emit; clamped to the server bounds
   *   ({@link BURST_MIN_COUNT}..{@link BURST_MAX_COUNT}) before the request.
   * @returns The correlation ids, status, and parsed body of the fire.
   */
  burst: (count: number): Promise<TriggerResult> => {
    // Defence-in-depth: clamp to the server's Zod bounds so an out-of-range
    // card value never reaches `/trigger/burst` to be rejected (mirrors status()).
    const bounded = Math.min(Math.max(Math.trunc(count), BURST_MIN_COUNT), BURST_MAX_COUNT)
    return call('POST', '/trigger/burst', { count: bounded })
  },
}
