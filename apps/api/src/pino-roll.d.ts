/**
 * Minimal ambient type declaration for `pino-roll` (v3.x, CJS, no bundled types).
 * Runtime typing lives in `pino-roll.build.ts`; this file only satisfies module resolution.
 */
declare module 'pino-roll' {
  const build: (options: {
    file: string
    frequency?: 'daily' | number
    size?: string
    mkdir?: boolean
  }) => Promise<unknown>

  export default build
}
