/**
 * Request body schemas for the `trigger/` Playground hooks.
 *
 * @module
 */
import { z } from 'zod'

/**
 * Schema for `POST /trigger/level`.
 *
 * Covers all six emit levels so the Playground can exercise the full logger surface:
 * the structured key-first API (`info` / `warn` / `error`) AND the NestJS-style
 * variadic methods (`fatal` = level 60, `verbose` = Pino `trace`, `debug`), which have
 * no key-first variant.
 */
export const triggerLevelSchema = z.object({
  level: z.enum(['info', 'warn', 'error', 'fatal', 'verbose', 'debug']),
  count: z.number().int().min(1).max(100).default(1),
})

/** Type inferred from {@link triggerLevelSchema}. */
export type TriggerLevelDto = z.infer<typeof triggerLevelSchema>

/** Schema for `POST /trigger/burst`. */
export const triggerBurstSchema = z.object({
  count: z.number().int().min(1).max(500),
})

/** Type inferred from {@link triggerBurstSchema}. */
export type TriggerBurstDto = z.infer<typeof triggerBurstSchema>
