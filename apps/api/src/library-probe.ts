/**
 * Phase 2 subpath probe — proves both `@bymax-one/nest-logger` subpaths
 * (`.` server API + `/shared` isomorphic API) type-resolve via the local link.
 * Temporary: superseded by the real wiring in Phase 3+; safe to delete then.
 */
// `.` subpath — the full NestJS server surface
import { BymaxLoggerModule, PinoLoggerService } from '@bymax-one/nest-logger'
// `/shared` subpath — isomorphic, zero-dependency (value + type)
import { LOG_KEYS_CONVENTION_REGEX } from '@bymax-one/nest-logger/shared'
import type { LogLevel } from '@bymax-one/nest-logger/shared'

/**
 * Runtime-value proof for the `.` subpath: reading a static member of the
 * server-only `BymaxLoggerModule` forces the value import to be resolved (and
 * kept under `verbatimModuleSyntax`).
 */
export const serverModuleName: string = BymaxLoggerModule.name

/** Type-position proof for the `.` subpath: aliases the server-only logger class. */
export type ServerLogger = PinoLoggerService

/** Type-annotation proof for the `/shared` subpath: a member of the `LogLevel` union. */
const sampleLevel: LogLevel = 'info'

/**
 * Runtime-value proof for the `/shared` subpath: invoking the exported regex
 * forces the isomorphic value import to be resolved.
 *
 * @returns `true` when the sample key satisfies `LOG_KEYS_CONVENTION_REGEX`.
 */
export const isWellFormedKey: boolean = LOG_KEYS_CONVENTION_REGEX.test('ORDER_CREATE_SUCCESS')

/** A trivial probe result proving both subpaths resolved at type-check time. */
export const probe = {
  serverModuleName,
  sampleLevel,
  isWellFormedKey,
} as const
