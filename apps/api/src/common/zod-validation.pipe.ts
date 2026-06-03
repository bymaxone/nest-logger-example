/**
 * Reusable NestJS pipe that validates a value against a Zod schema.
 *
 * Layer: app/common. Wraps `schema.safeParse(value)` and throws a structured
 * `BadRequestException` when validation fails. Generic over `TSchema` so each
 * endpoint can supply its own schema without losing type inference on the
 * validated output.
 *
 * @module
 */
import { BadRequestException, Injectable, type PipeTransform } from '@nestjs/common'
import type { ZodType } from 'zod'

/**
 * Parse `value` with `schema`; throw `BadRequestException` on failure.
 *
 * @typeParam TSchema - The Zod schema type.
 */
@Injectable()
export class ZodValidationPipe<TSchema extends ZodType> implements PipeTransform {
  constructor(private readonly schema: TSchema) {}

  /**
   * Validate and transform the incoming value.
   *
   * @param value - Raw value from the request (query params, body, etc.).
   * @returns The parsed, fully-defaulted output value.
   * @throws {BadRequestException} When schema validation fails; includes a list of issues.
   */
  transform(value: unknown): ReturnType<TSchema['parse']> {
    const result = this.schema.safeParse(value)
    if (!result.success) {
      const issues = result.error.issues.slice(0, 10).map((issue) => ({
        path: issue.path.join('.'),
        message: issue.message,
      }))
      throw new BadRequestException({ message: 'Validation failed', errors: issues })
    }
    return result.data as ReturnType<TSchema['parse']>
  }
}
