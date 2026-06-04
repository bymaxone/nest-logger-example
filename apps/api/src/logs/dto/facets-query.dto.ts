/**
 * Facets query DTO — extends `logQuerySchema` with a bounded `fields` list.
 *
 * Layer: logs/dto. Only bounded-dimension fields are allowed in the `fields`
 * param (`DASHBOARD.md` §11). Any other field causes a 400.
 *
 * @module
 */
import { z } from 'zod'

import { logQuerySchema } from './log-query.dto.js'

/** Bounded-dimension fields that may be faceted (`DASHBOARD.md` §11). */
export const FACET_FIELDS_ALLOW_LIST = ['level', 'service', 'logKey', 'tenantId'] as const

/** Validated facets query DTO inferred from {@link facetsQuerySchema}. */
export const facetsQuerySchema = logQuerySchema.extend({
  /**
   * Comma-separated list of bounded-dimension fields to facet.
   * Each field is validated against the allow-list.
   */
  fields: z
    .string()
    .default('level,service,logKey,tenantId')
    .transform((v) => v.split(',').map((f) => f.trim()))
    .pipe(z.array(z.enum(FACET_FIELDS_ALLOW_LIST)).min(1).max(FACET_FIELDS_ALLOW_LIST.length)),
})

/** Parsed facets query DTO. */
export type FacetsQueryDto = z.infer<typeof facetsQuerySchema>
