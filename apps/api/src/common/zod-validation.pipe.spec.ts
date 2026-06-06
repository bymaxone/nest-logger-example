/**
 * Unit tests for `ZodValidationPipe`.
 *
 * Proves the generic pipe:
 *   - Returns the parsed, fully-defaulted value on a successful `safeParse`.
 *   - Throws `BadRequestException` carrying a bounded list of issues on failure.
 *   - Caps the reported issue list at 10 entries (the `.slice(0, 10)` guard) and
 *     joins nested issue paths with a dot.
 *
 * The pipe is exercised directly with real Zod schemas (no DI container needed).
 */
import { describe, expect, it } from '@jest/globals'
import { BadRequestException } from '@nestjs/common'
import { z } from 'zod'

import { ZodValidationPipe } from './zod-validation.pipe.js'

describe('ZodValidationPipe', () => {
  it('returns the parsed value (with defaults applied) when validation succeeds', () => {
    /**
     * On success the pipe must return `result.data`, which includes any schema
     * defaults — proving it forwards the transformed output, not the raw input.
     */
    const schema = z.object({ name: z.string(), active: z.boolean().default(true) })
    const pipe = new ZodValidationPipe(schema)

    const out = pipe.transform({ name: 'ada' })

    expect(out).toEqual({ name: 'ada', active: true })
  })

  it('throws BadRequestException with the dot-joined issue path on failure', () => {
    /**
     * On a single nested failure the pipe must throw `BadRequestException` whose
     * payload lists the issue with its path segments joined by '.'.
     */
    const schema = z.object({ user: z.object({ age: z.number() }) })
    const pipe = new ZodValidationPipe(schema)

    let caught: unknown
    try {
      pipe.transform({ user: { age: 'not-a-number' } })
    } catch (error) {
      caught = error
    }

    expect(caught).toBeInstanceOf(BadRequestException)
    const payload = (caught as BadRequestException).getResponse() as {
      message: string
      errors: { path: string; message: string }[]
    }
    expect(payload.message).toBe('Validation failed')
    expect(payload.errors[0]?.path).toBe('user.age')
    expect(typeof payload.errors[0]?.message).toBe('string')
  })

  it('caps the reported issues at 10 even when more failures exist', () => {
    /**
     * Bound guard: a schema producing 12 issues must surface at most 10 in the
     * thrown payload so log/response size stays bounded.
     */
    const schema = z.object(
      Object.fromEntries(
        Array.from({ length: 12 }, (_unused, i) => [`f${i}`, z.string()]),
      ) as Record<string, z.ZodString>,
    )
    const pipe = new ZodValidationPipe(schema)

    let caught: unknown
    try {
      pipe.transform({})
    } catch (error) {
      caught = error
    }

    const payload = (caught as BadRequestException).getResponse() as {
      errors: { path: string; message: string }[]
    }
    expect(payload.errors).toHaveLength(10)
  })

  it('reports an empty path for a top-level (root) issue', () => {
    /**
     * When the failing issue has no path segments (root-level type mismatch),
     * `issue.path.join('.')` yields '' — the pipe still reports the issue.
     */
    const schema = z.string()
    const pipe = new ZodValidationPipe(schema)

    let caught: unknown
    try {
      pipe.transform(42)
    } catch (error) {
      caught = error
    }

    const payload = (caught as BadRequestException).getResponse() as {
      errors: { path: string; message: string }[]
    }
    expect(payload.errors[0]?.path).toBe('')
  })
})
