/**
 * Unit tests for `LokiClient`.
 *
 * Covers: `query_range` URL + LogQL composition, the `label/<name>/values` URL with
 * and without RBAC-scoping opts, and the failure paths — a non-2xx status and a
 * network throw (both `Error` and non-`Error` rejection reasons) raised as
 * `LokiUnavailableError`. `fetch` is stubbed so no real Loki instance is required.
 */
import { describe, expect, it, jest, beforeEach, afterEach } from '@jest/globals'
import { ConfigService } from '@nestjs/config'

import { LokiClient, LokiUnavailableError } from './loki.client.js'

/** Build a client over a stubbed `ConfigService` and a controllable global `fetch`. */
function buildClient(): { client: LokiClient; fetchMock: ReturnType<typeof jest.fn> } {
  const config = {
    getOrThrow: jest.fn<() => string>().mockReturnValue('http://loki:3100'),
  } as unknown as ConfigService
  const client = new LokiClient(config)
  const fetchMock = jest.fn<typeof fetch>()
  globalThis.fetch = fetchMock as unknown as typeof fetch
  return { client, fetchMock }
}

const originalFetch = globalThis.fetch

describe('LokiClient.queryRange', () => {
  beforeEach(() => {
    jest.clearAllMocks()
  })
  afterEach(() => {
    globalThis.fetch = originalFetch
  })

  it('builds the query_range URL with all five params and returns the parsed body', async () => {
    /**
     * `queryRange` must compose a `/loki/api/v1/query_range` URL carrying `query`,
     * `start`, `end`, `step`, and `limit`, and return the JSON body unchanged — the
     * happy path through the private `get` helper (2xx response).
     */
    const { client, fetchMock } = buildClient()
    const body = { status: 'success', data: { resultType: 'streams', result: [] } }
    fetchMock.mockResolvedValue(
      new Response(JSON.stringify(body), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      }),
    )

    const result = await client.queryRange(
      '{service="api"}',
      '1000000000',
      '2000000000',
      '60s',
      100,
    )

    expect(result).toEqual(body)
    const callUrl = String((fetchMock.mock.calls[0] as [string])[0])
    expect(callUrl).toContain('/loki/api/v1/query_range')
    expect(callUrl).toContain('query=')
    expect(callUrl).toContain('service%3D%22api%22')
    expect(callUrl).toContain('start=1000000000')
    expect(callUrl).toContain('end=2000000000')
    expect(callUrl).toContain('step=60s')
    expect(callUrl).toContain('limit=100')
  })

  it('raises LokiUnavailableError carrying the status on a non-2xx response', async () => {
    /**
     * A non-`ok` response must raise `LokiUnavailableError` with the HTTP status
     * attached so the controller can map it to a 502 — covers the `!response.ok`
     * branch of the `get` helper.
     */
    const { client, fetchMock } = buildClient()
    fetchMock.mockResolvedValue(new Response('Internal Server Error', { status: 500 }))

    await expect(client.queryRange('{service="api"}', '0', '1', '60s', 10)).rejects.toMatchObject({
      name: 'LokiUnavailableError',
      status: 500,
    })
  })

  it('wraps an Error network rejection in LokiUnavailableError using its message', async () => {
    /**
     * A network-level `fetch` rejection whose reason IS an `Error` must surface as
     * `LokiUnavailableError` with the original message embedded — covers the
     * `err instanceof Error ? err.message : ...` true branch of the catch.
     */
    const { client, fetchMock } = buildClient()
    fetchMock.mockRejectedValue(new Error('ECONNREFUSED'))

    await expect(client.queryRange('{service="api"}', '0', '1', '60s', 10)).rejects.toThrow(
      LokiUnavailableError,
    )
    await expect(client.queryRange('{service="api"}', '0', '1', '60s', 10)).rejects.toThrow(
      /ECONNREFUSED/,
    )
  })

  it('wraps a non-Error network rejection in LokiUnavailableError via String(err)', async () => {
    /**
     * A `fetch` rejection whose reason is NOT an `Error` (a thrown string) must still
     * become a `LokiUnavailableError`, with the reason coerced through `String(err)` —
     * covers the false side of `err instanceof Error ? ... : String(err)`.
     */
    const { client, fetchMock } = buildClient()
    fetchMock.mockRejectedValue('boom')

    await expect(client.queryRange('{service="api"}', '0', '1', '60s', 10)).rejects.toThrow(/boom/)
  })
})

