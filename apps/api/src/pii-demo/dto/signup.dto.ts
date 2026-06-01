/**
 * Request body schema for `POST /pii-demo/signup`.
 *
 * Field names match the library's 23 default-redact fields so redaction
 * assertions can verify `[REDACTED]` values end to end.
 *
 * @module
 */
import { z } from 'zod'

/** Zod schema for the signup surface that emits PII for redaction proofs. */
export const signupSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
  cpf: z.string().min(1),
  cardNumber: z.string().min(1),
  cardCvv: z.string().min(1),
})

/** Type inferred from {@link signupSchema}. */
export type SignupDto = z.infer<typeof signupSchema>
