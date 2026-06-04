/**
 * @fileoverview Unit tests for the alerts client helpers — endpoint masking and
 * the incident transition request body.
 *
 * @module lib/alerts-api.test
 */
import { afterEach, describe, expect, it, vi } from 'vitest'

import { AlertsApiError, type Incident, maskEndpoint, transitionIncident } from './alerts-api'

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
})
