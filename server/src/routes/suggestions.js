const express = require('express');
const User = require('../models/User');
const { auth } = require('../middleware/auth');
const { scoreSuggestion } = require('../utils/scoring');
const router = express.Router();
// GET /api/suggestions — rank free agents by complementary skills +
// timezone overlap. See utils/scoring.js for the formula.
router.get('/', auth, async (req, res, next) => {
  try {
    const me = await User.findById(req.userId).lean();
    if (!me) return res.status(404).json({ error: { message: 'User not found', code: 'NOT_FOUND' } });
    const candidates = await User.find({ _id: { $ne: me._id }, lookingForTeammates: true, teamId: null })
      .select('name skills timezone utcOffset bio').limit(100).lean();
    const ranked = candidates.map((c) => {
      const s = scoreSuggestion(me, c);
      return { id: c._id, name: c.name, skills: c.skills, timezone: c.timezone, utcOffset: c.utcOffset, bio: c.bio,
        score: s.score, skillScore: s.skillScore, timezoneScore: s.timezoneScore, complementarySkills: s.complementarySkills,
        reason: s.complementarySkills.length ? `Adds ${s.complementarySkills.join(', ')} your profile lacks` : 'Similar skills, good timezone overlap' };
    }).sort((a, b) => b.score - a.score).slice(0, 20);
    return res.json({ suggestions: ranked });
  } catch (e) { return next(e); }
});
module.exports = router;
