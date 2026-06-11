/**
 * Security-headers end-to-end verification (hardening pass).
 *
 * Proves that the `helmet()` middleware wired into the application bootstrap
 * (`apps/api/src/main.ts`) applies the baseline secure-default response headers.
 * The bootstrap is not importable in isolation (it self-invokes and owns process
 * shutdown), so this spec mirrors its exact wiring — `app.use(helmet())` before the
 * routes — on a minimal app exposing `/health`, then asserts the headers on the
 * response. This is the standard NestJS pattern for testing bootstrap-level middleware.
 */
import type { INestApplication } from '@nestjs/common'
import { Test } from '@nestjs/testing'
import { afterAll, beforeAll, describe, expect, it } from '@jest/globals'
import helmet from 'helmet'
import request from 'supertest'

import { HealthModule } from '../src/health/health.module.js'

describe('security headers (helmet)', () => {
  let app: INestApplication

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [HealthModule] }).compile()
    app = moduleRef.createNestApplication()
    // Mirror the production bootstrap (main.ts): secure default headers before routes.
    app.use(helmet())
    await app.init()
  })

  afterAll(async () => {
    await app.close()
  })

  it('sets X-Content-Type-Options: nosniff on GET /health', async () => {
    /**
     * helmet's `noSniff` must set `x-content-type-options: nosniff` so browsers do
     * not MIME-sniff the JSON response — the baseline header the hardening pass pins.
     */
    const res = await request(app.getHttpServer()).get('/health').expect(200)
    expect(res.headers['x-content-type-options']).toBe('nosniff')
  })

  it('blocks framing and disables DNS prefetch on GET /health', async () => {
    /**
     * helmet sets `x-frame-options: SAMEORIGIN` (clickjacking defense) and
     * `x-dns-prefetch-control: off` (no implicit cross-origin DNS lookups).
     */
    const res = await request(app.getHttpServer()).get('/health').expect(200)
    expect(res.headers['x-frame-options']).toBe('SAMEORIGIN')
    expect(res.headers['x-dns-prefetch-control']).toBe('off')
  })

  it('removes the framework fingerprint on GET /health', async () => {
    /**
     * helmet removes Express's `x-powered-by` header so the framework is not
     * advertised to clients (no fingerprint to leak).
     */
    const res = await request(app.getHttpServer()).get('/health').expect(200)
    expect(res.headers['x-powered-by']).toBeUndefined()
  })
})
