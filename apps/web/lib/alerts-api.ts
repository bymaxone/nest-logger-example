/**
 * @fileoverview Typed client for the Alerts & Incidents API — alert rules,
 * notification channels, and the incident lifecycle.
 *
 * Every request carries the global RBAC headers (`x-role` / `x-tenant-id`) so the
 * server enforces who may list, mutate, and transition. Shapes mirror the
 * `apps/api` controllers exactly (rules persist `expr + threshold + forDuration`;
 * channels are `{ id, type, name, endpoint, severities }`; incidents transition
 * via `acknowledge | snooze | resolve`). Sensitive channel endpoints are never
 * rendered in full — see {@link maskEndpoint}.
 *
 * @module lib/alerts-api
 */

import { z, type ZodType } from 'zod'

import type { RbacContext } from './types'
import type { AlertSeverity } from './ruler-yaml'
import { rbacHeaders } from './rbac-headers'

/** API base URL — the alerts/incidents API. Defaults to the local `apps/api` port. */
const API = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001'

/** The active RBAC identity sent with every alerts request. */
type Rbac = RbacContext

/**
 * Error thrown for any non-2xx alerts response, carrying the HTTP status so
 * callers can branch (e.g. surface a 403 RBAC denial).
 */
export class AlertsApiError extends Error {
  /**
   * @param status - HTTP status of the failed response.
   * @param message - Human-readable message.
   */
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message)
    this.name = 'AlertsApiError'
  }
}

/**
 * Issue a request, map non-2xx to {@link AlertsApiError}, and validate the JSON
 * body against `schema` so a malformed payload is caught at the boundary instead
 * of crashing a downstream component.
 *
 * @typeParam T - The expected JSON payload type.
 * @param method - HTTP method.
 * @param path - Path relative to the API base (e.g. `/alerts/rules`).
 * @param schema - Zod schema validating the response shape.
 * @param rbac - The active role + tenant, sent as RBAC headers.
 * @param body - Optional JSON request body.
 * @returns The parsed, shape-validated JSON payload.
 * @throws {AlertsApiError} When the status is not 2xx, or the body fails validation.
 */
async function request<T>(
  method: string,
  path: string,
  schema: ZodType<T>,
  rbac: Rbac,
  body?: unknown,
): Promise<T> {
  const res = await fetch(`${API}${path}`, {
    method,
    headers: {
      Accept: 'application/json',
      ...(body !== undefined ? { 'content-type': 'application/json' } : {}),
      ...rbacHeaders(rbac),
    },
    ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
  })
  if (!res.ok) throw new AlertsApiError(res.status, `${res.status} ${res.statusText}`)
  const parsed = schema.safeParse(await res.json())
  if (!parsed.success) throw new AlertsApiError(res.status, `unexpected response shape for ${path}`)
  return parsed.data
}

// ── Alert rules ──────────────────────────────────────────────────────────────

/** A persisted alert rule (`AlertRule` row). */
export interface AlertRule {
  id: string
  name: string
  expr: string
  threshold: number
  forDuration: string
  severity: AlertSeverity
  isEnabled: boolean
  channels: string[]
  createdAt: string
}

/** The create/update payload — the columns the API accepts. */
export interface AlertRuleInput {
  name: string
  expr: string
  threshold: number
  forDuration: string
  severity: AlertSeverity
  channels: string[]
}

/** Runtime schema for an {@link AlertRule}, validated at the network boundary. */
const alertSeveritySchema: ZodType<AlertSeverity> = z.enum(['critical', 'warning'])

/** Runtime schema for an {@link AlertRule}, validated at the network boundary. */
const alertRuleSchema: ZodType<AlertRule> = z.object({
  id: z.string(),
  name: z.string(),
  expr: z.string(),
  threshold: z.number(),
  forDuration: z.string(),
  severity: alertSeveritySchema,
  isEnabled: z.boolean(),
  channels: z.array(z.string()),
  createdAt: z.string(),
})

/** Runtime schema for an array of {@link AlertRule}. */
const alertRuleArraySchema: ZodType<AlertRule[]> = z.array(alertRuleSchema)

/**
 * List all alert rules (`GET /alerts/rules`).
 *
 * @param rbac - The active role + tenant, sent as RBAC headers.
 * @returns Every persisted alert rule visible to the caller.
 * @throws {AlertsApiError} When the response is non-2xx or fails shape validation.
 */
export const listRules = (rbac: Rbac): Promise<AlertRule[]> =>
  request('GET', '/alerts/rules', alertRuleArraySchema, rbac)

