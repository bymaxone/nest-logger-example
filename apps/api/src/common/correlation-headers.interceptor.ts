/**
 * Echoes the active correlation ids onto every HTTP response as `X-Request-Id`
 * and `X-Trace-Id` headers.
 *
 * Layer: common. The library `RequestIdMiddleware` opens the per-request ALS
 * scope before any interceptor runs, so `LogContextService.getStore()` already
 * carries the `requestId`. The distributed `traceId` is read from the active
 * OpenTelemetry span (the value is shared across services, so the dashboard can
 * pivot a cross-service request by it); when no span is sampled it falls back to
 * the ALS store. Surfacing these lets the Trigger Center deep-link a freshly
 * fired request straight into the Explorer.
 *
 * @module
 */
import {
  type CallHandler,
  type ExecutionContext,
  Injectable,
  type NestInterceptor,
} from '@nestjs/common'
import { LogContextService } from '@bymax-one/nest-logger'
import { trace } from '@opentelemetry/api'
import type { Response } from 'express'
import type { Observable } from 'rxjs'

/** All-zero trace id returned by OpenTelemetry when no span is sampled. */
const INVALID_TRACE_ID = /^0+$/

/**
 * Sets `X-Request-Id` / `X-Trace-Id` response headers from the active request
 * context so the browser (with these headers CORS-exposed) can read them.
 */
@Injectable()
export class CorrelationHeadersInterceptor implements NestInterceptor {
  /**
   * @param logContext - Library ALS accessor for the current request's context.
   */
  constructor(private readonly logContext: LogContextService) {}

  /**
   * Attach the correlation headers before the handler streams its response.
   *
   * @param context - The current execution context (HTTP only).
   * @param next - The downstream handler in the interceptor chain.
   * @returns The untouched handler stream.
   */
  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const res = context.switchToHttp().getResponse<Response>()
    const store = this.logContext.getStore()

    const requestId = store?.requestId
    if (typeof requestId === 'string' && requestId !== '') {
      res.setHeader('X-Request-Id', requestId)
    }

    const spanTraceId = trace.getActiveSpan()?.spanContext().traceId
    const traceId =
      typeof spanTraceId === 'string' && !INVALID_TRACE_ID.test(spanTraceId)
        ? spanTraceId
        : store?.traceId
    if (typeof traceId === 'string' && traceId !== '' && !INVALID_TRACE_ID.test(traceId)) {
      res.setHeader('X-Trace-Id', traceId)
    }

    return next.handle()
  }
}
