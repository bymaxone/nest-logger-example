/**
 * Request body schema for `POST /payments`.
 *
 * @module
 */
import { z } from 'zod'

/** Zod schema validating a payment-creation request body. */
export const createPaymentSchema = z.object({
  orderId: z.string().min(1),
  amount: z.number().int().positive(),
  userId: z.string().min(1).optional(),
})

/** Type inferred from {@link createPaymentSchema}. */
export type CreatePaymentDto = z.infer<typeof createPaymentSchema>
