/**
 * `forRootAsync` end-to-end gate — the async registration paths.
 *
 * The production API registers the logger via `forRootAsync({ useFactory, inject, imports })`
 * (see `apps/api/src/app.module.ts`), but the structured e2e suites swap in a synchronous
 * `forRoot` test module to avoid Loki/Prisma. This spec exercises the async contract
 * directly, with simple options, proving:
 *   - `forRootAsync({ useClass })` resolves options from a `BymaxLoggerModuleOptionsFactory`
 *     implementation (the previously-undemonstrated class-based factory path);
 *   - `forRootAsync({ useFactory })` resolves lazily — the options object is annotated with
 *     the exported `BymaxLoggerModuleAsyncOptions` type (no longer a probe-only alias);
 *   - the library's async HTTP-interceptor provider auto-mounts on BOTH async paths
 *     (`HTTP_REQUEST_START` is emitted), and the resolved logger emits structured logs.
 */
import type { INestApplication } from '@nestjs/common'
import { Injectable, Module } from '@nestjs/common'
import { Test } from '@nestjs/testing'
import {
  BymaxLoggerModule,
  type BymaxLoggerModuleAsyncOptions,
  type BymaxLoggerModuleOptions,
  type BymaxLoggerModuleOptionsFactory,
} from '@bymax-one/nest-logger'
import { jest } from '@jest/globals'
import request from 'supertest'

import { TriggerModule } from '../src/trigger/trigger.module.js'

/** Shared base options for both async paths — JSON output, HTTP logging on, no Nest bridge. */
function baseOptions(name: string): BymaxLoggerModuleOptions {
  return {
    service: { name, version: 'test' },
    isPretty: false, // force NDJSON so the stdout spy captures parseable JSON
    level: 'info',
    isGlobal: true,
    shouldUseAsNestLogger: false,
    http: { isEnabled: true },
  }
}

/** Class-based options factory — the `useClass` async path the example otherwise never shows. */
@Injectable()
class LoggerOptionsFactory implements BymaxLoggerModuleOptionsFactory {
  createLoggerOptions(): BymaxLoggerModuleOptions {
    return baseOptions('api-async-useclass')
  }
}

@Module({
  imports: [BymaxLoggerModule.forRootAsync({ useClass: LoggerOptionsFactory }), TriggerModule],
})
class AsyncUseClassModule {}

// The useFactory options object, annotated with the exported async-options interface so the
// type does load-bearing work (not just a library-probe alias).
const asyncFactoryOptions: BymaxLoggerModuleAsyncOptions = {
  useFactory: () => baseOptions('api-async-usefactory'),
}

@Module({
  imports: [BymaxLoggerModule.forRootAsync(asyncFactoryOptions), TriggerModule],
})
class AsyncUseFactoryModule {}

/** Capture every `stdout.write` during `fn` and return the joined output. */
async function captureStdout(fn: () => Promise<void>): Promise<string> {
  const chunks: string[] = []
  const spy = jest.spyOn(process.stdout, 'write').mockImplementation((data) => {
    chunks.push(String(data))
    return true
  })
  try {
    await fn()
  } finally {
    spy.mockRestore()
  }
  return chunks.join('')
}

/** Boot a module, fire one info trigger, and return the captured NDJSON output. */
async function bootAndFire(
  moduleClass: new () => object,
): Promise<{ app: INestApplication; out: string }> {
  const moduleRef = await Test.createTestingModule({ imports: [moduleClass] }).compile()
  const app = moduleRef.createNestApplication()
  await app.init()
  const out = await captureStdout(async () => {
    await request(app.getHttpServer())
      .post('/trigger/level')
      .send({ level: 'info', count: 1 })
      .expect(201)
  })
  return { app, out }
}

describe('forRootAsync useClass (e2e)', () => {
  let app: INestApplication
  let out: string

  beforeAll(async () => {
    ;({ app, out } = await bootAndFire(AsyncUseClassModule))
  })

  afterAll(async () => {
    await app.close()
  })

  it('resolves options from the class factory and emits structured logs', () => {
    /**
     * Scenario: a module wired via `forRootAsync({ useClass: LoggerOptionsFactory })`.
     * Contract: the factory's `createLoggerOptions()` is honoured (service name appears)
     * and the injected logger emits the `TRIGGER_LEVEL_FIRED` structured key.
     */
    expect(out).toContain('TRIGGER_LEVEL_FIRED')
    expect(out).toContain('api-async-useclass')
  })

  it('auto-mounts the HTTP interceptor on the async path', () => {
    /**
     * Scenario: same boot as above.
     * Contract: `http.isEnabled: true` makes the library's async interceptor provider
     * mount, so `HTTP_REQUEST_START` is emitted even though registration was async.
     */
    expect(out).toContain('HTTP_REQUEST_START')
  })
})

describe('forRootAsync useFactory (e2e)', () => {
  let app: INestApplication
  let out: string

  beforeAll(async () => {
    ;({ app, out } = await bootAndFire(AsyncUseFactoryModule))
  })

  afterAll(async () => {
    await app.close()
  })

  it('resolves options lazily from the factory and emits structured logs', () => {
    /**
     * Scenario: a module wired via `forRootAsync({ useFactory })` (options typed as
     * `BymaxLoggerModuleAsyncOptions`).
     * Contract: the lazy factory resolves and the injected logger emits the structured key.
     */
    expect(out).toContain('TRIGGER_LEVEL_FIRED')
    expect(out).toContain('api-async-usefactory')
  })

  it('auto-mounts the HTTP interceptor on the useFactory async path', () => {
    /**
     * Scenario: same boot as above.
     * Contract: the async interceptor provider mounts on the useFactory path too.
     */
    expect(out).toContain('HTTP_REQUEST_START')
  })
})