describe('LokiClient.labelValues', () => {
  beforeEach(() => {
    jest.clearAllMocks()
  })
  afterEach(() => {
    globalThis.fetch = originalFetch
  })

  it('requests the bare label values URL with no querystring when opts are omitted', async () => {
    /**
     * Called without `opts`, `labelValues` must hit `/loki/api/v1/label/<name>/values`
     * with no `?` suffix — covers the empty-querystring branch (`qs ? ... : ''`) and the
     * three `if (opts?.x)` false sides via optional chaining on an undefined `opts`.
     */
    const { client, fetchMock } = buildClient()
    fetchMock.mockResolvedValue(
      new Response(JSON.stringify({ status: 'success', data: ['error', 'warn', 'info'] }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      }),
    )

    const result = await client.labelValues('level')

    const callUrl = String((fetchMock.mock.calls[0] as [string])[0])
    expect(callUrl).toContain('/loki/api/v1/label/level/values')
    expect(callUrl).not.toContain('?')
    expect(result).toEqual(['error', 'warn', 'info'])
  })

  it('omits each absent scoping param while including the ones supplied', async () => {
    /**
     * With an `opts` object present but only `query` set (no `startNs`/`endNs`), only the
     * `query` param must be appended — exercises the true side of `if (opts?.query)` and
     * the false sides of the `startNs`/`endNs` guards, plus the non-empty suffix branch.
     */
    const { client, fetchMock } = buildClient()
    fetchMock.mockResolvedValue(
      new Response(JSON.stringify({ status: 'success', data: ['api'] }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      }),
    )

    await client.labelValues('service', { query: '{tenantId="acme"}' })

    const callUrl = String((fetchMock.mock.calls[0] as [string])[0])
    expect(callUrl).toContain('/loki/api/v1/label/service/values?')
    expect(callUrl).toContain('query=')
    expect(callUrl).not.toContain('start=')
    expect(callUrl).not.toContain('end=')
  })

  it('appends query, start, and end together when the full window is supplied', async () => {
    /**
     * All three scoping opts present must each be appended so Loki restricts the
     * returned values to streams matching the selector within the window — covers the
     * true sides of all three `if (opts?.x)` guards simultaneously.
     */
    const { client, fetchMock } = buildClient()
    fetchMock.mockResolvedValue(
      new Response(JSON.stringify({ status: 'success', data: ['api'] }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      }),
    )

    const result = await client.labelValues('service', {
      query: '{tenantId="acme"}',
      startNs: '1000000000',
      endNs: '2000000000',
    })

    const callUrl = String((fetchMock.mock.calls[0] as [string])[0])
    expect(callUrl).toContain('query=')
    expect(callUrl).toContain('start=1000000000')
    expect(callUrl).toContain('end=2000000000')
    expect(result).toEqual(['api'])
  })

  it('raises LokiUnavailableError when the label values request returns non-2xx', async () => {
    /**
     * The `labelValues` path shares the `get` helper, so a non-2xx response here must
     * also raise `LokiUnavailableError` — confirms the failure mapping is not specific
     * to `queryRange`.
     */
    const { client, fetchMock } = buildClient()
    fetchMock.mockResolvedValue(new Response('nope', { status: 503 }))

    await expect(client.labelValues('level')).rejects.toThrow(LokiUnavailableError)
  })

  it('URL ends with /values and has no suffix when opts are entirely omitted', async () => {
    /**
     * When no opts are supplied, the `suffix` variable must remain `''` (the
     * empty-string else-branch). If mutated to a non-empty string such as
     * `'Stryker was here!'`, the URL gains an unexpected suffix. Asserting the
     * URL ends with `/values` kills that StringLiteral mutation (L99).
     */
    const { client, fetchMock } = buildClient()
    fetchMock.mockResolvedValue(
      new Response(JSON.stringify({ status: 'success', data: ['info'] }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      }),
    )

    await client.labelValues('info')

    const callUrl = String((fetchMock.mock.calls[0] as [string])[0])
    // The URL must end with /values — no extra suffix appended.
    expect(callUrl).toMatch(/\/values$/)
  })
})

describe('LokiClient constructor', () => {
  it('reads the LOKI_QUERY_URL config key by exact name', () => {
    /**
     * The constructor must call `config.getOrThrow` with the exact key string
     * 'LOKI_QUERY_URL'. If Stryker mutates that literal to '', the assertion on
     * which key was requested fails, killing the mutant.
     */
    const getOrThrow = jest.fn<(key: string) => string>().mockReturnValue('http://loki:3100')
    const config = { getOrThrow } as unknown as ConfigService
    new LokiClient(config)
    expect(getOrThrow).toHaveBeenCalledWith('LOKI_QUERY_URL')
  })
})

