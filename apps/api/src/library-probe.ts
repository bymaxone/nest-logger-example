/**
 * Library export-surface probe.
 *
 * References every public `@bymax-one/nest-logger` export that has no natural
 * feature-level home, so the export-usage audit (`scripts/audit-library-exports.mjs`,
 * Appendix B) can prove the whole surface is demonstrated. Both subpaths are
 * exercised: the `.` server API (module, logger, DI tokens, the decorator metadata
 * key, the pretty-dev destination, the class-based options-factory contract) and the
 * `/shared` isomorphic API (the convention regex, the `LogLevel` + reserved-key unions).
 *
 * @module
 */
// `.` subpath — server surface: classes, DI tokens, the decorator metadata key,
// the pretty-dev destination, and the class-based options-factory contract.
import {
  BymaxLoggerModule,
  type BymaxLoggerModuleAsyncOptions,
  type BymaxLoggerModuleOptionsFactory,
  LOG_CONTEXT_METADATA_KEY,
  LOG_CONTEXT_TOKEN,
  LOGGER_DESTINATIONS_TOKEN,
  LOGGER_PINO_INSTANCE_TOKEN,
  PinoLoggerService,
  PrettyDevDestination,
} from '@bymax-one/nest-logger'
// `/shared` subpath — isomorphic, zero-dependency (value + types).
import { LOG_KEYS_CONVENTION_REGEX } from '@bymax-one/nest-logger/shared'
import type { LogLevel, ReservedLogKey } from '@bymax-one/nest-logger/shared'

/**
 * Runtime-value proof for the `.` subpath: reading a static member of the
 * server-only `BymaxLoggerModule` forces the value import to be resolved (and
 * kept under `verbatimModuleSyntax`).
 */
export const serverModuleName: string = BymaxLoggerModule.name

/** Type-position proof for the `.` subpath: aliases the server-only logger class. */
export type ServerLogger = PinoLoggerService

/**
 * Type-position proof for the `.` subpath: the class-based options-factory contract
 * (`useClass`/`useExisting` alternative to the `useFactory` wiring in app.module.ts).
 */
export type ServerOptionsFactory = BymaxLoggerModuleOptionsFactory

/**
 * Type-position proof for the `.` subpath: the async-options contract accepted by
 * `BymaxLoggerModule.forRootAsync` (the `useFactory` form used in app.module.ts).
 */
export type ServerAsyncOptions = BymaxLoggerModuleAsyncOptions

/** Type-annotation proof for the `/shared` subpath: a member of the `LogLevel` union. */
const sampleLevel: LogLevel = 'info'

/** Type-annotation proof for the `/shared` subpath: a member of the reserved-key union. */
const sampleReservedKey: ReservedLogKey = 'HTTP_REQUEST_COMPLETED'

/**
 * Runtime-value proof for the `/shared` subpath: invoking the exported regex
 * forces the isomorphic value import to be resolved. Holds `true` because the
 * sample key satisfies `LOG_KEYS_CONVENTION_REGEX`.
 */
export const isWellFormedKey: boolean = LOG_KEYS_CONVENTION_REGEX.test('ORDER_CREATE_SUCCESS')

/** Runtime-value proof: the `@LogContext()` decorator metadata key (a string constant). */
export const contextMetadataKey: string = LOG_CONTEXT_METADATA_KEY

/** Runtime-value proof: the pretty-dev destination class name. */
export const prettyDestinationName: string = PrettyDevDestination.name

/**
 * Runtime-value proof: the three injection tokens are unique symbols; their string
 * labels prove the `.` subpath's advanced DI surface (the destinations array, the raw
 * pino instance, and the AsyncLocalStorage context store) resolved.
 */
export const injectionTokenLabels: readonly [string, string, string] = [
  LOGGER_DESTINATIONS_TOKEN.toString(),
  LOGGER_PINO_INSTANCE_TOKEN.toString(),
  LOG_CONTEXT_TOKEN.toString(),
]

/** Aggregates every subpath proof so a single import asserts the whole resolution surface. */
export const probe = {
  serverModuleName,
  sampleLevel,
  sampleReservedKey,
  isWellFormedKey,
  contextMetadataKey,
  prettyDestinationName,
  injectionTokenLabels,
} as const
