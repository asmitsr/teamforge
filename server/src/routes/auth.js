const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { z } = require('zod');
const User = require('../models/User');
const config = require('../config');
const { validate } = require('../middleware/validate');
const { authLimiter } = require('../middleware/rateLimit');

const router = express.Router();
const registerSchema = z.object({
  name: z.string().min(2, 'Name is too short').max(80),
  email: z.string().email('Enter a valid email'),
  password: z.string().min(8, 'Password must be at least 8 characters').max(100),
  skills: z.array(z.string().min(1).max(40)).max(20).optional().default([]),
  timezone: z.string().max(60).optional().default('Asia/Dhaka'),
  utcOffset: z.number().min(-12).max(14).optional().default(6),
  bio: z.string().max(300).optional().default(''),
});
const loginSchema = z.object({ email: z.string().email(), password: z.string().min(1) });

function publicUser(u) {
  return { id: u._id, name: u.name, email: u.email, skills: u.skills, timezone: u.timezone,
    utcOffset: u.utcOffset, bio: u.bio, lookingForTeammates: u.lookingForTeammates, teamId: u.teamId };
}
function signToken(u) { return jwt.sign({ sub: String(u._id) }, config.jwtSecret, { expiresIn: '7d' }); }

router.post('/register', authLimiter, validate(registerSchema), async (req, res, next) => {
  try {
    const { name, email, password, skills, timezone, utcOffset, bio } = req.body;
    const existing = await User.findOne({ email }).lean();
    if (existing) return res.status(409).json({ error: { message: 'Email already registered', code: 'CONFLICT' } });
    const passwordHash = await bcrypt.hash(password, 10);
    const user = await User.create({ name, email, passwordHash, skills, timezone, utcOffset, bio });
    return res.status(201).json({ token: signToken(user), user: publicUser(user) });
  } catch (e) { return next(e); }
});
router.post('/login', authLimiter, validate(loginSchema), async (req, res, next) => {
  try {
    const { email, password } = req.body;
    const user = await User.findOne({ email });
    if (!user) return res.status(401).json({ error: { message: 'Wrong email or password', code: 'INVALID_CREDENTIALS' } });
    const ok = await bcrypt.compare(password, user.passwordHash);
    if (!ok) return res.status(401).json({ error: { message: 'Wrong email or password', code: 'INVALID_CREDENTIALS' } });
    return res.json({ token: signToken(user), user: publicUser(user) });
  } catch (e) { return next(e); }
});
module.exports = router;
