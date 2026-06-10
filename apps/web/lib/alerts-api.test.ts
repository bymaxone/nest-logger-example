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

  /**
   * The error message for a non-ok response must be `"${status} ${statusText}"`.
   * A mutation that removes the `!res.ok` guard makes the code fall through to
   * schema validation, which throws a different message (`"unexpected response
   * shape …"`). Asserting the exact HTTP message format kills both the
   * ConditionalExpression→false mutation and the StringLiteral→"" mutation that
   * replaces the template literal with an empty string.
   */
  it('throws with the HTTP status message for a non-ok response', async () => {
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
    ).rejects.toMatchObject({ message: '403 Forbidden' })
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

  /**
   * Every request must advertise JSON via the `Accept` header.
   * A StringLiteral→"" mutation sets `Accept: ""`, making the server choose an
   * arbitrary content type. Asserting the exact value kills that mutation.
   */
  it('sends Accept: application/json header', async () => {
    let capturedHeaders: HeadersInit | undefined
    vi.stubGlobal(
      'fetch',
      vi.fn((_url: string, init?: RequestInit) => {
        capturedHeaders = init?.headers
        return Promise.resolve(jsonResponse([VALID_RULE]))
      }),
    )
    await listRules(RBAC)
    expect((capturedHeaders as Record<string, string>)?.['Accept']).toBe('application/json')
  })

  /**
   * A GET request (no body) must not include a `content-type` header.
   * A ConditionalExpression→true mutation on the `body !== undefined` guard would
   * always spread `{ 'content-type': 'application/json' }`. Asserting the header
   * is absent for a bodyless request kills that mutation.
   */
  it('omits the content-type header for a GET request with no body', async () => {
    let capturedHeaders: HeadersInit | undefined
    vi.stubGlobal(
      'fetch',
      vi.fn((_url: string, init?: RequestInit) => {
        capturedHeaders = init?.headers
        return Promise.resolve(jsonResponse([VALID_RULE]))
      }),
    )
    await listRules(RBAC)
    expect((capturedHeaders as Record<string, string>)?.['content-type']).toBeUndefined()
  })

  /**
   * A GET request (no body) must not include a `body` in the fetch options.
   * A ConditionalExpression→true mutation on the `body !== undefined` guard would
   * always spread `{ body: JSON.stringify(body) }` (with `undefined` body).
   * Asserting `init.body` is absent kills that mutation.
   */
  it('omits the body property for a GET request', async () => {
    let capturedBody: unknown = 'SENTINEL'
    vi.stubGlobal(
      'fetch',
      vi.fn((_url: string, init?: RequestInit) => {
        capturedBody = init?.body
        return Promise.resolve(jsonResponse([VALID_RULE]))
      }),
    )
    await listRules(RBAC)
    expect(capturedBody).toBeUndefined()
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

  /**
   * An incident whose timeline event is missing the required `actor`, `action`,
   * and `at` fields must be rejected with an `AlertsApiError`. Asserting the
   * rejection kills the `ObjectLiteral → {}` mutation on `incidentEventSchema`
   * that replaces the strict z.object() with an empty schema, which would then
   * accept any object (including structurally invalid events).
   */
  it('throws AlertsApiError when a timeline event is missing required fields', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(() =>
        Promise.resolve(
          jsonResponse([{ ...VALID_INCIDENT, timeline: [{ bogusField: 'not-an-event' }] }]),
        ),
      ),
    )
    await expect(listIncidents(RBAC)).rejects.toBeInstanceOf(AlertsApiError)
  })
})

describe('AlertsApiError', () => {
  /** The error class sets `name` to its own class name for instanceof-free identification. */
  it('sets name to AlertsApiError', () => {
    const err = new AlertsApiError(404, 'not found')
    expect(err.name).toBe('AlertsApiError')
  })

  /** The status is stored on the instance for callers that branch on HTTP status. */
  it('exposes the HTTP status as a property', () => {
    const err = new AlertsApiError(403, 'forbidden')
    expect(err.status).toBe(403)
  })

  /** The human-readable message is forwarded to the Error base class. */
  it('forwards the message to Error', () => {
    const err = new AlertsApiError(500, 'server error')
    expect(err.message).toBe('server error')
  })
})

