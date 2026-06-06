/**
 * @fileoverview Unit tests for the alerts client helpers — endpoint masking and
 * the incident transition request body.
 *
 * @module lib/alerts-api.test
 */
import { afterEach, describe, expect, it, vi } from 'vitest'

import {
  type AlertRule,
  type AlertRuleInput,
  AlertsApiError,
  createChannel,
  createRule,
  type Incident,
  listChannels,
  listIncidents,
  listRules,
  maskEndpoint,
  type NotificationChannel,
  testChannel,
  transitionIncident,
  updateRule,
} from './alerts-api'
import type { RbacContext } from './types'

/** A fully-shaped incident the response schema accepts (timeline is required). */
const VALID_INCIDENT: Incident = {
  id: 'i1',
  ruleId: 'r1',
  status: 'snoozed',
  logKey: null,
  openedAt: '2026-01-01T00:00:00.000Z',
  resolvedAt: null,
  timeline: [],
}

/** The active identity sent with every RBAC-scoped request. */
const RBAC: RbacContext = { role: 'admin', tenantId: 'acme' }

/** A fully-shaped rule the response schema accepts. */
const VALID_RULE: AlertRule = {
  id: 'r1',
  name: 'High error rate',
  expr: 'errorRate',
  threshold: 0.1,
  forDuration: '5m',
  severity: 'critical',
  isEnabled: true,
  channels: ['c1'],
  createdAt: '2026-01-01T00:00:00.000Z',
}

/** A fully-shaped channel the response schema accepts. */
const VALID_CHANNEL: NotificationChannel = {
  id: 'c1',
  type: 'slack',
  name: 'oncall',
  endpoint: 'https://hooks.slack.com/services/T/B/x',
  severities: ['critical', 'warning'],
}

/** Build a minimal `Response`-like object the client consumes. */
function jsonResponse(
  body: unknown,
  options: { ok?: boolean; status?: number; statusText?: string } = {},
): Response {
  return {
    ok: options.ok ?? true,
    status: options.status ?? 200,
    statusText: options.statusText ?? 'OK',
    json: () => Promise.resolve(body),
  } as unknown as Response
}

describe('maskEndpoint', () => {
  /** A webhook URL keeps scheme + host but hides the token-bearing path. */
  it('masks the token segment of a webhook URL', () => {
    const masked = maskEndpoint('https://hooks.slack.com/services/T000/B000/xRealToken')
    expect(masked.startsWith('https://hooks.slack.com/')).toBe(true)
    expect(masked).not.toContain('xRealToken')
    expect(masked).toContain('****')
  })

  /** A plain address (email-mock) is masked except a short tail. */
  it('masks a non-URL address', () => {
    expect(maskEndpoint('ops@example.com')).toBe('****.com')
  })

  /**
   * A URL whose path is <= 4 chars must collapse to `scheme://host/****` with no
   * revealed tail — guards the short-path branch so host chars never leak.
   */
  it('masks a URL with a short path without revealing a tail', () => {
    expect(maskEndpoint('https://hooks.slack.com/ab')).toBe('https://hooks.slack.com/****')
  })

  /**
   * A plain address <= 4 chars must collapse to `****` with no tail — guards the
   * short plain-address branch so the whole secret is hidden.
   */
  it('masks a short plain address to **** with no tail', () => {
    expect(maskEndpoint('a@b')).toBe('****')
  })
})

