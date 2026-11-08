const jwt = require('jsonwebtoken');
const config = require('../config');
function auth(req, res, next) {
  const header = req.headers.authorization || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : null;
  if (!token) return res.status(401).json({ error: { message: 'Login required', code: 'UNAUTHORIZED' } });
  try {
    req.userId = jwt.verify(token, config.jwtSecret).sub;
    return next();
  } catch {
    return res.status(401).json({ error: { message: 'Invalid or expired token', code: 'UNAUTHORIZED' } });
  }
}
module.exports = { auth };
