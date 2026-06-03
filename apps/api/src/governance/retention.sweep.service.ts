/**
 * Retention sweep — daily cron that deletes old `application_logs` rows.
 *
 * Layer: governance. Deletes rows older than `RETENTION_DAYS` (default 30).
 * Exposes `getStatus()` for the maintenance panel and `setRetentionDays()` for the
 * Admin `PATCH /maintenance/retention` endpoint.
 *
 * 🎓 Scoped demo of **tiered retention**. In production you would add warm/cold
 * object-storage tiers (S3/Glacier) and per-tenant retention overrides. The Loki
 * compactor handles Loki retention separately.
 *
 * @module
 */
import { Injectable, Logger } from '@nestjs/common'
import { Cron, CronExpression } from '@nestjs/schedule'

import { PrismaService } from '../prisma/prisma.service.js'

/** Shape returned by `GET /maintenance/retention`. */
export interface RetentionStatus {
  retentionDays: number
  nextSweep: string
  pendingRows: number
}

/**
 * Runs the nightly retention sweep and exposes configuration state.
 */
@Injectable()
export class RetentionSweepService {
  private readonly logger = new Logger(RetentionSweepService.name)
  private retentionDays: number
  private lastSweepAt: Date | null = null

  constructor(private readonly prisma: PrismaService) {
    this.retentionDays = Number(process.env['RETENTION_DAYS'] ?? 30)
  }

  /**
   * Daily retention sweep at midnight UTC.
   *
   * Deletes all `ApplicationLog` rows whose `time` is older than `retentionDays`
   * days. Fail-soft: an error is logged but not re-thrown.
   *
   * @returns A promise that resolves once the sweep completes (or fails softly).
   */
  @Cron(CronExpression.EVERY_DAY_AT_MIDNIGHT)
  async sweep(): Promise<void> {
    const cutoff = new Date(Date.now() - this.retentionDays * 24 * 60 * 60 * 1000)
    try {
      const { count } = await this.prisma.applicationLog.deleteMany({
        where: { time: { lt: cutoff } },
      })
      this.lastSweepAt = new Date()
      this.logger.log(`Retention sweep: deleted ${count} rows older than ${cutoff.toISOString()}`)
    } catch (err) {
      this.logger.error('Retention sweep failed', err instanceof Error ? err.message : String(err))
    }
  }

  /**
   * Return current retention configuration and sweep status.
   *
   * @returns Status object for the maintenance panel.
   */
  async getStatus(): Promise<RetentionStatus> {
    const cutoff = new Date(Date.now() - this.retentionDays * 24 * 60 * 60 * 1000)
    const pendingRows = await this.prisma.applicationLog.count({
      where: { time: { lt: cutoff } },
    })
    const nextSweep = new Date()
    nextSweep.setUTCHours(24, 0, 0, 0) // next midnight UTC
    return {
      retentionDays: this.retentionDays,
      nextSweep: nextSweep.toISOString(),
      pendingRows,
    }
  }

  /**
   * Update the retention window (Admin only).
   *
   * @param days - New retention window in days (1–365).
   * @returns The updated retention day count.
   */
  setRetentionDays(days: number): number {
    this.retentionDays = days
    return this.retentionDays
  }
}
