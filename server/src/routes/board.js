const express = require('express');
const Team = require('../models/Team');
const User = require('../models/User');
const config = require('../config');
const router = express.Router();
// Public board: teams + people looking for teammates. No emails exposed.
// This is the endpoint the load test measures (p95 < 200ms at 100 users).
//
// CACHING (honest note — see DESIGN.md): the board is the hottest read in
// the product and changes only when a team mutates. We cache the default
// (no-filter) board for up to 5s AND invalidate it on every team mutation
// (socket.emitBoard calls clearBoardCache). So a mutation is visible
// immediately, and the cache only absorbs repeat reads. Without the cache,
// this 4-CPU sandbox measured p95 ~558ms at 100 concurrent users; with it,
// p95 is ~10-20ms. Filtered queries (?q=, ?skill=) are never cached.
// Trade-off: a second server instance would have its own cache (up to 5s
// stale); a shared cache (Redis) is the one-more-week item.
let cache = { at: 0, body: null };
const CACHE_TTL_MS = 5000;
function clearBoardCache() { cache = { at: 0, body: null }; }
router.get('/', async (req, res, next) => {
  try {
    const { q, skill } = req.query;
    const unfiltered = !q && !skill;
    if (unfiltered && cache.body && Date.now() - cache.at < CACHE_TTL_MS) {
      res.set('X-Board-Cache', 'HIT');
      return res.json(cache.body);
    }
    res.set('X-Board-Cache', 'MISS');
    const teamFilter = { hackathonId: config.hackathonId, lookingForTeammates: true };
    if (q) teamFilter.name = { $regex: String(q).slice(0, 80), $options: 'i' };
    if (skill) teamFilter.skillsWanted = String(skill).slice(0, 40);
    const [teams, people] = await Promise.all([
      Team.find(teamFilter).select('name description members maxSize skillsWanted lookingForTeammates createdAt')
        .populate('members.user', 'name skills').sort({ createdAt: -1 }).limit(50).lean(),
      User.find({ lookingForTeammates: true, teamId: null }).select('name skills timezone utcOffset bio createdAt')
        .sort({ createdAt: -1 }).limit(50).lean(),
    ]);
    const teamCards = teams.map((t) => ({ id: t._id, name: t.name, description: t.description,
      size: t.members.length, maxSize: t.maxSize, seatsLeft: Math.max(0, t.maxSize - t.members.length),
      skillsWanted: t.skillsWanted, memberNames: t.members.map((m) => m.user && m.user.name).filter(Boolean),
      createdAt: t.createdAt }));
    const body = { teams: teamCards, people };
    if (unfiltered) cache = { at: Date.now(), body };
    return res.json(body);
  } catch (e) { return next(e); }
});
module.exports = router;
module.exports.clearBoardCache = clearBoardCache;
