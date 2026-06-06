/**
 * Unit tests for `LokiClient` and `LokiProxyController`.
 *
 * Covers: correct `query_range` URL + LogQL composition, `label/<name>/values`
 * URL, and a 502 on Loki 500 or network failure.
 */
import { describe, expect, it, jest, beforeEach } from '@jest/globals'
import { BadGatewayException } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'

import { LokiClient, LokiUnavailableError } from './loki.client.js'
import { LokiProxyController } from './loki-proxy.controller.js'
import { LogsService } from './logs.service.js'

function buildClient(): { client: LokiClient; fetchMock: ReturnType<typeof jest.fn> } {
  const config = {
    getOrThrow: jest.fn<() => string>().mockReturnValue('http://loki:3100'),
  } as unknown as ConfigService
  const client = new LokiClient(config)
  const fetchMock = jest.fn<typeof fetch>()
  globalThis.fetch = fetchMock as unknown as typeof fetch
  return { client, fetchMock }
}

describe('LokiClient.queryRange', () => {
  beforeEach(() => {
    jest.clearAllMocks()
  })

  it('calls the correct Loki query_range URL with the given LogQL', async () => {
    /**
     * `queryRange` must build a URL with `query`, `start`, `end`, `step`, and `limit`
     * params, pointing to `/loki/api/v1/query_range`.
     */
    const { client, fetchMock } = buildClient()
    const mockBody = { status: 'success', data: { resultType: 'streams', result: [] } }
    fetchMock.mockResolvedValue(
      new Response(JSON.stringify(mockBody), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      }),
    )

    await client.queryRange('{service="api"}', '1000000000', '2000000000', '60s', 100)

    expect(fetchMock).toHaveBeenCalledTimes(1)
    const callUrl = String((fetchMock.mock.calls[0] as [string])[0])
    expect(callUrl).toContain('/loki/api/v1/query_range')
    expect(callUrl).toContain('query=')
    expect(callUrl).toContain('service%3D%22api%22')
    expect(callUrl).toContain('step=60s')
    expect(callUrl).toContain('limit=100')
  })

  it('throws LokiUnavailableError on a 500 response', async () => {
    /**
     * A Loki 500 response must raise `LokiUnavailableError` so the controller
     * can map it to HTTP 502.
     */
    const { client, fetchMock } = buildClient()
    fetchMock.mockResolvedValue(new Response('Internal Server Error', { status: 500 }))

    await expect(client.queryRange('{service="api"}', '0', '1', '60s', 10)).rejects.toThrow(
      LokiUnavailableError,
    )
  })

  it('throws LokiUnavailableError when fetch rejects (network error)', async () => {
    /**
     * A network-level fetch rejection must also raise `LokiUnavailableError`.
     */
    const { client, fetchMock } = buildClient()
    fetchMock.mockRejectedValue(new Error('ECONNREFUSED'))

    await expect(client.queryRange('{service="api"}', '0', '1', '60s', 10)).rejects.toThrow(
      LokiUnavailableError,
    )
  })
})

