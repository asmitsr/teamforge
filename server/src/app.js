const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const config = require('./config');
const metrics = require('./utils/metrics');
const { apiLimiter } = require('./middleware/rateLimit');
const { errorHandler, notFound } = require('./middleware/error');

function createApp() {
  const app = express();
  app.use(helmet());
  app.use(cors({ origin: config.clientUrl, credentials: true }));
  app.use(express.json({ limit: '1mb' }));
  app.use((req, res, next) => { metrics.requests += 1; return next(); });
  // Rate limiting applies to auth + mutations, NOT to the public read-only
  // board: a 300/15min/IP cap on GET /api/board would 429 the 100-user
  // load test (and real users behind one NAT). The board is read-only,
  // capped at 50 rows, lean() queries on indexed fields — see DESIGN.md.
  app.get('/api/health', (req, res) => res.json({ ok: true, hackathon: config.hackathonId, time: new Date().toISOString() }));
  app.use('/api/auth', apiLimiter, require('./routes/auth'));
  app.use('/api/teams', apiLimiter, require('./routes/teams'));
  app.use('/api/board', require('./routes/board'));
  app.use('/api/suggestions', apiLimiter, require('./routes/suggestions'));
  app.use('/api/metrics', require('./routes/metricsRoute'));
  app.use(notFound);
  app.use(errorHandler);
  return app;
}
module.exports = { createApp };