/**
 * Create a rule (`POST /alerts/rules`).
 *
 * @param input - The rule columns the API accepts.
 * @param rbac - The active role + tenant, sent as RBAC headers.
 * @returns The newly persisted rule.
 * @throws {AlertsApiError} When the response is non-2xx or fails shape validation.
 */
export const createRule = (input: AlertRuleInput, rbac: Rbac): Promise<AlertRule> =>
  request('POST', '/alerts/rules', alertRuleSchema, rbac, input)

/**
 * Patch an existing rule (`PATCH /alerts/rules/:id`).
 *
 * @param id - Id of the rule to patch.
 * @param input - The partial columns to update, plus an optional enabled toggle.
 * @param rbac - The active role + tenant, sent as RBAC headers.
 * @returns The updated rule.
 * @throws {AlertsApiError} When the response is non-2xx or fails shape validation.
 */
export const updateRule = (
  id: string,
  input: Partial<AlertRuleInput> & { isEnabled?: boolean },
  rbac: Rbac,
): Promise<AlertRule> =>
  request('PATCH', `/alerts/rules/${encodeURIComponent(id)}`, alertRuleSchema, rbac, input)

// ── Notification channels ────────────────────────────────────────────────────

/** Channel receiver kind. */
export type ChannelType = 'slack' | 'webhook' | 'email-mock'

/** A notification channel (`NotificationChannel`). */
export interface NotificationChannel {
  id: string
  type: ChannelType
  name: string
  /** Slack/webhook URL or email-mock address — render masked, never in full. */
  endpoint: string
  severities: Array<'critical' | 'warning'>
}

/** The create payload — a channel without its server-generated `id`. */
export type NotificationChannelInput = Omit<NotificationChannel, 'id'>

/** Runtime schema for a {@link ChannelType}. */
const channelTypeSchema: ZodType<ChannelType> = z.enum(['slack', 'webhook', 'email-mock'])

/** Runtime schema for a {@link NotificationChannel}. */
const notificationChannelSchema: ZodType<NotificationChannel> = z.object({
  id: z.string(),
  type: channelTypeSchema,
  name: z.string(),
  endpoint: z.string(),
  severities: z.array(z.enum(['critical', 'warning'])),
})

/** Runtime schema for an array of {@link NotificationChannel}. */
const notificationChannelArraySchema: ZodType<NotificationChannel[]> =
  z.array(notificationChannelSchema)

/** Runtime schema for the {@link createChannel} response envelope. */
const createChannelResultSchema: ZodType<{ ok: boolean; channel: NotificationChannel }> = z.object({
  ok: z.boolean(),
  channel: notificationChannelSchema,
})

/** Runtime schema for the {@link testChannel} response envelope. */
const okResultSchema: ZodType<{ ok: boolean }> = z.object({ ok: z.boolean() })

/**
 * List registered channels (`GET /alerts/channels`, operator+ only).
 *
 * @param rbac - The active role + tenant, sent as RBAC headers.
 * @returns Every channel visible to the caller.
 * @throws {AlertsApiError} When the response is non-2xx or fails shape validation.
 */
export const listChannels = (rbac: Rbac): Promise<NotificationChannel[]> =>
  request('GET', '/alerts/channels', notificationChannelArraySchema, rbac)

/**
 * Register a channel (`POST /alerts/channels`, admin only).
 *
 * @param channel - The channel to register (the server assigns its `id`).
 * @param rbac - The active role + tenant, sent as RBAC headers.
 * @returns An envelope with the persisted channel.
 * @throws {AlertsApiError} When the response is non-2xx or fails shape validation.
 */
export const createChannel = (
  channel: NotificationChannelInput,
  rbac: Rbac,
): Promise<{ ok: boolean; channel: NotificationChannel }> =>
  request('POST', '/alerts/channels', createChannelResultSchema, rbac, channel)

/**
 * Test-fire a channel (`POST /alerts/channels/:id/test`).
 *
 * @param id - Id of the channel to test.
 * @param rbac - The active role + tenant, sent as RBAC headers.
 * @returns An envelope reporting whether the test delivery dispatched.
 * @throws {AlertsApiError} When the response is non-2xx or fails shape validation.
 */
export const testChannel = (id: string, rbac: Rbac): Promise<{ ok: boolean }> =>
  request('POST', `/alerts/channels/${encodeURIComponent(id)}/test`, okResultSchema, rbac, {})