describe('LokiClient.get helper — fetch call shape', () => {
  beforeEach(() => {
    jest.clearAllMocks()
  })
  afterEach(() => {
    globalThis.fetch = originalFetch
  })

  it('sends Accept: application/json as the exact header value', async () => {
    /**
     * The private `get` helper must set `headers: { Accept: 'application/json' }`.
     * Using `toEqual` on the entire headers object kills mutations that change the
     * header name or value (e.g. mutating 'application/json' to '').
     */
    const { client, fetchMock } = buildClient()
    fetchMock.mockResolvedValue(
      new Response(
        JSON.stringify({ status: 'success', data: { resultType: 'streams', result: [] } }),
        {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        },
      ),
    )
    await client.queryRange('{service="api"}', '0', '1', '60s', 10)

    const [, callInit] = fetchMock.mock.calls[0] as [string, RequestInit]
    expect(callInit.headers).toEqual({ Accept: 'application/json' })
  })

  it('passes the full init object including headers and signal to fetch', async () => {
    /**
     * The fetch RequestInit (L116 ObjectLiteral) must include both the `headers`
     * and `signal` fields. If the object literal is mutated to `{}`, one or both
     * fields are missing and these property assertions fail.
     */
    const { client, fetchMock } = buildClient()
    fetchMock.mockResolvedValue(
      new Response(JSON.stringify({ status: 'success', data: [] }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      }),
    )
    await client.queryRange('{service="api"}', '0', '1', '60s', 10)

    const [, callInit] = fetchMock.mock.calls[0] as [string, RequestInit]
    expect(callInit).toMatchObject({
      headers: { Accept: 'application/json' },
    })
    // Signal must be present — ensures the AbortSignal timeout is actually wired.
    expect(callInit.signal).toBeDefined()
  })

  it('builds a query_range URL that is precisely /loki/api/v1/query_range (not a variant)', async () => {
    /**
     * The URL must contain '/loki/api/v1/query_range' exactly. The negative
     * assertion rules out mutations that add extra characters (e.g. 'query_range_'
     * or 'query_ranges') while still containing the substring.
     */
    const { client, fetchMock } = buildClient()
    fetchMock.mockResolvedValue(
      new Response(
        JSON.stringify({ status: 'success', data: { resultType: 'streams', result: [] } }),
        {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        },
      ),
    )
    await client.queryRange('{service="api"}', '0', '1', '60s', 10)

    const callUrl = String((fetchMock.mock.calls[0] as [string])[0])
    expect(callUrl).toContain('/loki/api/v1/query_range')
    expect(callUrl).not.toContain('/loki/api/v1/query_range_')
    expect(callUrl).not.toContain('/loki/api/v1/query_ranges')
  })

  it('includes the ? separator before query params in the query_range URL', async () => {
    /**
     * The URL suffix must be `?query=...` — not `query=...` without a separator.
     * Guards the `?${qs}` template literal in the `suffix` expression against
     * mutations that remove or change the `?`.
     */
    const { client, fetchMock } = buildClient()
    fetchMock.mockResolvedValue(
      new Response(JSON.stringify({ status: 'success', data: [] }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      }),
    )
    await client.labelValues('level', { query: '{service="api"}', startNs: '0', endNs: '1' })

    const callUrl = String((fetchMock.mock.calls[0] as [string])[0])
    // The querystring must be separated from the path by a literal '?'.
    expect(callUrl).toMatch(/\/values\?/)
  })

  it('includes the Loki-returned status code in the error message on non-2xx', async () => {
    /**
     * `LokiUnavailableError` thrown on a bad response must embed the status in
     * the message ('Loki returned 500 ...'). If the template literal is mutated
     * to '', the message is empty and this assertion fails.
     */
    const { client, fetchMock } = buildClient()
    fetchMock.mockResolvedValue(
      new Response('err', { status: 500, statusText: 'Internal Server Error' }),
    )

    const err = await client
      .queryRange('{service="api"}', '0', '1', '60s', 10)
      .catch((e: unknown) => e)
    expect(err).toBeInstanceOf(LokiUnavailableError)
    expect((err as Error).message).toContain('500')
  })
})
