/**
 * Unit tests for `openPinoRollStream` — the typed boundary around `pino-roll`.
 *
 * Covers: the dynamic ESM import of `pino-roll`, the cast to the typed `build()` factory,
 * and the forwarding of the build options through to the underlying CJS module. The
 * `pino-roll` module is replaced via `jest.unstable_mockModule` so no real file stream is
 * opened; the source under test is dynamic-imported AFTER the mock is registered.
 */
import { describe, expect, it, jest, beforeEach } from '@jest/globals'

// The mocked `build()` factory shared across the spec. Declared before the mock factory
// so the closure captures the same reference the dynamic import will observe.
const buildMock = jest.fn<(opts: unknown) => Promise<{ write: jest.Mock }>>(async () => ({
  write: jest.fn(),
}))

jest.unstable_mockModule('pino-roll', () => ({
  default: buildMock,
}))

// Import the unit under test AFTER the ESM mock is registered, so its internal
// `await import('pino-roll')` resolves to the mock rather than the real CJS module.
const { openPinoRollStream } = await import('./pino-roll.build.js')

describe('openPinoRollStream', () => {
  beforeEach(() => {
    buildMock.mockClear()
  })

  it('forwards the build options to pino-roll and returns the resolved stream', async () => {
    /**
     * The boundary must call `pino-roll`'s default `build()` factory with the exact
     * options it received and return the stream the factory resolves to — proving the
     * untyped CJS import is wired through correctly.
     */
    const fakeStream = { write: jest.fn() }
    buildMock.mockResolvedValueOnce(fakeStream)

    const options = { file: 'logs/app.log', frequency: 'daily' as const, size: '50m', mkdir: true }
    const stream = await openPinoRollStream(options)

    expect(buildMock).toHaveBeenCalledTimes(1)
    expect(buildMock).toHaveBeenCalledWith(options)
    expect(stream).toBe(fakeStream)
  })

  it('propagates a rejection from the underlying pino-roll build()', async () => {
    /**
     * `openPinoRollStream` adds no error handling of its own — a failed open must
     * reject so the caller (`RollingFileDestination.onInit`) can fail soft. This
     * protects the contract that the boundary is transparent on the error path.
     */
    const failure = new Error('cannot open file')
    buildMock.mockRejectedValueOnce(failure)

    await expect(openPinoRollStream({ file: 'logs/app.log' })).rejects.toBe(failure)
  })
})
