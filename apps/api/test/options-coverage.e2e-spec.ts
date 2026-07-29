/**
 * Module-option coverage gate — option behaviours the structured suites leave implicit.
 *
 * Asserts the RUNTIME effect (not just the config value) of:
 *   - a NON-default `redactCensor` ('***') actually replacing redacted values, proving the
 *     option overrides the library default rather than coincidentally matching it;
 *   - `isGlobal: false` being a valid registration: a controller in the module that imports
 *     the non-global logger can still inject and use it.
 *
 * Technique mirrors the other e2e specs: capture `process.stdout.write` for one request.
 */
import type { INestApplication } from '@nestjs/common'
import { Controller, Module, Post } from '@nestjs/common'
import { Test } from '@nestjs/testing'
import { BymaxLoggerModule, InjectLogger, PinoLoggerService } from '@bymax-one/nest-logger'
import { jest } from '@jest/globals'
import request from 'supertest'

/** A secret value that MUST be censored — unique so the assertion is unambiguous. */
const SECRET = 'super-secret-xyz-9471'
/** The non-default censor under test (the library default is `[REDACTED]`). */
const CUSTOM_CENSOR = '***'

/** Probe controller that emits a nested default-redact field and a plain structured log. */
@Controller()
class ProbeController {
  constructor(@InjectLogger(ProbeController.name) private readonly logger: PinoLoggerService) {}

  /** Log a nested `user.password` (matches the default `*.password` redact path). */
  @Post('redact-probe')
  redactProbe(): { ok: boolean } {
    this.logger.info('PROBE_REDACT_DONE', 'probe redaction', undefined, {
      user: { password: SECRET },
    })
    return { ok: true }
  }

  /** Emit any structured log — used to prove the non-global logger is injectable. */
  @Post('global-probe')
  globalProbe(): { ok: boolean } {
    this.logger.info('PROBE_GLOBAL_DONE', 'probe non-global', undefined, { ok: true })
    return { ok: true }
  }
}

@Module({
  imports: [
    BymaxLoggerModule.forRoot({
      service: { name: 'api-redactcensor-e2e', version: 'test' },
      isPretty: false,
      level: 'info',
      isGlobal: true,
      shouldUseAsNestLogger: false,
      redactCensor: CUSTOM_CENSOR, // distinct from the library default '[REDACTED]'
    }),
  ],
  controllers: [ProbeController],
})
class RedactCensorModule {}

@Module({
  imports: [
    BymaxLoggerModule.forRoot({
      service: { name: 'api-nonglobal-e2e', version: 'test' },
      isPretty: false,
      level: 'info',
      isGlobal: false, // NOT global — only modules importing this one see the logger
      shouldUseAsNestLogger: false,
    }),
  ],
  // The controller lives in the SAME module that imports the non-global logger, so its
  // exported providers are in scope here — proving isGlobal:false is a working registration.
  controllers: [ProbeController],
})
class NonGlobalModule {}

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

describe('redactCensor override (e2e)', () => {
  let app: INestApplication

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [RedactCensorModule] }).compile()
    app = moduleRef.createNestApplication()
    await app.init()
  })

  afterAll(async () => {
    await app.close()
  })

  it('replaces redacted values with the custom censor, not the library default', async () => {
    /**
     * Scenario: a log carries a nested `user.password` while `redactCensor: '***'`.
     * Contract: the emitted line shows `***` in place of the secret, the raw secret never
     * appears, and the default `[REDACTED]` censor is NOT used — proving the override wins.
     */
    const out = await captureStdout(async () => {
      await request(app.getHttpServer()).post('/redact-probe').expect(201)
    })

    expect(out).toContain(CUSTOM_CENSOR)
    expect(out).not.toContain(SECRET)
    expect(out).not.toContain('[REDACTED]')
  })
})

describe('isGlobal:false registration (e2e)', () => {
  let app: INestApplication

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [NonGlobalModule] }).compile()
    app = moduleRef.createNestApplication()
    await app.init()
  })

  afterAll(async () => {
    await app.close()
  })

  it('injects and uses the logger when registered non-globally', async () => {
    /**
     * Scenario: `forRoot({ isGlobal: false })` with a controller in the importing module.
     * Contract: the logger is still injectable within that module's scope and emits the
     * structured key — proving non-global registration is a valid, working pattern (the
     * example otherwise only ever shows isGlobal:true).
     */
    const out = await captureStdout(async () => {
      await request(app.getHttpServer()).post('/global-probe').expect(201)
    })

    expect(out).toContain('PROBE_GLOBAL_DONE')
  })
})
