/**
 * Admin service — runtime log-level change via the raw-Pino escape hatch.
 *
 * Demonstrates:
 *   - `getRawLogger().level = newLevel` for live level changes without a restart.
 *   - Recording the old → new transition as a structured `ADMIN_LOG_LEVEL_CHANGED` log.
 *
 * This is the ONLY sanctioned use of `getRawLogger()` in the example app. Application
 * code should always use the structured API (`info`, `warnStructured`, `errorStructured`);
 * the escape hatch exists for advanced use cases like this.
 *
 * @module
 */
import { Injectable } from '@nestjs/common'
import { InjectLogger, PinoLoggerService } from '@bymax-one/nest-logger'

import type { LogLevelDto } from './dto/log-level.dto.js'

/** Provides the runtime log-level control endpoint. */
@Injectable()
export class AdminService {
  constructor(@InjectLogger(AdminService.name) private readonly logger: PinoLoggerService) {}

  /**
   * Change the live Pino log level and log the transition.
   *
   * The `level` is validated by the Zod schema before reaching this method.
   * `getRawLogger()` is used because no higher-level API exists for this operation.
   *
   * @param dto - Validated log level change request.
   * @returns Previous and new level.
   */
  setLogLevel(dto: LogLevelDto): { previous: string; current: string } {
    const raw = this.logger.getRawLogger()
    const previous = raw.level
    raw.level = dto.level // runtime change — debug lines start/stop appearing without a restart
    this.logger.info('ADMIN_LOG_LEVEL_CHANGED', 'Runtime log level changed', undefined, {
      previous,
      current: dto.level,
    })
    return { previous, current: dto.level }
  }
}
