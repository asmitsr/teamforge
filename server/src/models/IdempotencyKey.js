const mongoose = require('mongoose');
// A retried request (double-click, flaky network) sends the same
// Idempotency-Key header. We store the first response and replay it,
// so the second request never runs the handler again.
// Rows expire automatically (TTL index on expiresAt).
const idempotencySchema = new mongoose.Schema({
  key: { type: String, required: true, unique: true },
  user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  endpoint: { type: String, required: true },
  responseStatus: { type: Number, required: true },
  responseBody: { type: mongoose.Schema.Types.Mixed, required: true },
  expiresAt: { type: Date, required: true },
}, { timestamps: true });
idempotencySchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });
module.exports = mongoose.model('IdempotencyKey', idempotencySchema);