describe('transitionIncident', () => {
  afterEach(() => vi.unstubAllGlobals())

  /** A snooze transition must send both the action and the snooze duration. */
  it('sends the snooze duration in the PATCH body', async () => {
    let captured: { method: string | undefined; body: unknown } = {
      method: undefined,
      body: undefined,
    }
    vi.stubGlobal(
      'fetch',
      vi.fn((_url: string, init?: RequestInit) => {
        // The client always serializes a JSON string body, so parse it directly.
        captured = { method: init?.method, body: JSON.parse(init?.body as string) as unknown }
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve(VALID_INCIDENT),
        } as Response)
      }),
    )
    await transitionIncident('i1', 'snooze', { role: 'admin', tenantId: '' }, '4h')
    expect(captured.method).toBe('PATCH')
    expect(captured.body).toEqual({ action: 'snooze', snoozeDuration: '4h' })
  })

  /** A non-snooze transition must omit snoozeDuration — only the action is sent. */
  it('omits the snooze duration for an acknowledge transition', async () => {
    let captured: unknown
    vi.stubGlobal(
      'fetch',
      vi.fn((_url: string, init?: RequestInit) => {
        captured = JSON.parse(init?.body as string) as unknown
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve({ ...VALID_INCIDENT, status: 'acknowledged' }),
        } as Response)
      }),
    )
    await transitionIncident('i1', 'acknowledge', { role: 'admin', tenantId: '' })
    expect(captured).toEqual({ action: 'acknowledge' })
  })

  /** A resolve transition likewise sends only the action, never a duration. */
  it('omits the snooze duration for a resolve transition', async () => {
    let captured: unknown
    vi.stubGlobal(
      'fetch',
      vi.fn((_url: string, init?: RequestInit) => {
        captured = JSON.parse(init?.body as string) as unknown
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve({ ...VALID_INCIDENT, status: 'resolved' }),
        } as Response)
      }),
    )
    await transitionIncident('i1', 'resolve', { role: 'admin', tenantId: '' })
    expect(captured).toEqual({ action: 'resolve' })
  })

  /** A non-2xx response must reject with an AlertsApiError carrying the status. */
  it('throws AlertsApiError on a non-ok response', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(() =>
        Promise.resolve({
          ok: false,
          status: 403,
          statusText: 'Forbidden',
          json: () => Promise.resolve({}),
        } as Response),
      ),
    )
    await expect(
      transitionIncident('i1', 'acknowledge', { role: 'viewer', tenantId: '' }),
    ).rejects.toBeInstanceOf(AlertsApiError)
  })

  /** A 2xx response whose body violates the schema must still throw an AlertsApiError. */
  it('throws AlertsApiError when the response shape is invalid', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(() => Promise.resolve(jsonResponse({ id: 'i1' }))),
    )
    await expect(transitionIncident('i1', 'resolve', RBAC)).rejects.toThrow(
      /unexpected response shape/,
    )
  })
})

describe('listRules', () => {
  afterEach(() => vi.unstubAllGlobals())

  /** The rules list must GET /alerts/rules with the RBAC header and return the array. */
  it('GETs the rules with the x-role header', async () => {
    let captured: { url: string; method: string | undefined; headers: HeadersInit | undefined } = {
      url: '',
      method: undefined,
      headers: undefined,
    }
    vi.stubGlobal(
      'fetch',
      vi.fn((url: string, init?: RequestInit) => {
        captured = { url, method: init?.method, headers: init?.headers }
        return Promise.resolve(jsonResponse([VALID_RULE]))
      }),
    )
    const rules = await listRules(RBAC)
    expect(rules).toEqual([VALID_RULE])
    expect(captured.url).toContain('/alerts/rules')
    expect(captured.method).toBe('GET')
    expect((captured.headers as Record<string, string>)['x-role']).toBe('admin')
    expect((captured.headers as Record<string, string>)['x-tenant-id']).toBe('acme')
  })
})

describe('createRule', () => {
  afterEach(() => vi.unstubAllGlobals())

  /** Creating a rule must POST the input body and return the persisted rule. */
  it('POSTs the rule input and returns the created rule', async () => {
    const input: AlertRuleInput = {
      name: 'High error rate',
      expr: 'errorRate',
      threshold: 0.1,
      forDuration: '5m',
      severity: 'critical',
      channels: ['c1'],
    }
    let captured: { method: string | undefined; body: unknown } = {
      method: undefined,
      body: undefined,
    }
    vi.stubGlobal(
      'fetch',
      vi.fn((_url: string, init?: RequestInit) => {
        captured = { method: init?.method, body: JSON.parse(init?.body as string) as unknown }
        return Promise.resolve(jsonResponse(VALID_RULE))
      }),
    )
    const rule = await createRule(input, RBAC)
    expect(captured.method).toBe('POST')
    expect(captured.body).toEqual(input)
    expect(rule).toEqual(VALID_RULE)
  })
})

