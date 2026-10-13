const client = require("prom-client");

// Collect default Node.js metrics
client.collectDefaultMetrics({
    prefix: "task_manager_",
    eventLoopMonitoringPrecision: 10,
});

module.exports = client;