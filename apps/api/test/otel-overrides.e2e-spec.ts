/**
 * OtelOptions field-override + disable gate.
 *
 * The `otel-correlation` suite proves the camelCase/snake_case shortcuts; this one proves
 * the two OtelOptions behaviours that suite leaves open:
 *   - per-field overrides (`traceIdField` / `spanIdField` / `traceFlagsField`) ALWAYS win
 *     over the `fieldFormat` shortcut — asserted with custom `dd.*` field names;
 *   - `shouldAutoInjectTraceContext: false` injects NO trace fields even with an active span.
 *
 * A single NodeSDK is started for the whole suite (only one global tracer may be registered);
 * two Nest apps share it with different logger `otel` options.
 */
import type { INestApplication } from '@nestjs/common'
import { Controller, Module, Post } from '@nestjs/common'
import { Test } from '@nestjs/testing'
import { BymaxLoggerModule, InjectLogger, PinoLoggerService } from '@bymax-one/nest-logger'
import { getNodeAutoInstrumentations } from '@opentelemetry/auto-instrumentations-node'
import { trace } from '@opentelemetry/api'
import { NodeSDK } from '@opentelemetry/sdk-node'
import { InMemorySpanExporter, SimpleSpanProcessor } from '@opentelemetry/sdk-trace-base'
import { jest } from '@jest/globals'
import request from 'supertest'

/** Emits a domain log inside a real active span so trace context is available to inject. */
@Controller('otel-ovr')
class OtelOverrideProbe {
  constructor(@InjectLogger('OtelOverrideProbe') private readonly logger: PinoLoggerService) {}

  @Post('fire')
  fire(): { ok: boolean } {
    const tracer = trace.getTracer('otel-ovr')
    return tracer.startActiveSpan('otel-ovr-fire', (span) => {
      this.logger.info('OTEL_PROBE_FIRED', 'override probe domain log')
      span.end()
      return { ok: true as const }
    })
  }
}

@Module({
  imports: [
    BymaxLoggerModule.forRoot({
      service: { name: 'otel-ovr-e2e', version: 'test' },
      isPretty: false,
      level: 'info',
      isGlobal: true,
      shouldUseAsNestLogger: false,
      otel: {
        shouldAutoInjectTraceContext: true,
        fieldFormat: 'camelCase', // overrides below must win over this shortcut
        traceIdField: 'dd.trace_id',
        spanIdField: 'dd.span_id',
        traceFlagsField: 'dd.trace_flags',
      },
    }),
  ],
  controllers: [OtelOverrideProbe],
})
class OverridesModule {}

@Module({
  imports: [
    BymaxLoggerModule.forRoot({
      service: { name: 'otel-disabled-e2e', version: 'test' },
      isPretty: false,
      level: 'info',
      isGlobal: true,
      shouldUseAsNestLogger: false,
      otel: { shouldAutoInjectTraceContext: false }, // injection OFF even with an active span
    }),
  ],
  controllers: [OtelOverrideProbe],
})
class DisabledModule {}

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

describe('OtelOptions overrides + disable (e2e)', () => {
  let sdk: NodeSDK
  let overridesApp: INestApplication
  let disabledApp: INestApplication

  beforeAll(async () => {
    // One global SDK so `trace.getTracer()` returns a real tracer producing valid ids.
    const exporter = new InMemorySpanExporter()
    sdk = new NodeSDK({
      traceExporter: exporter,
      spanProcessors: [new SimpleSpanProcessor(exporter)],
      instrumentations: [
        getNodeAutoInstrumentations({ '@opentelemetry/instrumentation-fs': { enabled: false } }),
      ],
    })
    sdk.start()

    overridesApp = (
      await Test.createTestingModule({ imports: [OverridesModule] }).compile()
    ).createNestApplication()
    await overridesApp.init()

    disabledApp = (
      await Test.createTestingModule({ imports: [DisabledModule] }).compile()
    ).createNestApplication()
    await disabledApp.init()
  })

  afterAll(async () => {
    await overridesApp.close()
    await disabledApp.close()
    await sdk.shutdown()
  })

  it('emits trace context under the custom dd.* field names (overrides win over fieldFormat)', async () => {
    /**
     * Scenario: a log inside an active span with `traceIdField:'dd.trace_id'` etc.
     * Contract: the entry carries `dd.trace_id` (32 hex), `dd.span_id` (16 hex) and
     * `dd.trace_flags`, and NOT the camelCase shortcut names — proving per-field overrides
     * take precedence over `fieldFormat`.
     */
    const out = await captureStdout(async () => {
      await request(overridesApp.getHttpServer()).post('/otel-ovr/fire').expect(201)
    })

    expect(out).toMatch(/"dd\.trace_id":"[0-9a-f]{32}"/)
    expect(out).toMatch(/"dd\.span_id":"[0-9a-f]{16}"/)
    expect(out).toContain('"dd.trace_flags":')
    expect(out).not.toContain('"traceId":')
    expect(out).not.toContain('"spanId":')
  })

  it('injects NO trace fields when shouldAutoInjectTraceContext is false', async () => {
    /**
     * Scenario: the same active-span probe, but with injection disabled.
     * Contract: the log still emits (`OTEL_PROBE_FIRED`) but carries NO trace fields under
     * any name — proving the disable switch suppresses injection even when a span is active.
     */
    const out = await captureStdout(async () => {
      await request(disabledApp.getHttpServer()).post('/otel-ovr/fire').expect(201)
    })

    expect(out).toContain('OTEL_PROBE_FIRED')
    expect(out).not.toContain('"traceId":')
    expect(out).not.toContain('"dd.trace_id":')
    expect(out).not.toContain('"spanId":')
  })
})
