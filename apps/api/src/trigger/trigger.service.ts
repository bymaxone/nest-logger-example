/**
 * Trigger service — Playground hooks that fire every log type on demand.
 *
 * Demonstrates:
 *   - Dynamic level dispatch via `info` / `warnStructured` / `errorStructured`.
 *   - `TRIGGER_FAULT_REQUESTED` hook for the Loki-destination fault scenario — this
 *     is the labelled trigger; the real destination fault is wired with the Loki sink.
 *   - Bounded burst loop for live-tail load demos (capped at ≤500 entries).
 *
 * @module
 */
import { Injectable } from '@nestjs/common'
import { InjectLogger, PinoLoggerService } from '@bymax-one/nest-logger'

import type { TriggerLevelDto } from './dto/trigger.dto.js'

/** Exposes trigger endpoints used by the `apps/web` Playground Trigger Center. */
@Injectable()
export class TriggerService {
  constructor(@InjectLogger(TriggerService.name) private readonly logger: PinoLoggerService) {}

  /**
   * Fire `dto.count` log lines at the requested level.
   *
   * @param dto - Validated trigger request (`level` ∈ {info, warn, error}; `count` ∈ [1,100]).
   * @returns Number of lines fired.
   */
  fireLevel(dto: TriggerLevelDto): { fired: number } {
    for (let i = 0; i < dto.count; i += 1) {
      if (dto.level === 'info') {
        this.logger.info('TRIGGER_LEVEL_FIRED', 'Triggered info log', undefined, { i })
      } else if (dto.level === 'warn') {
        this.logger.warnStructured('TRIGGER_LEVEL_FIRED', 'Triggered warn log', undefined, { i })
      } else {
        this.logger.errorStructured(
          'TRIGGER_LEVEL_FIRED',
          new Error('Triggered error log'),
          undefined,
          { i },
        )
      }
    }
    return { fired: dto.count }
  }

  /**
   * Emit a `TRIGGER_FAULT_REQUESTED` warning — a Playground hook for the Loki-destination
   * fault demo. The real `LOGGER_DESTINATION_WRITE_FAILED` proof is wired with the Loki sink.
   *
   * @returns Constant requested response.
   */
  requestFault(): { requested: true } {
    this.logger.warnStructured(
      'TRIGGER_FAULT_REQUESTED',
      'Destination fault requested',
      undefined,
      { destination: 'loki' },
    )
    return { requested: true }
  }

  /**
   * Emit `count` `TRIGGER_BURST_TICK` info lines in a tight loop.
   *
   * @param count - Number of lines to emit (caller-validated ≤500).
   * @returns Number of lines fired.
   */
  burst(count: number): { fired: number } {
    for (let i = 0; i < count; i += 1) {
      this.logger.info('TRIGGER_BURST_TICK', 'Burst tick', undefined, { i })
    }
    return { fired: count }
  }
}
