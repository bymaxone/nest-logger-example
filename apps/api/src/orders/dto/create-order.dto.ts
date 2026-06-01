/**
 * Request body schema for `POST /orders`.
 *
 * @module
 */
import { z } from 'zod'

/** Zod schema validating an order-creation request body. */
export const createOrderSchema = z.object({
  amount: z.number().int().positive(), // cents
  tenantId: z.string().min(1),
  userId: z.string().min(1).optional(),
})

/** Type inferred from {@link createOrderSchema}. */
export type CreateOrderDto = z.infer<typeof createOrderSchema>
