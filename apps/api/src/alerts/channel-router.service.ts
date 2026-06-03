/**
 * Notification channel router — severity-based delivery.
 *
 * Layer: alerts. Routes alert notifications to the registered channels based on
 * severity: `critical` → webhook + Slack; `warning` → Slack only. Delivery is
 * mocked/logged so the demo runs offline without real network calls.
 *
 * Channels can be test-fired via `POST /alerts/channels/:id/test`.
 *
 * 🎓 Scoped demo of **notification routing**. In production, use Alertmanager
 * with real Slack/PagerDuty integrations.
 *
 * @module
 */
import { Injectable, Logger } from '@nestjs/common'
import type { AlertRule, Incident } from '@prisma/client'

/** Supported channel types. */
export type ChannelType = 'slack' | 'webhook' | 'email-mock'

/** A registered notification channel. */
export interface NotificationChannel {
  id: string
  type: ChannelType
  name: string
  /** Webhook URL or Slack webhook URL (mocked in tests). */
  endpoint: string
  /** Severity levels this channel handles. */
  severities: string[]
}

/** In-memory channel registry (replaced by a DB table in a real system). */
const DEFAULT_CHANNELS: NotificationChannel[] = [
  {
    id: 'slack-critical',
    type: 'slack',
    name: 'Slack #alerts-critical',
    endpoint: 'https://hooks.slack.example/mock/critical',
    severities: ['critical', 'warning'],
  },
  {
    id: 'webhook-critical',
    type: 'webhook',
    name: 'Webhook (critical)',
    endpoint: 'https://ops.example/webhook/critical',
    severities: ['critical'],
  },
  {
    id: 'email-mock',
    type: 'email-mock',
    name: 'Email mock',
    endpoint: 'ops@example.com',
    severities: ['critical'],
  },
]

/**
 * Routes alert notifications to registered channels by severity.
 *
 * All deliveries are logged to stderr/stdout — no real HTTP calls are made in the
 * demo so the application runs offline safely.
 */
@Injectable()
export class ChannelRouterService {
  private readonly logger = new Logger(ChannelRouterService.name)
  private readonly channels: NotificationChannel[] = [...DEFAULT_CHANNELS]

  /**
   * Notify channels appropriate for the rule's severity.
   *
   * @param rule - The `AlertRule` that fired.
   * @param incident - The newly created or resolved `Incident`.
   * @param event - The lifecycle event (`triggered` | `resolved`).
   */
  notify(rule: AlertRule, incident: Incident, event: string): void {
    const eligible = this.channels.filter((ch) => ch.severities.includes(rule.severity))
    for (const channel of eligible) {
      this.deliver(channel, rule, incident, event)
    }
  }

  /**
   * Test-fire a channel by its id.
   *
   * @param channelId - The channel id to test.
   * @returns Whether the channel was found and the test delivery was dispatched.
   */
  testFire(channelId: string): boolean {
    const ch = this.channels.find((c) => c.id === channelId)
    if (ch === undefined) return false
    this.logger.log(`[TEST-FIRE] channel=${ch.name} type=${ch.type} endpoint=${ch.endpoint}`)
    return true
  }

  /**
   * Return all registered channels.
   *
   * @returns The channel list.
   */
  listChannels(): NotificationChannel[] {
    return this.channels
  }

  /**
   * Register a new notification channel.
   *
   * @param channel - The channel to add.
   */
  addChannel(channel: NotificationChannel): void {
    this.channels.push(channel)
  }

  /**
   * Mock delivery — logs the notification payload without making a real HTTP call.
   *
   * @param channel - The target channel.
   * @param rule - The firing rule.
   * @param incident - The incident.
   * @param event - The lifecycle event.
   */
  private deliver(
    channel: NotificationChannel,
    rule: AlertRule,
    incident: Incident,
    event: string,
  ): void {
    this.logger.log(
      `[NOTIFY] channel=${channel.name} type=${channel.type} rule=${rule.name} ` +
        `incident=${incident.id} event=${event} severity=${rule.severity}`,
    )
  }
}