/** Number of trailing characters of a token revealed by {@link maskEndpoint}. */
const MASK_REVEAL = 4

/**
 * Mask the secret-bearing portion of a channel endpoint so tokens never render
 * in full — reinforcing the redaction story.
 *
 * For URLs, the scheme + host are kept and the path/token is collapsed to
 * `/****<last 4>`; for plain addresses (email-mock) the local-part is masked.
 *
 * @param endpoint - The raw channel endpoint.
 * @returns A masked, safe-to-render representation.
 */
export function maskEndpoint(endpoint: string): string {
  try {
    const url = new URL(endpoint)
    const path = url.pathname + url.search
    // Reveal only a short tail of the PATH (never the host) so a short path can
    // never bleed host characters into the "revealed" segment.
    if (path.length <= MASK_REVEAL) return `${url.protocol}//${url.host}/****`
    return `${url.protocol}//${url.host}/****${path.slice(-MASK_REVEAL)}`
  } catch {
    // Not a URL (e.g. an email-mock address): keep only a short trailing hint.
    if (endpoint.length <= MASK_REVEAL) return '****'
    return `****${endpoint.slice(-MASK_REVEAL)}`
  }
}

// ── Incidents ────────────────────────────────────────────────────────────────

/** Incident lifecycle state. */
export type IncidentStatus = 'triggered' | 'acknowledged' | 'snoozed' | 'resolved'

/** One immutable timeline transition. */
export interface IncidentEvent {
  actor: string
  action: string
  at: string
}

/**
 * An incident (`Incident` row). The client builds its Explorer deep-link from
 * `logKey` + `openedAt` via {@link explorerHref}, so the server's `deepLink`
 * field is intentionally not modelled (one source of truth for the link).
 */
export interface Incident {
  id: string
  ruleId: string
  status: IncidentStatus
  logKey: string | null
  openedAt: string
  resolvedAt: string | null
  timeline: IncidentEvent[]
  /** Optionally hydrated owning rule; may be absent or `undefined` from the API. */
  rule?: AlertRule | undefined
}

/** Snooze durations offered by the lifecycle menu. */
export type SnoozeDuration = '1h' | '4h' | '8h' | '24h'

/** Runtime schema for an {@link IncidentEvent}. */
const incidentEventSchema: ZodType<IncidentEvent> = z.object({
  actor: z.string(),
  action: z.string(),
  at: z.string(),
})

/** Runtime schema for an {@link IncidentStatus}. */
const incidentStatusSchema: ZodType<IncidentStatus> = z.enum([
  'triggered',
  'acknowledged',
  'snoozed',
  'resolved',
])

/**
 * Runtime schema for an {@link Incident}. `timeline` is a required array so a
 * lifecycle view can always iterate it without a guard.
 */
const incidentSchema: ZodType<Incident> = z.object({
  id: z.string(),
  ruleId: z.string(),
  status: incidentStatusSchema,
  logKey: z.string().nullable(),
  openedAt: z.string(),
  resolvedAt: z.string().nullable(),
  timeline: z.array(incidentEventSchema),
  rule: alertRuleSchema.optional(),
})

/** Runtime schema for an array of {@link Incident}. */
const incidentArraySchema: ZodType<Incident[]> = z.array(incidentSchema)

/**
 * List incidents (`GET /incidents`; admin sees all, non-admin receives `[]`).
 *
 * @param rbac - The active role + tenant, sent as RBAC headers.
 * @returns Every incident visible to the caller.
 * @throws {AlertsApiError} When the response is non-2xx or fails shape validation.
 */
export const listIncidents = (rbac: Rbac): Promise<Incident[]> =>
  request('GET', '/incidents', incidentArraySchema, rbac)

/**
 * Transition an incident (`PATCH /incidents/:id`).
 *
 * @param id - Id of the incident to transition.
 * @param action - The lifecycle action to apply.
 * @param rbac - The active role + tenant, sent as RBAC headers.
 * @param snoozeDuration - How long to snooze; only sent for the `snooze` action.
 * @returns The incident in its new state.
 * @throws {AlertsApiError} When the response is non-2xx or fails shape validation.
 */
export const transitionIncident = (
  id: string,
  action: 'acknowledge' | 'snooze' | 'resolve',
  rbac: Rbac,
  snoozeDuration?: SnoozeDuration,
): Promise<Incident> =>
  request('PATCH', `/incidents/${encodeURIComponent(id)}`, incidentSchema, rbac, {
    action,
    ...(snoozeDuration !== undefined ? { snoozeDuration } : {}),
  })
