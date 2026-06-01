/**
 * Global exception filter that maps `ZodError` → HTTP 400 Bad Request.
 *
 * Registered as `APP_FILTER` in `AppModule` so every controller benefits without
 * any per-endpoint wiring. When a route handler calls `schema.parse(body)` and
 * validation fails, this filter:
 *   1. Logs `DOMAIN_VALIDATION_FAILED` (warn) with structured issue details.
 *   2. Returns a `400 Bad Request` JSON response.
 *
 * @module
 */
import {
  type ArgumentsHost,
  Catch,
  type ExceptionFilter,
  HttpStatus,
  Injectable,
} from '@nestjs/common'
import { InjectLogger, PinoLoggerService } from '@bymax-one/nest-logger'
import type { Response } from 'express'
import { ZodError } from 'zod'

/** Catches unhandled `ZodError` instances and converts them to structured 400 responses. */
@Catch(ZodError)
@Injectable()
export class ZodValidationFilter implements ExceptionFilter {
  constructor(@InjectLogger(ZodValidationFilter.name) private readonly logger: PinoLoggerService) {}

  /**
   * Log the validation failure and write the 400 JSON response.
   *
   * Issue paths and messages are included in the log; raw input values are NEVER logged
   * (Zod errors carry path + code + message, not the rejected value).
   *
   * @param exception - The `ZodError` thrown by `schema.parse(body)`.
   * @param host - NestJS arguments host (switched to HTTP for response access).
   */
  catch(exception: ZodError, host: ArgumentsHost): void {
    const ctx = host.switchToHttp()
    const response = ctx.getResponse<Response>()

    // Take at most 10 issues to keep the log entry bounded.
    const details = exception.issues.slice(0, 10).map((issue) => ({
      path: issue.path.join('.'),
      message: issue.message,
    }))

    this.logger.warnStructured('DOMAIN_VALIDATION_FAILED', 'Request validation failed', undefined, {
      issueCount: exception.issues.length,
      details,
    })

    response.status(HttpStatus.BAD_REQUEST).json({
      statusCode: HttpStatus.BAD_REQUEST,
      message: 'Validation failed',
      errors: details,
    })
  }
}
