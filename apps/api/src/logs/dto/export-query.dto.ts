/**
 * Export query DTO — extends `logQuerySchema` with a `format` enum.
 *
 * Layer: logs/dto. Validates the query params for `GET /logs/export`.
 * Format defaults to `json`; CSV column order is fixed by the service.
 *
 * @module
 */
import { z } from 'zod'

import { logQuerySchema } from './log-query.dto.js'

/** Validated export query DTO inferred from {@link exportQuerySchema}. */
export const exportQuerySchema = logQuerySchema.extend({
  /** Download format. CSV columns are fixed: time, level, logKey, service, requestId, traceId, tenantId, msg. */
  format: z.enum(['json', 'csv']).default('json'),
})

/** Parsed export query DTO. */
export type ExportQueryDto = z.infer<typeof exportQuerySchema>
