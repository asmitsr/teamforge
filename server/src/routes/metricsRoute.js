const express = require('express');
const metrics = require('../utils/metrics');
const router = express.Router();
router.get('/', (req, res) => res.json({ uptimeSeconds: Math.round((Date.now() - metrics.startedAt) / 1000),
  requests: metrics.requests, teamsCreated: metrics.teamsCreated, joinsSucceeded: metrics.joinsSucceeded,
  joinsRejected: metrics.joinsRejected, timestamp: new Date().toISOString() }));
module.exports = router;
