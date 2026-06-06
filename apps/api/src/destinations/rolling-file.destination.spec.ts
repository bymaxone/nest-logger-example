/**
 * Unit tests for `RollingFileDestination` — the async `onInit()` lifecycle example.
 *
 * Covers: the async `onInit()` that opens the stream via `openPinoRollStream` (with default
 * option fallbacks and explicit options), fail-soft init reporting `LOGGER_DESTINATION_INIT_FAILED`,
 * the `write()` guard for a missing stream (failed init) and the forwarding path, and
 * `onShutdown()` for the no-stream early return, the clean `finish` drain, and the `error`
 * fail-soft branch reporting `LOGGER_DESTINATION_WRITE_FAILED`.
 *
 * `./pino-roll.build.js` is replaced via `jest.unstable_mockModule` so no real file stream is
 * opened; the source under test is dynamic-imported AFTER the mock is registered.
 */
import { EventEmitter } from 'node:events'
import { describe, expect, it, jest, beforeEach, afterEach } from '@jest/globals'

// Shared mock for the typed boundary the destination uses to open its stream.
const openPinoRollStreamMock = jest.fn<(opts: unknown) => Promise<unknown>>()

jest.unstable_mockModule('./pino-roll.build.js', () => ({
  openPinoRollStream: openPinoRollStreamMock,
}))

// Import AFTER the ESM mock so the destination's `import { openPinoRollStream }` binds to it.
const { RollingFileDestination } = await import('./rolling-file.destination.js')

/**
 * Minimal Writable-like stub: an EventEmitter with `write`/`end` spies, so we can emit
 * `finish` or `error` to drive `onShutdown()`'s `once(stream, 'finish')` resolution.
 */
function makeStreamStub(): EventEmitter & { write: jest.Mock; end: jest.Mock } {
  const emitter = new EventEmitter() as EventEmitter & { write: jest.Mock; end: jest.Mock }
  emitter.write = jest.fn()
  emitter.end = jest.fn()
  return emitter
}

