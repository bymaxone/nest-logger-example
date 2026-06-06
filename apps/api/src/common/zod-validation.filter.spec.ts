/**
 * Unit tests for `ZodValidationFilter`.
 *
 * Proves the global `@Catch(ZodError)` filter:
 *   - Logs `DOMAIN_VALIDATION_FAILED` (warn) with a bounded, structured set of
 *     issue details (path + message only — never the rejected value).
 *   - Writes a `400 Bad Request` JSON response in the documented shape.
 *   - Caps the included issue details at 10 while still reporting the true total
 *     `issueCount`.
 *
 * The filter is constructed directly with a mocked `PinoLoggerService`; the
 * `ArgumentsHost` and Express `Response` are doubled.
 */
import { describe, expect, it, jest } from '@jest/globals'
import { HttpStatus } from '@nestjs/common'
import type { ArgumentsHost } from '@nestjs/common'
import type { PinoLoggerService } from '@bymax-one/nest-logger'
import { z, ZodError } from 'zod'

import { ZodValidationFilter } from './zod-validation.filter.js'

/** Express `Response` double with chainable `status()` and a recording `json()`. */
function makeResponse(): {
  status: ReturnType<typeof jest.fn>
  json: ReturnType<typeof jest.fn>
} {
  const res = {
    status: jest.fn(() => res),
    json: jest.fn(() => res),
  }
  return res
}

/**
 * Build an `ArgumentsHost` whose `switchToHttp().getResponse()` yields `res`.
 *
 * @param res - The response double the filter should write to.
 */
function makeHost(res: unknown): ArgumentsHost {
  return {
    switchToHttp: () => ({ getResponse: () => res }),
  } as unknown as ArgumentsHost
}

/** A `PinoLoggerService` mock exposing only the `warnStructured` method the filter calls. */
function makeLogger(): PinoLoggerService {
  return { warnStructured: jest.fn() } as unknown as PinoLoggerService
}

/**
 * Produce a real `ZodError` with the requested number of issues by parsing an
 * object schema whose required string fields are all absent.
 *
 * @param count - Number of failing fields (and thus issues) to generate.
 */
function makeZodError(count: number): ZodError {
  const schema = z.object(
    Object.fromEntries(
      Array.from({ length: count }, (_unused, i) => [`f${i}`, z.string()]),
    ) as Record<string, z.ZodString>,
  )
  const result = schema.safeParse({})
  if (result.success) {
    throw new Error('test setup expected a ZodError')
  }
  return result.error
}

describe('ZodValidationFilter', () => {
  it('logs DOMAIN_VALIDATION_FAILED and writes a 400 JSON response', () => {
    /**
     * Core contract: a caught `ZodError` must produce one warn-level structured
     * log under the `DOMAIN_VALIDATION_FAILED` key and a 400 response in the
     * `{ statusCode, message, errors }` shape.
     */
    const logger = makeLogger()
    const res = makeResponse()
    const filter = new ZodValidationFilter(logger)
    const error = makeZodError(2)

    filter.catch(error, makeHost(res))

    expect(logger.warnStructured).toHaveBeenCalledTimes(1)
    expect(logger.warnStructured).toHaveBeenCalledWith(
      'DOMAIN_VALIDATION_FAILED',
      'Request validation failed',
      undefined,
      expect.objectContaining({ issueCount: 2, details: expect.any(Array) }),
    )
    expect(res.status).toHaveBeenCalledWith(HttpStatus.BAD_REQUEST)
    expect(res.json).toHaveBeenCalledWith({
      statusCode: HttpStatus.BAD_REQUEST,
      message: 'Validation failed',
      errors: expect.any(Array),
    })
  })

  it('caps details at 10 while reporting the true issueCount', () => {
    /**
     * Bound guard: with 12 issues the logged/returned `details` array must be
     * sliced to 10, yet `issueCount` must reflect the real total (12) so
     * observers see how many were elided.
     */
    const logger = makeLogger()
    const res = makeResponse()
    const filter = new ZodValidationFilter(logger)
    const error = makeZodError(12)

    filter.catch(error, makeHost(res))

    const logMeta = (logger.warnStructured as ReturnType<typeof jest.fn>).mock.calls[0]?.[3] as {
      issueCount: number
      details: unknown[]
    }
    expect(logMeta.issueCount).toBe(12)
    expect(logMeta.details).toHaveLength(10)

    const body = (res.json as ReturnType<typeof jest.fn>).mock.calls[0]?.[0] as {
      errors: unknown[]
    }
    expect(body.errors).toHaveLength(10)
  })

  it('maps each issue to a dot-joined path and its message', () => {
    /**
     * Detail shape: nested issue paths are joined with '.' and only `path` +
     * `message` are surfaced (the rejected value is never logged).
     */
    const logger = makeLogger()
    const res = makeResponse()
    const filter = new ZodValidationFilter(logger)
    const schema = z.object({ user: z.object({ age: z.number() }) })
    const parsed = schema.safeParse({ user: { age: 'x' } })
    if (parsed.success) {
      throw new Error('test setup expected a ZodError')
    }

    filter.catch(parsed.error, makeHost(res))

    const body = (res.json as ReturnType<typeof jest.fn>).mock.calls[0]?.[0] as {
      errors: { path: string; message: string }[]
    }
    expect(body.errors[0]?.path).toBe('user.age')
    expect(typeof body.errors[0]?.message).toBe('string')
    expect(body.errors[0]).not.toHaveProperty('value')
  })
})
