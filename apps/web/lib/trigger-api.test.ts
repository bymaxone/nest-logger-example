/**
 * @fileoverview Unit tests for the Trigger Center API client — verifies every
 * documented fire method exists and targets the correct method/path, and that
 * the echoed correlation-id headers are surfaced.
 *
 * @module lib/trigger-api.test
 */
import { afterEach, describe, expect, it, vi } from 'vitest'

import { triggerApi, type TriggerResult } from './trigger-api'

/** One captured fetch invocation: URL, method, and the parsed JSON body (if any). */
interface CapturedCall {
  url: string
  method: string
  body: unknown
}

/** Build a fetch mock that captures the request and echoes correlation headers. */
function mockFetch(): { calls: CapturedCall[] } {
  const calls: CapturedCall[] = []
  vi.stubGlobal(
    'fetch',
    vi.fn((url: string, init?: RequestInit) => {
      const body: unknown = typeof init?.body === 'string' ? JSON.parse(init.body) : undefined
      calls.push({ url, method: init?.method ?? 'GET', body })
      return Promise.resolve({
        status: 200,
        headers: new Headers({ 'x-request-id': 'req_1', 'x-trace-id': 'trace_1' }),
        json: () => Promise.resolve({ ok: true }),
      } as Response)
    }),
  )
  return { calls }
}

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('triggerApi', () => {
  /** The client must expose exactly the twelve documented fire actions (§8). */
  it('exposes all twelve trigger methods', () => {
    expect(Object.keys(triggerApi).sort()).toEqual(
      [
        'burst',
        'dispatch',
        'echoHeaders',
        'faultLoki',
        'huge',
        'level',
        'order',
        'payment',
        'piiNested',
        'piiSignup',
        'slow',
        'status',
      ].sort(),
    )
  })

  /** A POST fire must use POST and hit the documented endpoint path. */
  it('fires the order endpoint with POST', async () => {
    const { calls } = mockFetch()
    await triggerApi.order('acme')
    expect(calls[0]?.method).toBe('POST')
    expect(calls[0]?.url).toContain('/orders')
  })

  /** The status fire must interpolate the chosen code into the GET path. */
  it('fires the status endpoint with the chosen code', async () => {
    const { calls } = mockFetch()
    await triggerApi.status(503)
    expect(calls[0]?.method).toBe('GET')
    expect(calls[0]?.url).toContain('/trigger/status/503')
  })

  /** Correlation ids echoed on the response must be surfaced on the result. */
  it('surfaces the echoed correlation ids', async () => {
    mockFetch()
    const result: TriggerResult = await triggerApi.dispatch()
    expect(result.requestId).toBe('req_1')
    expect(result.traceId).toBe('trace_1')
    expect(result.status).toBe(200)
  })

  /** Defence-in-depth: an undocumented status code rejects WITHOUT firing fetch. */
  it('rejects an unsupported status code and never calls fetch', async () => {
    const { calls } = mockFetch()
    await expect(triggerApi.status(418)).rejects.toThrow('Unsupported status code: 418')
    expect(calls).toHaveLength(0)
  })

  /** level fires POST /trigger/level with the chosen level + count in the body. */
  it('fires the level endpoint with POST and the level/count body', async () => {
    const { calls } = mockFetch()
    await triggerApi.level('warn', 3)
    expect(calls[0]?.method).toBe('POST')
    expect(calls[0]?.url).toContain('/trigger/level')
    expect(calls[0]?.body).toEqual({ level: 'warn', count: 3 })
  })

  /** payment fires POST /payments with the failing-refund body. */
  it('fires the payment endpoint with POST and the refund body', async () => {
    const { calls } = mockFetch()
    await triggerApi.payment()
    expect(calls[0]?.method).toBe('POST')
    expect(calls[0]?.url).toContain('/payments')
    expect(calls[0]?.body).toEqual({ orderId: 'demo', amount: 4200, userId: 'u_demo' })
  })

  /** piiSignup fires POST /pii-demo/signup with the PII payload to be redacted. */
  it('fires the piiSignup endpoint with POST and the PII body', async () => {
    const { calls } = mockFetch()
    await triggerApi.piiSignup()
    expect(calls[0]?.method).toBe('POST')
    expect(calls[0]?.url).toContain('/pii-demo/signup')
    expect(calls[0]?.body).toMatchObject({ email: 'demo@bymax.one', password: 's3cret' })
  })

  /** piiNested fires POST /pii-demo/nested with no body (depth-boundary demo). */
  it('fires the piiNested endpoint with POST and no body', async () => {
    const { calls } = mockFetch()
    await triggerApi.piiNested()
    expect(calls[0]?.method).toBe('POST')
    expect(calls[0]?.url).toContain('/pii-demo/nested')
    expect(calls[0]?.body).toBeUndefined()
  })

  /** echoHeaders fires GET /pii-demo/echo-headers (sensitive-header redaction demo). */
  it('fires the echoHeaders endpoint with GET', async () => {
    const { calls } = mockFetch()
    await triggerApi.echoHeaders()
    expect(calls[0]?.method).toBe('GET')
    expect(calls[0]?.url).toContain('/pii-demo/echo-headers')
    expect(calls[0]?.body).toBeUndefined()
  })

  /** huge fires POST /pii-demo/huge (oversized-entry truncation demo). */
  it('fires the huge endpoint with POST', async () => {
    const { calls } = mockFetch()
    await triggerApi.huge()
    expect(calls[0]?.method).toBe('POST')
    expect(calls[0]?.url).toContain('/pii-demo/huge')
  })

  /** slow fires GET /orders/slow (slow-method performance log demo). */
  it('fires the slow endpoint with GET', async () => {
    const { calls } = mockFetch()
    await triggerApi.slow()
    expect(calls[0]?.method).toBe('GET')
    expect(calls[0]?.url).toContain('/orders/slow')
  })

  /** faultLoki fires POST /trigger/fault/loki (fail-soft destination fault demo). */
  it('fires the faultLoki endpoint with POST', async () => {
    const { calls } = mockFetch()
    await triggerApi.faultLoki()
    expect(calls[0]?.method).toBe('POST')
    expect(calls[0]?.url).toContain('/trigger/fault/loki')
  })

  /** burst fires POST /trigger/burst forwarding an in-range count unchanged. */
  it('fires the burst endpoint with POST and an in-range count', async () => {
    const { calls } = mockFetch()
    await triggerApi.burst(50)
    expect(calls[0]?.method).toBe('POST')
    expect(calls[0]?.url).toContain('/trigger/burst')
    expect(calls[0]?.body).toEqual({ count: 50 })
  })

  /** Defence-in-depth: burst clamps a count above the server max (500) before firing. */
  it('clamps a burst count above the server maximum', async () => {
    const { calls } = mockFetch()
    await triggerApi.burst(9999)
    expect(calls[0]?.body).toEqual({ count: 500 })
  })

  /** Defence-in-depth: burst clamps a count below the server min (1) before firing. */
  it('clamps a burst count below the server minimum', async () => {
    const { calls } = mockFetch()
    await triggerApi.burst(0)
    expect(calls[0]?.body).toEqual({ count: 1 })
  })

  /** An empty / non-JSON response body must surface as `body: null` (the json catch path). */
  it('returns a null body when the response is not JSON', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(() =>
        Promise.resolve({
          status: 204,
          headers: new Headers({ 'x-request-id': 'req_2', 'x-trace-id': 'trace_2' }),
          // A 204/empty body makes res.json() reject; the client must swallow it to null.
          json: () => Promise.reject(new Error('Unexpected end of JSON input')),
        } as Response),
      ),
    )
    const result: TriggerResult = await triggerApi.faultLoki()
    expect(result.body).toBeNull()
    expect(result.status).toBe(204)
    expect(result.requestId).toBe('req_2')
  })

  /** Absent correlation headers must validate to `null` on the result (the boundary schema). */
  it('surfaces null correlation ids when the headers are absent', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(() =>
        Promise.resolve({
          status: 200,
          headers: new Headers(),
          json: () => Promise.resolve({ ok: true }),
        } as Response),
      ),
    )
    const result: TriggerResult = await triggerApi.huge()
    expect(result.requestId).toBeNull()
    expect(result.traceId).toBeNull()
  })

  /** order fires POST /orders with the exact documented body (amount, tenantId, userId). */
  it('fires order with the exact body including the fixed amount and userId', async () => {
    const { calls } = mockFetch()
    await triggerApi.order('tenant-xyz')
    expect(calls[0]?.body).toEqual({ amount: 4200, tenantId: 'tenant-xyz', userId: 'u_demo' })
  })

  /** piiSignup fires POST /pii-demo/signup with the full exact PII payload. */
  it('fires piiSignup with the exact PII body', async () => {
    const { calls } = mockFetch()
    await triggerApi.piiSignup()
    expect(calls[0]?.body).toEqual({
      nome: 'Demo User',
      email: 'demo@bymax.one',
      password: 's3cret',
      cpf: '111.222.333-44',
      cardNumber: '4111111111111111',
      cardCvv: '123',
      payment: { cardNumber: '4111111111111111' },
    })
  })

  /** level with no explicit count defaults to 1 (the `count = 1` default param). */
  it('fires level with count=1 when no count is supplied', async () => {
    const { calls } = mockFetch()
    await triggerApi.level('info')
    expect(calls[0]?.body).toEqual({ level: 'info', count: 1 })
  })

  /** dispatch fires POST /downstream/dispatch. */
  it('fires dispatch to the correct /downstream/dispatch path', async () => {
    const { calls } = mockFetch()
    await triggerApi.dispatch()
    expect(calls[0]?.method).toBe('POST')
    expect(calls[0]?.url).toContain('/downstream/dispatch')
  })

  /** echoHeaders fires GET /pii-demo/echo-headers with the exact sensitive headers. */
  it('fires echoHeaders with the exact authorization and x-api-key headers', async () => {
    let capturedHeaders: Record<string, string> = {}
    vi.stubGlobal(
      'fetch',
      vi.fn((_url: string, init?: RequestInit) => {
        capturedHeaders = (init?.headers ?? {}) as Record<string, string>
        return Promise.resolve({
          status: 200,
          headers: new Headers({ 'x-request-id': 'r', 'x-trace-id': 't' }),
          json: () => Promise.resolve({}),
        } as Response)
      }),
    )
    await triggerApi.echoHeaders()
    expect(capturedHeaders['authorization']).toBe('Bearer demo-token')
    expect(capturedHeaders['x-api-key']).toBe('demo-api-key')
  })

  /** burst at the server max (500) is forwarded unchanged (no clamping needed). */
  it('forwards a burst count exactly at the server max (500) unchanged', async () => {
    const { calls } = mockFetch()
    await triggerApi.burst(500)
    expect(calls[0]?.body).toEqual({ count: 500 })
  })

  /** burst at the server min (1) is forwarded unchanged. */
  it('forwards a burst count exactly at the server min (1) unchanged', async () => {
    const { calls } = mockFetch()
    await triggerApi.burst(1)
    expect(calls[0]?.body).toEqual({ count: 1 })
  })

  /** The request URL must begin with http://localhost:3001/ — kills both the ?? → && and the empty-string fallback mutations. */
  it('sends every request to the http://localhost:3001 base URL', async () => {
    const { calls } = mockFetch()
    await triggerApi.dispatch()
    expect(calls[0]?.url).toMatch(/^http:\/\/localhost:3001\//)
  })

  /** burst truncates a float to its integer part before clamping. */
  it('truncates a float count to its integer part before sending', async () => {
    const { calls } = mockFetch()
    await triggerApi.burst(9.9)
    // trunc(9.9) = 9, which is in [1, 500] → sent as 9
    expect(calls[0]?.body).toEqual({ count: 9 })
  })

  /** All four documented status codes are individually accepted. */
  it('accepts every documented status code without throwing', async () => {
    for (const code of [400, 404, 500, 503]) {
      const { calls } = mockFetch()
      await triggerApi.status(code)
      expect(calls[0]?.url).toContain(`/trigger/status/${code}`)
    }
  })

  /**
   * A POST request with a body must carry `content-type: application/json`.
   * Asserting the exact value kills: ConditionalExpression→false (never adds it),
   * EqualityOperator (adds it for undefined body), ObjectLiteral→{} (no header),
   * and StringLiteral→"" (empty content-type).
   */
  it('sends content-type: application/json for a POST request with body', async () => {
    let capturedHeaders: Record<string, string> = {}
    vi.stubGlobal(
      'fetch',
      vi.fn((_url: string, init?: RequestInit) => {
        capturedHeaders = (init?.headers ?? {}) as Record<string, string>
        return Promise.resolve({
          status: 200,
          headers: new Headers({ 'x-request-id': 'r', 'x-trace-id': 't' }),
          json: () => Promise.resolve({}),
        } as Response)
      }),
    )
    await triggerApi.order('acme')
    expect(capturedHeaders['content-type']).toBe('application/json')
  })

  /**
   * A GET request without a body must NOT carry a `content-type` header.
   * Asserting absence kills the ConditionalExpression→true mutation that always
   * adds `content-type` regardless of whether a body is present.
   */
  it('does not send content-type for a GET request without body', async () => {
    let capturedHeaders: Record<string, string> = {}
    vi.stubGlobal(
      'fetch',
      vi.fn((_url: string, init?: RequestInit) => {
        capturedHeaders = (init?.headers ?? {}) as Record<string, string>
        return Promise.resolve({
          status: 200,
          headers: new Headers({ 'x-request-id': 'r', 'x-trace-id': 't' }),
          json: () => Promise.resolve({}),
        } as Response)
      }),
    )
    await triggerApi.status(400)
    expect(capturedHeaders['content-type']).toBeUndefined()
  })

  /**
   * A GET request without a body must NOT have a `body` property in the fetch
   * init object. Asserting absence kills the ConditionalExpression→true mutation
   * on `body !== undefined` that would always spread `{ body: JSON.stringify(body) }`,
   * adding `body: undefined` to the init even for bodyless requests.
   */
  it('omits the body property from the fetch init for a GET request', async () => {
    let capturedInit: RequestInit | undefined
    vi.stubGlobal(
      'fetch',
      vi.fn((_url: string, init?: RequestInit) => {
        capturedInit = init
        return Promise.resolve({
          status: 200,
          headers: new Headers({ 'x-request-id': 'r', 'x-trace-id': 't' }),
          json: () => Promise.resolve({}),
        } as Response)
      }),
    )
    await triggerApi.status(400)
    expect(capturedInit).not.toHaveProperty('body')
  })
})
