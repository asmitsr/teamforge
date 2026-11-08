const IdempotencyKey = require('../models/IdempotencyKey');
// Real idempotency, including under concurrency:
// 1. The first request ATOMICALLY claims the key (unique index insert
//    with a "processing" placeholder). A concurrent retry hits a duplicate
//    key error instead of running the handler a second time.
// 2. The retry then polls briefly for the finished response and replays it.
// 3. Only after the handler finishes do we store the real response.
// Trade-off: if the first request crashes mid-flight, the key stays
// "processing" until its 24h TTL expires. That is the safe side — we never
// run a payment-like mutation twice. (A production system would add a
// short processing timeout; documented in DESIGN.md.)
const POLL_MS = 100;
const POLL_TRIES = 30;
function sleep(ms) { return new Promise((r) => setTimeout(r, ms)); }
async function waitForCompletion(key, userId) {
  for (let i = 0; i < POLL_TRIES; i++) {
    const s = await IdempotencyKey.findOne({ key, user: userId }).lean();
    if (s && s.responseStatus !== 202) return s;
    await sleep(POLL_MS);
  }
  return null;
}
function withIdempotency(handler) {
  return async (req, res, next) => {
    const key = req.headers['idempotency-key'];
    if (!key || typeof key !== 'string') return handler(req, res, next);
    let stored = await IdempotencyKey.findOne({ key, user: req.userId }).lean();
    if (stored && stored.responseStatus !== 202) {
      res.set('X-Idempotent-Replay', 'true');
      return res.status(stored.responseStatus).json(stored.responseBody);
    }
    if (stored) { // another request is still processing this key
      const done = await waitForCompletion(key, req.userId);
      if (done) { res.set('X-Idempotent-Replay', 'true'); return res.status(done.responseStatus).json(done.responseBody); }
      return res.status(409).json({ error: { message: 'Same request already in progress', code: 'IDEMPOTENT_IN_PROGRESS' } });
    }
    try {
      await IdempotencyKey.create({ key, user: req.userId, endpoint: `${req.method} ${req.path}`,
        responseStatus: 202, responseBody: { status: 'processing' }, expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000) });
    } catch {
      // Lost the claim race — the other request owns this key now.
      const done = await waitForCompletion(key, req.userId);
      if (done) { res.set('X-Idempotent-Replay', 'true'); return res.status(done.responseStatus).json(done.responseBody); }
      return res.status(409).json({ error: { message: 'Same request already in progress', code: 'IDEMPOTENT_IN_PROGRESS' } });
    }
    const originalJson = res.json.bind(res);
    res.json = async (body) => {
      if (res.statusCode < 500) {
        try { await IdempotencyKey.updateOne({ key, user: req.userId }, { responseStatus: res.statusCode, responseBody: body }); } catch { /* ignore */ }
      }
      return originalJson(body);
    };
    return handler(req, res, next);
  };
}
module.exports = { withIdempotency };
