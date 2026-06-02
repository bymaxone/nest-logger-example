/**
 * Typed boundary for `pino-roll` (CJS, no bundled types).
 *
 * Keeps the untyped import and cast in one place so callers stay fully type-checked.
 */
import type { Writable } from 'node:stream'

/** Options accepted by `pino-roll`'s `build()` factory. */
export interface PinoRollBuildOptions {
  readonly file: string
  readonly frequency?: 'daily' | number
  readonly size?: string
  readonly mkdir?: boolean
}

type PinoRollBuild = (options: PinoRollBuildOptions) => Promise<Writable>

/** Opens a rolling-file stream via `pino-roll`. */
export async function openPinoRollStream(options: PinoRollBuildOptions): Promise<Writable> {
  const { default: buildUntyped } = (await import('pino-roll')) as {
    default: PinoRollBuild
  }
  return buildUntyped(options)
}
