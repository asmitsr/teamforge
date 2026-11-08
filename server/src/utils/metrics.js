// Tiny in-memory counters for /api/metrics. Not a replacement for real
// observability (Prometheus etc.) — just enough for the demo + load test.
const metrics = { startedAt: Date.now(), requests: 0, teamsCreated: 0, joinsSucceeded: 0, joinsRejected: 0 };
module.exports = metrics;
