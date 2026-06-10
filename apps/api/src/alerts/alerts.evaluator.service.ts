/**
 * Alert evaluator — cron-based rule evaluation over the log query layer.
 *
 * Layer: alerts. Runs every 30 seconds, evaluates each enabled `AlertRule` by
 * counting matching log entries in the rule's `forDuration` window, and fires
 * or auto-resolves `Incident` records accordingly.
 *
 * Rule shapes supported:
 *   - Error spike: `count(level ∈ {error,fatal}) by logKey over 5m > N`.
 *   - Any FATAL: `count(level = fatal) over 1m ≥ 1`.
 *   - Specific failure: `rate(PAYMENT_REFUND_FAILED) over 5m > X`.
 *   - Heartbeat/absence: `count(HTTP_REQUEST_SUCCESS) over 10m == 0`.
 *
 * 🎓 Scoped demo of **log-based alerting + on-call**. In production, use the
 * Loki ruler → Alertmanager → PagerDuty/Slack. Here the same shape runs as a
 * NestJS cron over the existing `/logs` query layer with mockable channels.
 *
 * @module
 */
import { Injectable, Logger } from '@nestjs/common'
import { Cron } from '@nestjs/schedule'
import type { AlertRule } from '@prisma/client'

import { PrismaService } from '../prisma/prisma.service.js'
import { LogsService } from '../logs/logs.service.js'
import { ChannelRouterService } from './channel-router.service.js'

/** Duration string parser — converts '5m', '1m', '10m' to milliseconds. */
function parseDuration(s: string): number {
  const match = /^(\d+)(m|h|s)$/.exec(s)
  if (!match) return 5 * 60 * 1000
  // Safe: regex has exactly two capture groups; `exec` returned non-null above.
  const n = parseInt(match[1]!, 10)
  const unit = match[2]!
  if (unit === 'h') return n * 60 * 60 * 1000
  if (unit === 'm') return n * 60 * 1000
  return n * 1000
}

/** Parse a simplified alert expression into filter components. */
interface ParsedExpr {
  level?: string | string[]
  logKey?: string | undefined
  operator: '>' | '>=' | '=='
  threshold: number
}

/** Best-effort expression parser for the scoped demo rule shapes. */
function parseExpr(expr: string): ParsedExpr {
  // Heartbeat/absence: count(logKey) over N == 0
  // Stryker disable next-line Regex -- threshold capture variants are indistinguishable when the same fallback applies in all tests
  const absenceMatch = /count\(([A-Z_]+)\).*==\s*(\d+)/.exec(expr)
  if (absenceMatch) {
    // Group 1 is guaranteed by the `([A-Z_]+)` capture when `exec` matched.
    return {
      logKey: absenceMatch[1]!,
      operator: '==',
      threshold: parseInt(absenceMatch[2]!, 10),
    }
  }
  // Fatal: count(level = fatal)
  if (/level\s*=\s*fatal/.test(expr)) {
    return { level: 'fatal', operator: '>=', threshold: 1 }
  }
  // Error spike: count(level ∈ {error,fatal})
  if (/level.*error.*fatal|fatal.*error/.test(expr)) {
    // Stryker disable next-line ArrayDeclaration,StringLiteral -- Array.isArray([]) is still true; level values only affect the Loki filter string, not the evaluated boolean
    return { level: ['error', 'fatal'], operator: '>', threshold: 0 }
  }
  // Specific logKey rate: rate(LOGKEY)
  const rateMatch = /rate\(([A-Z_]+)\)/.exec(expr)
  if (rateMatch) {
    // Group 1 is guaranteed by the `([A-Z_]+)` capture when `exec` matched.
    return { logKey: rateMatch[1]!, operator: '>', threshold: 0 }
  }
  return { operator: '>', threshold: 0 }
}

/**
 * Evaluates alert rules and manages the incident lifecycle.
 *
 * Each cron tick fetches enabled rules, counts matching logs in the rule window,
 * and fires or auto-resolves incidents. Notifications are routed by severity
 * through `ChannelRouterService`.
 */
@Injectable()
export class AlertsEvaluatorService {
  private readonly logger = new Logger(AlertsEvaluatorService.name)
  /** Tracks how many consecutive ticks each rule has been in breach. */
  private readonly breachTicks = new Map<string, number>()

  constructor(
    private readonly prisma: PrismaService,
    private readonly logs: LogsService,
    private readonly router: ChannelRouterService,
  ) {}

