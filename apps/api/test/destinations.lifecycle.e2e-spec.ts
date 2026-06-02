/**
 * Destination lifecycle — reverse-order drain on `app.close()`.
 *
 * Proves that the library's `DestinationRegistry.onApplicationShutdown()` drains
 * destinations in REVERSE registration order (last-registered-first) and that
 * `LOGGER_BOOTSTRAP_OK` is emitted through the active destinations on module init.
 *
 * Technique:
 *   - Two stub `ILogDestination` objects record the call order in `onShutdown()`.
 *   - A probe destination captures all written lines (including bootstrap).
 *   - `await app.close()` triggers `onApplicationShutdown` hooks, which the library
 *     calls in reverse order.
 *
 * Note: `LOGGER_SHUTDOWN_OK` is a reserved key exported from `@bymax-one/nest-logger`
 * but is not yet emitted by `DestinationRegistry.onApplicationShutdown()` in the
 * `0.1.0` library build — that emission is a pending library enhancement.
 * This test asserts reverse-order drain (the implemented contract) instead.
 */
import { Test } from '@nestjs/testing'
import type { INestApplication } from '@nestjs/common'
import { BymaxLoggerModule } from '@bymax-one/nest-logger'
import type { ILogDestination } from '@bymax-one/nest-logger'

describe('Destination lifecycle — reverse-order drain', () => {
  let app: INestApplication | undefined

  afterEach(async () => {
    if (app) {
      await app.close()
      app = undefined
    }
  })

  it(/*
   * The registry must drain destinations in REVERSE registration order so downstream
   * sinks (e.g. Loki) flush their buffer BEFORE the primary stdout sink closes.
   * Library contract: `[...this.active].reverse()` in DestinationRegistry.
   */
  'drains destinations in reverse registration order on app.close()', async () => {
    const order: string[] = []

    const first: ILogDestination = {
      name: 'first',
      minLevel: 'info',
      write: () => {
        /* no-op */
      },
      onInit: () => {
        /* no-op */
      },
      onShutdown: async () => {
        await Promise.resolve()
        order.push('first')
      },
    }

    const second: ILogDestination = {
      name: 'second',
      minLevel: 'info',
      write: () => {
        /* no-op */
      },
      onInit: () => {
        /* no-op */
      },
      onShutdown: async () => {
        await Promise.resolve()
        order.push('second')
      },
    }

    const moduleRef = await Test.createTestingModule({
      imports: [
        BymaxLoggerModule.forRoot({
          service: { name: 'lifecycle-e2e', version: 'test' },
          level: 'info',
          isPretty: false,
          destinations: [first, second],
        }),
      ],
    }).compile()

    app = moduleRef.createNestApplication()
    await app.init()
    await app.close()
    app = undefined

    // last-registered-first: second was registered after first
    expect(order).toEqual(['second', 'first'])
  })

  it(/*
   * The library emits LOGGER_BOOTSTRAP_OK via the active destinations during
   * BymaxLoggerModule init. When custom destinations are provided, they REPLACE
   * DefaultStdoutDestination (library contract: resolveDestinations uses custom
   * destinations when provided; falls back to [DefaultStdoutDestination] otherwise).
   * Capturing from a probe destination confirms the pipeline is live.
   */
  'emits LOGGER_BOOTSTRAP_OK through active destinations on module init', async () => {
    const received: string[] = []

    const probe: ILogDestination = {
      name: 'bootstrap-probe',
      minLevel: 'info',
      write: (line) => {
        received.push(line)
      },
    }

    const moduleRef = await Test.createTestingModule({
      imports: [
        BymaxLoggerModule.forRoot({
          service: { name: 'lifecycle-e2e', version: 'test' },
          level: 'info',
          isPretty: false,
          destinations: [probe],
        }),
      ],
    }).compile()

    app = moduleRef.createNestApplication()
    await app.init()

    // LOGGER_BOOTSTRAP_OK is emitted by bootstrapProvider() during module compilation.
    expect(received.join('')).toContain('LOGGER_BOOTSTRAP_OK')
  })
})
