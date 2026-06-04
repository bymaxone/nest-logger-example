/**
 * Context query DTO — surrounding log lines by requestId or traceId.
 *
 * Layer: logs/dto. Exactly one of `requestId`/`traceId` must be provided;
 * `before` and `after` are bounded at 100. Extends the base filter schema
 * so the common time/tenant filters still apply.
 *
 * @module
 */
import { z } from 'zod'

import { logQuerySchema } from './log-query.dto.js'

/** Validated context query DTO inferred from {@link contextQuerySchema}. */
export const contextQuerySchema = logQuerySchema
  .extend({
    /** Anchor row's `requestId` — mutually exclusive with `traceId`. */
    requestId: z.string().max(128).optional(),
    /** Anchor row's `traceId` — mutually exclusive with `requestId`. */
    traceId: z.string().max(128).optional(),
    /** Number of log lines strictly before the anchor row (default 10, max 100). */
    before: z.coerce.number().int().min(0).max(100).default(10),
    /** Number of log lines strictly after the anchor row (default 10, max 100). */
    after: z.coerce.number().int().min(0).max(100).default(10),
    /** ISO-8601 timestamp of the anchor row (required for keyset windowing). */
    anchorTime: z.string().datetime().optional(),
    /** ID of the anchor row (required for keyset windowing). */
    anchorId: z.string().optional(),
  })
  .superRefine((v, ctx) => {
    if (v.requestId === undefined && v.traceId === undefined) {
      ctx.addIssue({
        code: 'custom',
        path: ['requestId'],
        message: 'exactly one of requestId or traceId is required',
      })
    }
    if (v.requestId !== undefined && v.traceId !== undefined) {
      ctx.addIssue({
        code: 'custom',
        path: ['requestId'],
        message: 'provide only one of requestId or traceId, not both',
      })
    }
  })

/** Parsed context query DTO. */
export type ContextQueryDto = z.infer<typeof contextQuerySchema>