describe('maskEndpoint — boundary cases', () => {
  /**
   * A path of exactly 4 characters is at the `<= MASK_REVEAL` boundary:
   * the entire path is hidden, no tail is revealed.
   */
  it('masks a URL whose path is exactly 4 characters with no tail', () => {
    // pathname = '/abc' = 4 chars → <= 4 → return scheme://host/****
    expect(maskEndpoint('https://host.example.com/abc')).toBe('https://host.example.com/****')
  })

  /**
   * A path of 5 characters is just above the boundary: the last 4 chars are
   * revealed.
   */
  it('reveals the last 4 chars of a 5-character path', () => {
    // pathname = '/abcd' = 5 chars > 4 → reveal path.slice(-4) = 'abcd'
    expect(maskEndpoint('https://host.example.com/abcd')).toBe('https://host.example.com/****abcd')
  })

  /**
   * A URL with a longer token path reveals only the trailing 4 chars of the
   * full `pathname + search` composite, not host chars.
   */
  it('reveals exactly 4 trailing chars of the token path', () => {
    const masked = maskEndpoint('https://hooks.slack.com/services/T000/B000/xRealToken1234')
    expect(masked).toBe('https://hooks.slack.com/****1234')
  })

  /**
   * A non-URL plain address of exactly 4 characters is fully hidden as `****`.
   */
  it('masks a 4-character plain address to ****', () => {
    expect(maskEndpoint('abcd')).toBe('****')
  })

  /**
   * A non-URL plain address of 5 characters reveals only the trailing 4 chars.
   */
  it('reveals the last 4 chars of a 5-character plain address', () => {
    expect(maskEndpoint('abcde')).toBe('****bcde')
  })
})

describe('transitionIncident — URL encoding', () => {
  afterEach(() => vi.unstubAllGlobals())

  /** The incident id must be URL-encoded in the PATCH path. */
  it('URL-encodes the incident id in the PATCH path', async () => {
    let capturedUrl = ''
    vi.stubGlobal(
      'fetch',
      vi.fn((url: string) => {
        capturedUrl = url
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve(VALID_INCIDENT),
        } as Response)
      }),
    )
    await transitionIncident('i 1', 'resolve', RBAC)
    expect(capturedUrl).toContain('/incidents/i%201')
  })
})

describe('testChannel — URL encoding', () => {
  afterEach(() => vi.unstubAllGlobals())

  /** A channel id with a special character must be URL-encoded in the test path. */
  it('URL-encodes the channel id in the test path', async () => {
    let capturedUrl = ''
    vi.stubGlobal(
      'fetch',
      vi.fn((url: string) => {
        capturedUrl = url
        return Promise.resolve(jsonResponse({ ok: true }))
      }),
    )
    await testChannel('c 1', RBAC)
    expect(capturedUrl).toContain('/alerts/channels/c%201/test')
  })
})

describe('listRules — exact URL path', () => {
  afterEach(() => vi.unstubAllGlobals())

  /** The GET must hit exactly /alerts/rules (not /alerts/rule or similar). */
  it('requests the exact /alerts/rules path', async () => {
    let capturedUrl = ''
    vi.stubGlobal(
      'fetch',
      vi.fn((url: string) => {
        capturedUrl = url
        return Promise.resolve(jsonResponse([VALID_RULE]))
      }),
    )
    await listRules(RBAC)
    expect(capturedUrl).toContain('/alerts/rules')
  })
})

describe('API base URL', () => {
  afterEach(() => vi.unstubAllGlobals())

  /**
   * When `NEXT_PUBLIC_API_URL` is absent the URL must fall back to
   * `http://localhost:3001`. Asserting `startsWith` kills:
   *  - the `??` → `&&` LogicalOperator mutation (gives `'undefined/...'`)
   *  - the `'http://localhost:3001'` → `''` StringLiteral mutation (gives `'/...'`)
   */
  it('uses http://localhost:3001 as the default base URL', async () => {
    let capturedUrl = ''
    vi.stubGlobal(
      'fetch',
      vi.fn((url: string) => {
        capturedUrl = url
        return Promise.resolve(jsonResponse([VALID_RULE]))
      }),
    )
    await listRules(RBAC)
    expect(capturedUrl.startsWith('http://localhost:3001')).toBe(true)
  })
})

