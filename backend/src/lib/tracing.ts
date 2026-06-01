/**
 * OpenTelemetry distributed tracing.
 *
 * Initialised first (before Express/http/pg are required) so the auto
 * instrumentations can patch them. The whole SDK is loaded lazily and only when
 * OTEL_ENABLED is set, so a default deployment pulls in none of it.
 *
 * Exported spans carry W3C trace context, which the auto HTTP instrumentation
 * propagates to upstream targets via the `traceparent` header — giving you a
 * single trace across ClusterGate and the services it proxies to.
 */
import { config } from '../config'

let started = false

export function initTracing(): void {
  if (started || !config.OTEL_ENABLED) return
  started = true

  try {
    // Lazy requires — keep the SDK out of the default code path entirely.
    const { NodeSDK } = require('@opentelemetry/sdk-node')
    const { getNodeAutoInstrumentations } = require('@opentelemetry/auto-instrumentations-node')
    const { OTLPTraceExporter } = require('@opentelemetry/exporter-trace-otlp-http')
    const { resourceFromAttributes } = require('@opentelemetry/resources')
    const { ATTR_SERVICE_NAME, ATTR_SERVICE_VERSION } = require('@opentelemetry/semantic-conventions')
    const { getVersion } = require('./version')

    const exporter = new OTLPTraceExporter({
      // Falls back to the SDK default (http://localhost:4318/v1/traces) when unset
      url: config.OTEL_EXPORTER_OTLP_ENDPOINT
        ? `${config.OTEL_EXPORTER_OTLP_ENDPOINT.replace(/\/$/, '')}/v1/traces`
        : undefined,
    })

    const sdk = new NodeSDK({
      resource: resourceFromAttributes({
        [ATTR_SERVICE_NAME]: config.OTEL_SERVICE_NAME,
        [ATTR_SERVICE_VERSION]: getVersion(),
      }),
      traceExporter: exporter,
      instrumentations: [
        getNodeAutoInstrumentations({
          // High-volume, low-value internal spans — keep traces readable
          '@opentelemetry/instrumentation-fs': { enabled: false },
          '@opentelemetry/instrumentation-dns': { enabled: false },
        }),
      ],
    })

    sdk.start()

    // Flush spans on shutdown so the last requests aren't lost
    const shutdown = () => { sdk.shutdown().catch(() => {}) }
    process.once('SIGTERM', shutdown)
    process.once('SIGINT', shutdown)

    // eslint-disable-next-line no-console
    console.log(`[otel] tracing enabled → ${config.OTEL_EXPORTER_OTLP_ENDPOINT || 'http://localhost:4318'}`)
  } catch (err) {
    // Never let tracing setup take down the process
    // eslint-disable-next-line no-console
    console.error('[otel] failed to initialise tracing', (err as Error).message)
  }
}

/**
 * Returns the active trace/span IDs, or undefined when no span is active or
 * tracing is disabled. Used to enrich structured logs for correlation.
 */
export function getTraceContext(): { trace_id: string; span_id: string } | undefined {
  if (!config.OTEL_ENABLED) return undefined
  try {
    const api = require('@opentelemetry/api')
    const span = api.trace.getActiveSpan()
    if (!span) return undefined
    const ctx = span.spanContext()
    if (!ctx?.traceId) return undefined
    return { trace_id: ctx.traceId, span_id: ctx.spanId }
  } catch {
    return undefined
  }
}
