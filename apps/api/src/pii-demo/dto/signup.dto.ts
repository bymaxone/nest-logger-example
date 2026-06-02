/**
 * Request body schema for `POST /pii-demo/signup`.
 *
 * Field names match the library's 23 default-redact fields so redaction
 * assertions can verify `[REDACTED]` values end to end.
 *
 * `nome` is intentionally NOT a default-redact path — it appears in cleartext
 * to make the LGPD personal-name boundary explicit.
 *
 * @module
 */
import { z } from 'zod'

/** Zod schema for the signup surface that emits PII for redaction proofs. */
export const signupSchema = z.object({
  nome: z.string().min(1), // logged in cleartext — LGPD boundary demo (not a default redact path)
  email: z.string().email(),
  password: z.string().min(1),
  cpf: z.string().min(1),
  cardNumber: z.string().min(1),
  cardCvv: z.string().min(1),
  payment: z.object({ cardNumber: z.string().min(1) }), // depth-2 default-redact proof
})

/** Type inferred from {@link signupSchema}. */
export type SignupDto = z.infer<typeof signupSchema>
