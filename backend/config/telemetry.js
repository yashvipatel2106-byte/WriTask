"use strict";

const { NodeSDK } = require("@opentelemetry/sdk-node");
const {
  getNodeAutoInstrumentations,
} = require("@opentelemetry/auto-instrumentations-node");
const {
  PrometheusExporter,
} = require("@opentelemetry/exporter-prometheus");

const prometheusExporter = new PrometheusExporter({
  preventServerStart: true,
});

const sdk = new NodeSDK({
  serviceName: "writask-backend",

  metricReader: prometheusExporter,

  instrumentations: [
    getNodeAutoInstrumentations({
      "@opentelemetry/instrumentation-fs": {
        enabled: false,
      },
    }),
  ],
});

sdk.start();

console.log("✅ OpenTelemetry initialized");
console.log("📊 Metrics endpoint enabled at /metrics");

module.exports = {
  sdk,
  getMetricsRequestHandler: (req, res) => prometheusExporter.getMetricsRequestHandler(req, res),
};