describe('RollingFileDestination', () => {
  let stderrSpy: ReturnType<typeof jest.spyOn>

  beforeEach(() => {
    openPinoRollStreamMock.mockReset()
    stderrSpy = jest.spyOn(process.stderr, 'write').mockReturnValue(true)
  })

  afterEach(() => {
    stderrSpy.mockRestore()
  })

  it('exposes the destination name and a trace minLevel so it records every level', () => {
    /**
     * The rolling file is the complete local record — it must declare `minLevel: 'trace'`
     * so the library forwards every level, and a stable `name` for diagnostics.
     */
    const dest = new RollingFileDestination({ file: 'logs/app.log' })
    expect(dest.name).toBe('rolling-file')
    expect(dest.minLevel).toBe('trace')
  })

  it('opens the stream in onInit with default frequency/size when only file is given', async () => {
    /**
     * The async lifecycle must open the stream via `openPinoRollStream`, applying the
     * documented defaults (`frequency: 'daily'`, `size: '50m'`, `mkdir: true`) when the
     * caller supplies only `file`.
     */
    const stream = makeStreamStub()
    openPinoRollStreamMock.mockResolvedValueOnce(stream)

    const dest = new RollingFileDestination({ file: 'logs/app.log' })
    await dest.onInit()

    expect(openPinoRollStreamMock).toHaveBeenCalledWith({
      file: 'logs/app.log',
      frequency: 'daily',
      size: '50m',
      mkdir: true,
    })
  })

  it('passes through explicit frequency and size options to openPinoRollStream', async () => {
    /**
     * When the caller specifies `frequency` and `size`, those values must override the
     * defaults — exercising the truthy side of both `??` fallbacks.
     */
    const stream = makeStreamStub()
    openPinoRollStreamMock.mockResolvedValueOnce(stream)

    const dest = new RollingFileDestination({ file: 'logs/app.log', frequency: 3_600, size: '10m' })
    await dest.onInit()

    expect(openPinoRollStreamMock).toHaveBeenCalledWith({
      file: 'logs/app.log',
      frequency: 3_600,
      size: '10m',
      mkdir: true,
    })
  })

  it('fails soft and reports LOGGER_DESTINATION_INIT_FAILED when the open rejects', async () => {
    /**
     * A failed open must NOT throw (the library drops the destination on init failure);
     * the catch branch writes the init-failed token to stderr and leaves `stream` unset.
     */
    openPinoRollStreamMock.mockRejectedValueOnce(new Error('mkdir denied'))

    const dest = new RollingFileDestination({ file: 'logs/app.log' })
    await expect(dest.onInit()).resolves.toBeUndefined()

    expect(stderrSpy).toHaveBeenCalledTimes(1)
    expect(String(stderrSpy.mock.calls[0]?.[0])).toContain('LOGGER_DESTINATION_INIT_FAILED')
  })

  it('write() forwards the line to the open stream', async () => {
    /**
     * Once the stream is open, `write()` must forward the already-serialized line verbatim
     * to the stream — the happy path of the optional-chaining guard.
     */
    const stream = makeStreamStub()
    openPinoRollStreamMock.mockResolvedValueOnce(stream)

    const dest = new RollingFileDestination({ file: 'logs/app.log' })
    await dest.onInit()
    dest.write('{"level":"info"}\n')

    expect(stream.write).toHaveBeenCalledWith('{"level":"info"}\n')
  })

  it('write() is a no-op when the stream never opened (failed init)', () => {
    /**
     * The optional-chaining guard must swallow a write when init failed and `stream`
     * is undefined — no throw, nothing forwarded.
     */
    const dest = new RollingFileDestination({ file: 'logs/app.log' })
    expect(() => dest.write('{"level":"info"}\n')).not.toThrow()
  })

  it('onShutdown() returns early when there is no stream to flush', async () => {
    /**
     * With no open stream (init never ran or failed), `onShutdown()` must short-circuit
     * without touching `once()` — covering the guard's early-return branch.
     */
    const dest = new RollingFileDestination({ file: 'logs/app.log' })
    await expect(dest.onShutdown()).resolves.toBeUndefined()
    expect(stderrSpy).not.toHaveBeenCalled()
  })

  it('onShutdown() ends the stream and resolves when it emits finish', async () => {
    /**
     * The clean drain path: `onShutdown()` calls `stream.end()` and awaits `finish`.
     * When `finish` fires, the promise resolves with no stderr report.
     */
    const stream = makeStreamStub()
    openPinoRollStreamMock.mockResolvedValueOnce(stream)

    const dest = new RollingFileDestination({ file: 'logs/app.log' })
    await dest.onInit()

    const shutdown = dest.onShutdown()
    // Emit on the next tick so `once(stream, 'finish')` has attached its listener.
    await Promise.resolve()
    stream.emit('finish')
    await expect(shutdown).resolves.toBeUndefined()

    expect(stream.end).toHaveBeenCalledTimes(1)
    expect(stderrSpy).not.toHaveBeenCalled()
  })

  it('onShutdown() fails soft to stderr when the stream emits error during drain', async () => {
    /**
     * The error drain path: if the stream emits `error` before `finish`, `once()` rejects;
     * the `.catch` reports `LOGGER_DESTINATION_WRITE_FAILED` (with the stringified error)
     * and the shutdown still resolves — never rethrows.
     */
    const stream = makeStreamStub()
    openPinoRollStreamMock.mockResolvedValueOnce(stream)

    const dest = new RollingFileDestination({ file: 'logs/app.log' })
    await dest.onInit()

    const shutdown = dest.onShutdown()
    await Promise.resolve()
    stream.emit('error', new Error('disk full'))
    await expect(shutdown).resolves.toBeUndefined()

    expect(stream.end).toHaveBeenCalledTimes(1)
    expect(stderrSpy).toHaveBeenCalledTimes(1)
    const written = String(stderrSpy.mock.calls[0]?.[0])
    expect(written).toContain('LOGGER_DESTINATION_WRITE_FAILED')
    expect(written).toContain('disk full')
  })
})