describe('createRule — request headers and URL', () => {
  afterEach(() => vi.unstubAllGlobals())

  /**
   * A POST with a body must set `content-type: application/json`.
   * Asserting this kills:
   *  - the `'content-type'` → `''` StringLiteral mutation
   *  - the `'application/json'` → `''` StringLiteral mutation
   *  - the ObjectLiteral → `{}` mutation (removes the header object)
   *  - the ConditionalExpression→false mutation (never adds the header)
   */
  it('sets content-type: application/json when a body is present', async () => {
    let capturedHeaders: Record<string, string> = {}
    vi.stubGlobal(
      'fetch',
      vi.fn((_url: string, init?: RequestInit) => {
        capturedHeaders = init?.headers as Record<string, string>
        return Promise.resolve(jsonResponse(VALID_RULE))
      }),
    )
    const input: AlertRuleInput = {
      name: 'test',
      expr: 'count(*) over 1m > 0',
      threshold: 0,
      forDuration: '1m',
      severity: 'critical',
      channels: [],
    }
    await createRule(input, RBAC)
    expect(capturedHeaders['content-type']).toBe('application/json')
  })

  /**
   * The `createRule` POST must target exactly `/alerts/rules`.
   * Asserting this kills the StringLiteral mutation that empties the path.
   */
  it('POSTs to /alerts/rules', async () => {
    let capturedUrl = ''
    vi.stubGlobal(
      'fetch',
      vi.fn((url: string) => {
        capturedUrl = url
        return Promise.resolve(jsonResponse(VALID_RULE))
      }),
    )
    const input: AlertRuleInput = {
      name: 'test',
      expr: 'count(*) over 1m > 0',
      threshold: 0,
      forDuration: '1m',
      severity: 'critical',
      channels: [],
    }
    await createRule(input, RBAC)
    expect(capturedUrl).toContain('/alerts/rules')
    expect(capturedUrl).not.toBe('/alerts/rules')
    expect(capturedUrl.startsWith('http')).toBe(true)
  })
})

describe('testChannel — exact URL', () => {
  afterEach(() => vi.unstubAllGlobals())

  /**
   * The test path must contain `/test` after the encoded channel id.
   * Asserting this kills the StringLiteral mutation that empties the `/test` suffix.
   */
  it('appends /test to the encoded channel id in the test path', async () => {
    let capturedUrl = ''
    vi.stubGlobal(
      'fetch',
      vi.fn((url: string) => {
        capturedUrl = url
        return Promise.resolve(jsonResponse({ ok: true }))
      }),
    )
    await testChannel('c1', RBAC)
    expect(capturedUrl).toContain('/test')
    expect(capturedUrl).toContain('c1')
  })
})

describe('listIncidents — full URL base', () => {
  afterEach(() => vi.unstubAllGlobals())

  /**
   * Incidents must be fetched from the correct base URL.
   * Asserting `startsWith('http')` kills the StringLiteral mutation
   * that empties the `/incidents` path segment.
   */
  it('requests /incidents from the API base', async () => {
    let capturedUrl = ''
    vi.stubGlobal(
      'fetch',
      vi.fn((url: string) => {
        capturedUrl = url
        return Promise.resolve(jsonResponse([VALID_INCIDENT]))
      }),
    )
    await listIncidents(RBAC)
    expect(capturedUrl).toContain('/incidents')
    expect(capturedUrl.startsWith('http')).toBe(true)
  })
})

describe('listChannels — exact URL path', () => {
  afterEach(() => vi.unstubAllGlobals())

  /** The GET must hit exactly /alerts/channels. */
  it('requests the exact /alerts/channels path', async () => {
    let capturedUrl = ''
    vi.stubGlobal(
      'fetch',
      vi.fn((url: string) => {
        capturedUrl = url
        return Promise.resolve(jsonResponse([VALID_CHANNEL]))
      }),
    )
    await listChannels(RBAC)
    expect(capturedUrl).toContain('/alerts/channels')
  })
})

describe('listIncidents — exact URL path', () => {
  afterEach(() => vi.unstubAllGlobals())

  /** The GET must hit exactly /incidents. */
  it('requests the exact /incidents path', async () => {
    let capturedUrl = ''
    vi.stubGlobal(
      'fetch',
      vi.fn((url: string) => {
        capturedUrl = url
        return Promise.resolve(jsonResponse([VALID_INCIDENT]))
      }),
    )
    await listIncidents(RBAC)
    expect(capturedUrl).toContain('/incidents')
  })
})

describe('listChannels — method must be GET', () => {
  afterEach(() => vi.unstubAllGlobals())

  /** listChannels must use the GET verb; an empty-string method would bypass server routing. */
  it('sends GET when listing channels', async () => {
    let capturedMethod: string | undefined
    vi.stubGlobal(
      'fetch',
      vi.fn((_url: string, init?: RequestInit) => {
        capturedMethod = init?.method
        return Promise.resolve(jsonResponse([VALID_CHANNEL]))
      }),
    )
    await listChannels(RBAC)
    expect(capturedMethod).toBe('GET')
  })
})

describe('createChannel — URL must contain /alerts/channels', () => {
  afterEach(() => vi.unstubAllGlobals())

  /** createChannel must POST to /alerts/channels; an empty path would target the base URL only. */
  it('POSTs to the /alerts/channels path', async () => {
    let capturedUrl = ''
    vi.stubGlobal(
      'fetch',
      vi.fn((url: string) => {
        capturedUrl = url
        return Promise.resolve(jsonResponse({ ok: true, channel: VALID_CHANNEL }))
      }),
    )
    await createChannel(VALID_CHANNEL, RBAC)
    expect(capturedUrl).toContain('/alerts/channels')
  })
})

