const rateLimit = require('express-rate-limit');
// General API limit: 300 requests / 15 min per IP.
const apiLimiter = rateLimit({ windowMs: 15 * 60 * 1000, limit: process.env.NODE_ENV === 'test' ? 10000 : 300, standardHeaders: 'draft-8', legacyHeaders: false,
  handler: (req, res) => res.status(429).json({ error: { message: 'Too many requests, slow down', code: 'RATE_LIMITED' } }) });
// Invite-code guessing: 5 attempts / 10 min per IP. With 32^8 possible
// codes, 5 tries per 10 minutes makes brute force useless.
const inviteLimiter = rateLimit({ windowMs: 10 * 60 * 1000, limit: process.env.NODE_ENV === 'test' ? 10000 : 5, standardHeaders: 'draft-8', legacyHeaders: false,
  handler: (req, res) => res.status(429).json({ error: { message: 'Too many invite attempts, try again later', code: 'RATE_LIMITED' } }) });
// Login/register: 20 attempts / 15 min per IP.
const authLimiter = rateLimit({ windowMs: 15 * 60 * 1000, limit: process.env.NODE_ENV === 'test' ? 10000 : 20, standardHeaders: 'draft-8', legacyHeaders: false,
  handler: (req, res) => res.status(429).json({ error: { message: 'Too many login attempts', code: 'RATE_LIMITED' } }) });
module.exports = { apiLimiter, inviteLimiter, authLimiter };