describe('LokiClient.labelValues', () => {
  it('calls the correct label values URL', async () => {
    /**
     * `labelValues("level")` must request `/loki/api/v1/label/level/values`.
     */
    const { client, fetchMock } = buildClient()
    const mockBody = { status: 'success', data: ['error', 'warn', 'info'] }
    fetchMock.mockResolvedValue(
      new Response(JSON.stringify(mockBody), {
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

  it('appends the RBAC-scoped query and time window when opts are supplied', async () => {
    /**
     * When `query`/`startNs`/`endNs` opts are provided, they must be appended as URL
     * params so Loki restricts the returned values to streams matching the selector
     * within the window (prevents cross-tenant label leakage). Exercises the three
     * `if` branches and the non-empty querystring suffix.
     */
    const { client, fetchMock } = buildClient()
    const mockBody = { status: 'success', data: ['api'] }
    fetchMock.mockResolvedValue(
      new Response(JSON.stringify(mockBody), {
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
    expect(callUrl).toContain('/loki/api/v1/label/service/values?')
    expect(callUrl).toContain('query=')
    expect(callUrl).toContain('start=1000000000')
    expect(callUrl).toContain('end=2000000000')
    expect(result).toEqual(['api'])
  })

  it('wraps a non-Error network rejection in LokiUnavailableError with a stringified detail', async () => {
    /**
     * A fetch rejection whose reason is not an `Error` (e.g. a thrown string) must still
     * surface as `LokiUnavailableError`, with the reason coerced via `String(err)` — this
     * exercises the `err instanceof Error ? ... : String(err)` false branch.
     */
    const { client, fetchMock } = buildClient()
    fetchMock.mockRejectedValue('boom')

    await expect(client.labelValues('level')).rejects.toThrow(LokiUnavailableError)
  })
})

describe('LokiProxyController.loki', () => {
  it('throws BadGatewayException (502) when Loki is unavailable', async () => {
    /**
     * When `LokiClient` throws `LokiUnavailableError`, the controller must wrap it
     * in a `BadGatewayException` so the dashboard responds with 502.
     */
    const client = {
      queryRange: jest
        .fn<() => Promise<never>>()
        .mockRejectedValue(new LokiUnavailableError('connection refused')),
      labelValues: jest
        .fn<() => Promise<never>>()
        .mockRejectedValue(new LokiUnavailableError('connection refused')),
    } as unknown as LokiClient

    const controller = new LokiProxyController(new LogsService(), client)

    const adminHeaders = { 'x-role': 'admin' }
    await expect(
      controller.loki(adminHeaders, { mode: 'query_range', source: 'loki', limit: 100 }),
    ).rejects.toThrow(BadGatewayException)
  })

  it('returns a tail hint pointing to the SSE endpoint', async () => {
    /**
     * The `tail` mode must NOT stream the Loki WebSocket — instead it returns a
     * hint pointing clients to the SSE feed at `GET /logs/stream`.
     */
    const client = {} as LokiClient
    const controller = new LokiProxyController(new LogsService(), client)

    const adminHeaders = { 'x-role': 'admin' }
    const result = (await controller.loki(adminHeaders, {
      mode: 'tail',
      source: 'loki',
      limit: 100,
    })) as { stream: string }
    expect(result.stream).toBe('/logs/stream')
  })

  it('proxies query_range with nanosecond timestamps and returns the Loki response', async () => {
    /**
     * Default `query_range` mode must call `LokiClient.queryRange` with the compiled
     * LogQL, nanosecond start/end strings, the step, and the limit; the raw Loki
     * response is returned unchanged. Omitting `from`/`to` defaults the window to the
     * last hour, exercising the `q.from ? ... : ...` and `q.step ?? '60s'` branches.
     */
    const lokiResponse = { status: 'success', data: { resultType: 'streams', result: [] } }
    const queryRange = jest.fn<() => Promise<typeof lokiResponse>>().mockResolvedValue(lokiResponse)
    const client = { queryRange } as unknown as LokiClient
    const controller = new LokiProxyController(new LogsService(), client)

    const result = await controller.loki(
      { 'x-role': 'admin' },
      { mode: 'query_range', source: 'loki', limit: 100 },
    )

    expect(result).toBe(lokiResponse)
    expect(queryRange).toHaveBeenCalledTimes(1)
    const args = queryRange.mock.calls[0] as [string, string, string, string, number]
    // start/end are nanosecond-epoch strings (no decimal point, all digits).
    expect(args[1]).toMatch(/^\d+$/)
    expect(args[2]).toMatch(/^\d+$/)
    expect(args[3]).toBe('60s')
    expect(args[4]).toBe(100)
  })

  it('proxies query_range honoring explicit from/to and step', async () => {
    /**
     * When `from`, `to`, and `step` are supplied, the controller must convert the
     * explicit window to nanoseconds and forward the provided step — covering the
     * truthy side of `q.from ? ...`, `q.to ? ...`, and `q.step ?? '60s'`.
     */
    const lokiResponse = { status: 'success', data: { resultType: 'streams', result: [] } }
    const queryRange = jest.fn<() => Promise<typeof lokiResponse>>().mockResolvedValue(lokiResponse)
    const client = { queryRange } as unknown as LokiClient
    const controller = new LokiProxyController(new LogsService(), client)

    await controller.loki({ 'x-role': 'admin' }, {
      mode: 'query_range',
      source: 'loki',
      limit: 50,
      from: '2024-06-01T00:00:00.000Z',
      to: '2024-06-01T01:00:00.000Z',
      step: '5m',
    } as unknown as Parameters<LokiProxyController['loki']>[1])

    const args = queryRange.mock.calls[0] as [string, string, string, string, number]
    // 2024-06-01T00:00:00Z = 1717200000000 ms -> *1e6 ns.
    expect(args[1]).toBe('1717200000000000000')
    expect(args[2]).toBe('1717203600000000000')
    expect(args[3]).toBe('5m')
  })

  it('returns scoped label values for labels mode', async () => {
    /**
     * `labels` mode must call `LokiClient.labelValues` with the requested label name
     * scoped by the RBAC LogQL selector and time window, and return `{ values }`.
     */
    const labelValues = jest.fn<() => Promise<string[]>>().mockResolvedValue(['api', 'web'])
    const client = { labelValues } as unknown as LokiClient
    const controller = new LokiProxyController(new LogsService(), client)

    const result = (await controller.loki({ 'x-role': 'admin' }, {
      mode: 'labels',
      labelName: 'service',
      source: 'loki',
      limit: 100,
    } as unknown as Parameters<LokiProxyController['loki']>[1])) as { values: string[] }

    expect(result.values).toEqual(['api', 'web'])
    const args = labelValues.mock.calls[0] as [
      string,
      { query: string; startNs: string; endNs: string },
    ]
    expect(args[0]).toBe('service')
    expect(args[1].startNs).toMatch(/^\d+$/)
    expect(args[1].endNs).toMatch(/^\d+$/)
  })

  it('defaults labels mode to the level label when labelName is omitted', async () => {
    /**
     * `labels` mode without `labelName` must default to `level` — exercising the
     * `q.labelName ?? 'level'` nullish-coalescing fallback.
     */
    const labelValues = jest.fn<() => Promise<string[]>>().mockResolvedValue(['error'])
    const client = { labelValues } as unknown as LokiClient
    const controller = new LokiProxyController(new LogsService(), client)

    await controller.loki({ 'x-role': 'admin' }, { mode: 'labels', source: 'loki', limit: 100 })

    expect((labelValues.mock.calls[0] as [string])[0]).toBe('level')
  })

  it('rethrows a non-Loki error unchanged (not as a 502)', async () => {
    /**
     * Only `LokiUnavailableError` maps to a 502; any other error from the client must
     * propagate unchanged so it is not masked as a Loki-availability problem. This
     * covers the final `throw err` re-raise branch.
     */
    const boom = new TypeError('unexpected programming error')
    const client = {
      queryRange: jest.fn<() => Promise<never>>().mockRejectedValue(boom),
    } as unknown as LokiClient
    const controller = new LokiProxyController(new LogsService(), client)

    await expect(
      controller.loki({ 'x-role': 'admin' }, { mode: 'query_range', source: 'loki', limit: 100 }),
    ).rejects.toBe(boom)
  })
})