describe('listIncidents — method must be GET', () => {
  afterEach(() => vi.unstubAllGlobals())

  /** listIncidents must use the GET verb; an empty-string method would bypass server routing. */
  it('sends GET when listing incidents', async () => {
    let capturedMethod: string | undefined
    vi.stubGlobal(
      'fetch',
      vi.fn((_url: string, init?: RequestInit) => {
        capturedMethod = init?.method
        return Promise.resolve(jsonResponse([VALID_INCIDENT]))
      }),
    )
    await listIncidents(RBAC)
    expect(capturedMethod).toBe('GET')
  })
})

describe('request — GET fetch init must not have a body key', () => {
  afterEach(() => vi.unstubAllGlobals())

  /**
   * For a GET request the fetch init must not carry a `body` key at all — not
   * even `body: undefined`. An always-true condition would spread `{ body: undefined }`
   * making the key present; `not.toHaveProperty` detects that, where `toBeUndefined`
   * would not.
   */
  it('omits the body key entirely from the fetch init for a GET request', async () => {
    let capturedInit: RequestInit | undefined
    vi.stubGlobal(
      'fetch',
      vi.fn((_url: string, init?: RequestInit) => {
        capturedInit = init
        return Promise.resolve(jsonResponse([VALID_RULE]))
      }),
    )
    await listRules(RBAC)
    expect(capturedInit).not.toHaveProperty('body')
  })
})

describe('alerts-api — module-level re-import (kill API, schema enum string mutations)', () => {
  /**
   * Re-importing the module inside the test body forces the `API` constant and
   * all Zod schema initializations to be evaluated with Stryker's active mutation.
   *
   * - `API = 'http://localhost:3001'` → '' makes every URL relative (no host).
   * - alertSeveritySchema `'critical'`/`'warning'` → '' breaks severity validation.
   * - channelTypeSchema `'slack'`/`'webhook'`/`'email-mock'` → '' breaks type validation.
   * - incidentStatusSchema `'triggered'`/`'acknowledged'`/`'snoozed'`/`'resolved'` → ''
   *   breaks status parsing.
   */
  afterEach(() => {
    vi.resetModules()
    vi.unstubAllGlobals()
  })

  it('re-imports and verifies the API base URL starts with http://localhost:3001', async () => {
    vi.resetModules()
    const { listRules: freshListRules } = await import('./alerts-api')
    let capturedUrl = ''
    vi.stubGlobal(
      'fetch',
      vi.fn((url: string) => {
        capturedUrl = url
        return Promise.resolve(jsonResponse([VALID_RULE]))
      }),
    )
    await freshListRules(RBAC)
    expect(capturedUrl.startsWith('http://localhost:3001')).toBe(true)
  })

  it('re-imports and verifies alertSeveritySchema accepts critical and warning', async () => {
    vi.resetModules()
    const { listRules: freshListRules } = await import('./alerts-api')
    vi.stubGlobal(
      'fetch',
      vi.fn(() => Promise.resolve(jsonResponse([{ ...VALID_RULE, severity: 'critical' }]))),
    )
    const rules = await freshListRules(RBAC)
    expect(rules[0]?.severity).toBe('critical')

    vi.resetModules()
    const { listRules: freshListRules2 } = await import('./alerts-api')
    vi.stubGlobal(
      'fetch',
      vi.fn(() => Promise.resolve(jsonResponse([{ ...VALID_RULE, severity: 'warning' }]))),
    )
    const rules2 = await freshListRules2(RBAC)
    expect(rules2[0]?.severity).toBe('warning')
  })

  it('re-imports and verifies channelTypeSchema accepts slack, webhook, and email-mock', async () => {
    for (const type of ['slack', 'webhook', 'email-mock'] as const) {
      vi.resetModules()
      const { listChannels: freshListChannels } = await import('./alerts-api')
      vi.stubGlobal(
        'fetch',
        vi.fn(() => Promise.resolve(jsonResponse([{ ...VALID_CHANNEL, type }]))),
      )
      const channels = await freshListChannels(RBAC)
      expect(channels[0]?.type, `type ${type} failed validation`).toBe(type)
    }
  })

  it('re-imports and verifies incidentStatusSchema accepts all four statuses', async () => {
    for (const status of ['triggered', 'acknowledged', 'snoozed', 'resolved'] as const) {
      vi.resetModules()
      const { listIncidents: freshListIncidents } = await import('./alerts-api')
      vi.stubGlobal(
        'fetch',
        vi.fn(() => Promise.resolve(jsonResponse([{ ...VALID_INCIDENT, status }]))),
      )
      const incidents = await freshListIncidents(RBAC)
      expect(incidents[0]?.status, `status ${status} failed validation`).toBe(status)
    }
  })
})