describe('updateRule', () => {
  afterEach(() => vi.unstubAllGlobals())

  /** Patching a rule must PATCH the id-scoped path with the partial body. */
  it('PATCHes the encoded id with the partial input', async () => {
    let captured: { url: string; method: string | undefined; body: unknown } = {
      url: '',
      method: undefined,
      body: undefined,
    }
    vi.stubGlobal(
      'fetch',
      vi.fn((url: string, init?: RequestInit) => {
        captured = { url, method: init?.method, body: JSON.parse(init?.body as string) as unknown }
        return Promise.resolve(jsonResponse({ ...VALID_RULE, isEnabled: false }))
      }),
    )
    const rule = await updateRule('r 1', { isEnabled: false }, RBAC)
    expect(captured.method).toBe('PATCH')
    // The id is URL-encoded into the path (the space becomes %20).
    expect(captured.url).toContain('/alerts/rules/r%201')
    expect(captured.body).toEqual({ isEnabled: false })
    expect(rule.isEnabled).toBe(false)
  })
})

describe('listChannels', () => {
  afterEach(() => vi.unstubAllGlobals())

  /** Listing channels must GET /alerts/channels and return the validated array. */
  it('GETs the channels and returns the array', async () => {
    let url = ''
    vi.stubGlobal(
      'fetch',
      vi.fn((u: string) => {
        url = u
        return Promise.resolve(jsonResponse([VALID_CHANNEL]))
      }),
    )
    const channels = await listChannels(RBAC)
    expect(url).toContain('/alerts/channels')
    expect(channels).toEqual([VALID_CHANNEL])
  })
})

describe('createChannel', () => {
  afterEach(() => vi.unstubAllGlobals())

  /** Registering a channel must POST it and return the `{ ok, channel }` envelope. */
  it('POSTs the channel and returns the envelope', async () => {
    let captured: { method: string | undefined; body: unknown } = {
      method: undefined,
      body: undefined,
    }
    vi.stubGlobal(
      'fetch',
      vi.fn((_url: string, init?: RequestInit) => {
        captured = { method: init?.method, body: JSON.parse(init?.body as string) as unknown }
        return Promise.resolve(jsonResponse({ ok: true, channel: VALID_CHANNEL }))
      }),
    )
    const result = await createChannel(VALID_CHANNEL, RBAC)
    expect(captured.method).toBe('POST')
    expect(captured.body).toEqual(VALID_CHANNEL)
    expect(result).toEqual({ ok: true, channel: VALID_CHANNEL })
  })
})

describe('testChannel', () => {
  afterEach(() => vi.unstubAllGlobals())

  /** Test-firing a channel must POST the id-scoped `/test` path with an empty body. */
  it('POSTs the test path and returns the ok envelope', async () => {
    let captured: { url: string; method: string | undefined; body: unknown } = {
      url: '',
      method: undefined,
      body: undefined,
    }
    vi.stubGlobal(
      'fetch',
      vi.fn((url: string, init?: RequestInit) => {
        captured = { url, method: init?.method, body: JSON.parse(init?.body as string) as unknown }
        return Promise.resolve(jsonResponse({ ok: true }))
      }),
    )
    const result = await testChannel('c1', RBAC)
    expect(captured.method).toBe('POST')
    expect(captured.url).toContain('/alerts/channels/c1/test')
    expect(captured.body).toEqual({})
    expect(result).toEqual({ ok: true })
  })
})

describe('listIncidents', () => {
  afterEach(() => vi.unstubAllGlobals())

  /** Listing incidents must GET /incidents and return the validated array. */
  it('GETs the incidents and returns the array', async () => {
    let url = ''
    vi.stubGlobal(
      'fetch',
      vi.fn((u: string) => {
        url = u
        return Promise.resolve(jsonResponse([VALID_INCIDENT]))
      }),
    )
    const incidents = await listIncidents(RBAC)
    expect(url).toContain('/incidents')
    expect(incidents).toEqual([VALID_INCIDENT])
  })
})
