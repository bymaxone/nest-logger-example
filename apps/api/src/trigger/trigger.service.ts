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
   * Dispatches across the logger's TWO public surfaces so the Playground exercises both:
   *   - structured key-first (`info` / `warnStructured` / `errorStructured`) — carry a
   *     `TRIGGER_LEVEL_FIRED` logKey and the running index;
   *   - NestJS-style variadic (`fatal` / `verbose` / `debug`) — the ONLY API for these
   *     levels (`fatal` is level 60, the library's required-not-optional differentiator;
   *     `verbose` maps to Pino `trace`). They have no key-first variant.
   *
   * @param dto - Validated trigger request (`level` ∈ {info,warn,error,fatal,verbose,debug};
   *   `count` ∈ [1,100]).
   * @returns Number of lines fired.
   */
  fireLevel(dto: TriggerLevelDto): { fired: number } {
    for (let i = 0; i < dto.count; i += 1) {
      switch (dto.level) {
        case 'info':
          this.logger.info('TRIGGER_LEVEL_FIRED', 'Triggered info log', undefined, { i })
          break
        case 'warn':
          this.logger.warnStructured('TRIGGER_LEVEL_FIRED', 'Triggered warn log', undefined, { i })
          break
        case 'error':
          this.logger.errorStructured(
            'TRIGGER_LEVEL_FIRED',
            new Error('Triggered error log'),
            undefined,
            { i },
          )
          break
        case 'fatal':
          this.logger.fatal('Triggered fatal log')
          break
        case 'verbose':
          this.logger.verbose('Triggered verbose log')
          break
        default:
          this.logger.debug('Triggered debug log')
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
