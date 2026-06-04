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
    expect(result).toEqual(['error', 'warn', 'info'])
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
})
