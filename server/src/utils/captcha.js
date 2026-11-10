// Built-in server-side CAPTCHA: simple arithmetic questions, no external
// service and no API keys. The answer lives ONLY in server memory, keyed by
// a random captchaId, with a 5-minute expiry and one-time use (the entry is
// deleted on the first verification attempt, pass or fail).
const crypto = require('crypto');

const TTL_MS = 5 * 60 * 1000;

// captchaId -> { answer, expiresAt }
const store = new Map();

function sweepExpired(now = Date.now()) {
  for (const [id, entry] of store) {
    if (entry.expiresAt <= now) store.delete(id);
  }
}

// Returns { captchaId, question } — e.g. { captchaId: '…', question: '7 + 5 = ?' }.
// The answer is never returned.
function createCaptcha() {
  sweepExpired();
  const a = 2 + Math.floor(Math.random() * 19); // 2..20
  const b = 2 + Math.floor(Math.random() * 19); // 2..20
  const add = Math.random() < 0.5;
  const question = add
    ? `${a} + ${b} = ?`
    : `${Math.max(a, b)} - ${Math.min(a, b)} = ?`;
  const answer = add ? a + b : Math.max(a, b) - Math.min(a, b);
  const captchaId = crypto.randomUUID();
  store.set(captchaId, { answer, expiresAt: Date.now() + TTL_MS });
  return { captchaId, question };
}

// One-time use: the entry is deleted on the first attempt, whether the
// answer is right, wrong or expired. Returns true only for the exact answer
// to a live (unexpired) captcha.
function verifyCaptcha(captchaId, answer) {
  if (typeof captchaId !== 'string' || captchaId.length === 0) return false;
  const entry = store.get(captchaId);
  if (!entry) return false;
  store.delete(captchaId);
  if (entry.expiresAt <= Date.now()) return false;
  const n = typeof answer === 'number' ? answer : Number(String(answer).trim());
  return Number.isInteger(n) && n === entry.answer;
}

module.exports = { createCaptcha, verifyCaptcha, TTL_MS };