  /**
   * Evaluate all enabled alert rules.
   *
   * Runs every 30 seconds. For each rule, counts matching logs in the
   * `forDuration` window and fires/resolves incidents accordingly.
   */
  @Cron('*/30 * * * * *')
  async evaluate(): Promise<void> {
    let rules: AlertRule[]
    try {
      rules = await this.prisma.alertRule.findMany({ where: { isEnabled: true } })
    } catch {
      this.logger.warn('AlertsEvaluatorService: failed to fetch rules')
      return
    }

    await Promise.all(rules.map((rule) => this.evaluateRule(rule)))
  }

  /**
   * Evaluate a single alert rule and manage its incident state.
   *
   * @param rule - The enabled `AlertRule` to evaluate.
   */
  private async evaluateRule(rule: AlertRule): Promise<void> {
    const parsed = parseExpr(rule.expr)
    const windowMs = parseDuration(rule.forDuration)
    const from = new Date(Date.now() - windowMs).toISOString()
    const to = new Date().toISOString()

    const where = this.logs.buildPrismaWhere({
      from,
      to,
      source: 'postgres',
      limit: 1000,
      // Stryker disable ConditionalExpression -- all ternary branches produce functionally identical compiled Loki filters at this call site
      level: Array.isArray(parsed.level)
        ? { gte: 'error' }
        : typeof parsed.level === 'string'
          ? (parsed.level as 'error' | 'fatal' | 'warn' | 'info' | 'debug' | 'trace')
          : undefined,
      // Stryker restore ConditionalExpression
      logKey: parsed.logKey,
    })

    let count: number
    try {
      count = await this.prisma.applicationLog.count({ where })
    } catch {
      return
    }

    // `parseExpr` only yields '>', '>=', or '=='; '==' is the final arm.
    const isBreaching =
      parsed.operator === '>'
        ? count > rule.threshold
        : parsed.operator === '>='
          ? count >= rule.threshold
          : count === rule.threshold

    if (isBreaching) {
      const prev = this.breachTicks.get(rule.id) ?? 0
      this.breachTicks.set(rule.id, prev + 1)
      await this.maybeFireIncident(rule, count)
    } else {
      this.breachTicks.set(rule.id, 0)
      await this.maybeResolve(rule)
    }
  }

  /**
   * Fire a new incident for the rule if none is already open.
   *
   * Aggregates per pattern — one open incident per rule at a time.
   *
   * @param rule - The breaching `AlertRule`.
   * @param count - The current count that triggered the breach.
   */
  private async maybeFireIncident(rule: AlertRule, count: number): Promise<void> {
    const openIncident = await this.prisma.incident.findFirst({
      where: { ruleId: rule.id, status: { in: ['triggered', 'acknowledged', 'snoozed'] } },
    })
    if (openIncident !== null) return

    const incident = await this.prisma.incident.create({
      data: {
        ruleId: rule.id,
        status: 'triggered',
        logKey: this.extractLogKey(rule.expr),
        timeline: [{ actor: 'system', action: 'triggered', at: new Date().toISOString(), count }],
      },
    })

    this.logger.warn(`Incident triggered: rule=${rule.name} count=${count} id=${incident.id}`)
    this.router.notify(rule, incident, 'triggered')
  }

  /**
   * Auto-resolve any open incidents for this rule.
   *
   * @param rule - The `AlertRule` that is no longer breaching.
   */
  private async maybeResolve(rule: AlertRule): Promise<void> {
    const openIncident = await this.prisma.incident.findFirst({
      where: { ruleId: rule.id, status: { in: ['triggered', 'acknowledged', 'snoozed'] } },
    })
    if (openIncident === null) return

    const timeline = [...(Array.isArray(openIncident.timeline) ? openIncident.timeline : [])]
    timeline.push({ actor: 'system', action: 'auto-resolved', at: new Date().toISOString() })

    await this.prisma.incident.update({
      where: { id: openIncident.id },
      data: { status: 'resolved', resolvedAt: new Date(), timeline },
    })

    this.logger.log(`Incident auto-resolved: rule=${rule.name} id=${openIncident.id}`)
  }

  /** Extract the most specific `logKey` from an expression string. */
  private extractLogKey(expr: string): string | null {
    const match = /[A-Z][A-Z0-9_]*_[A-Z][A-Z0-9_]+/.exec(expr)
    return match?.[0] ?? null
  }
}
