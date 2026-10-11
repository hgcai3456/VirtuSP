"use strict";

// Loaded only when an OTLP endpoint is configured. Missing packages leave the
// in-process tracer in place. Domain metrics stay on the EMF path and are not
// exported by this SDK.

function start() {
  const endpoint = process.env.OTEL_EXPORTER_OTLP_TRACES_ENDPOINT;
  if (!endpoint) return { started: false, reason: "no_endpoint" };
  const { NodeTracerProvider } = require("@opentelemetry/sdk-trace-node");
  const { BatchSpanProcessor } = require("@opentelemetry/sdk-trace-base");
  const { OTLPTraceExporter } = require("@opentelemetry/exporter-trace-otlp-http");
  const { Resource } = require("@opentelemetry/resources");
  const exporter = new OTLPTraceExporter({
    url: endpoint,
    timeoutMillis: 5000,
  });
  const processor = new BatchSpanProcessor(exporter, {
    maxQueueSize: 2048,
    maxExportBatchSize: 128,
    scheduledDelayMillis: 5000,
    exportTimeoutMillis: 5000,
  });
  const resource = new Resource({
    "service.name": "virtusp",
    "aws.local.service": "virtusp",
  });
  let provider;
  try {
    provider = new NodeTracerProvider({
      resource,
      spanProcessors: [processor],
    });
  } catch {
    provider = new NodeTracerProvider({ resource });
    provider.addSpanProcessor(processor);
  }
  provider.register();
  return { started: true, provider };
}

module.exports = { start };
