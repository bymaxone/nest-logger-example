/**
 * OpenTelemetry NodeSDK bootstrap — the FIRST import in `main.ts` (side-effecting).
 *
 * Layer: app/bootstrap. Starts the OTel SDK BEFORE any NestJS code loads so the
 * auto-instrumentations can patch `http`/Express/`pg` and every log line carries a
 * `traceId`. The OTel SDK packages are the CONSUMER's own dependencies — the
 * `@bymax-one/nest-logger` library only READS `@opentelemetry/api`.
 *
 * Constraints: no NestJS or `@bymax-one/nest-logger` import here (must run first),
 * and no termination logic — NestJS owns shutdown (see `main.ts`).
 */
import { getNodeAutoInstrumentations } from '@opentelemetry/auto-instrumentations-node'
import { OTLPTraceExporter } from '@opentelemetry/exporter-trace-otlp-http'
import { resourceFromAttributes } from '@opentelemetry/resources'
import { NodeSDK } from '@opentelemetry/sdk-node'
import { ATTR_SERVICE_NAME, ATTR_SERVICE_VERSION } from '@opentelemetry/semantic-conventions'

/**
 * The application's OpenTelemetry SDK instance. Exported so the single ordered
 * shutdown in `main.ts` can flush pending spans AFTER the log destinations drain.
 */
export const otelSdk = new NodeSDK({
  resource: resourceFromAttributes({
    [ATTR_SERVICE_NAME]: process.env.OTEL_SERVICE_NAME ?? 'nest-logger-example-api',
    [ATTR_SERVICE_VERSION]: process.env.RELEASE_SHA ?? 'dev',
    'deployment.environment': process.env.NODE_ENV ?? 'development',
  }),
  // `exactOptionalPropertyTypes` forbids passing `url: undefined`; only set it when the
  // env var is present so the exporter falls back to its own default otherwise.
  traceExporter: new OTLPTraceExporter(
    process.env.OTLP_TRACE_ENDPOINT ? { url: process.env.OTLP_TRACE_ENDPOINT } : {},
  ),
  instrumentations: [
    getNodeAutoInstrumentations({
      '@opentelemetry/instrumentation-fs': { enabled: false }, // noisy in dev
    }),
  ],
})

otelSdk.start()
// NOTE: no SIGTERM/process.exit here. NestJS owns termination (see main.ts); the SDK
// is flushed during the single ordered shutdown so spans drain AFTER the log
// destinations. A standalone process.exit(0) here would race app shutdown and cut off
// the final LokiDestination flush.
