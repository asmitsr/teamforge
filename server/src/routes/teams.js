const express = require('express');
const mongoose = require('mongoose');
const { z } = require('zod');
const User = require('../models/User');
const Team = require('../models/Team');
const JoinRequest = require('../models/JoinRequest');
const AuditLog = require('../models/AuditLog');
const config = require('../config');
const { auth } = require('../middleware/auth');
const { validate } = require('../middleware/validate');
const { inviteLimiter } = require('../middleware/rateLimit');
const { withIdempotency } = require('../middleware/idempotency');
const { generateInviteCode } = require('../utils/inviteCode');
const { emitBoard, emitTeam } = require('../socket');
const metrics = require('../utils/metrics');
// Brute-force guard for invite codes, counted ONLY on wrong codes, so a
// legitimate race (50 correct-code joins at once) is never rate-limited.
// Key: IP + team. 5 wrong tries / 10 min, then 429. Correct-code joins
// and "team full" rejections never increment the counter.
const wrongCodeAttempts = new Map();
function wrongCodeAllowed(req, teamId) {
  const key = `${req.ip}:${teamId}`;
  const now = Date.now();
  const rec = wrongCodeAttempts.get(key);
  if (!rec || now > rec.resetAt) { wrongCodeAttempts.set(key, { count: 0, resetAt: now + 10 * 60 * 1000 }); return true; }
  return rec.count < 5;
}
function recordWrongCode(req, teamId) {
  const key = `${req.ip}:${teamId}`;
  const rec = wrongCodeAttempts.get(key);
  if (rec) rec.count += 1;
}

const router = express.Router();
const createSchema = z.object({ name: z.string().min(2).max(80), description: z.string().max(500).optional().default(''),
  skillsWanted: z.array(z.string().min(1).max(40)).max(20).optional().default([]),
  lookingForTeammates: z.boolean().optional().default(true) });
const joinSchema = z.object({ inviteCode: z.string().min(4).max(16) });
const requestSchema = z.object({ message: z.string().max(300).optional().default('') });

// Business error: thrown inside a transaction, converted to a JSON response outside.
function biz(status, message, code) { const e = new Error(message); e.status = status; e.code = code || 'CONFLICT'; return e; }
async function audit(session, teamId, actorId, action, details) {
  await AuditLog.create([{ hackathonId: config.hackathonId, team: teamId, actor: actorId, action, details: details || '' }], { session });
}
function publicTeam(t) {
  const o = t.toObject ? t.toObject() : t;
  return { ...o, id: o._id, size: (o.members || []).length, seatsLeft: Math.max(0, (o.maxSize || config.teamMaxSize) - (o.members || []).length) };
}
// Run fn inside a MongoDB transaction (needs a replica set — Atlas M0 in
// prod, MongoMemoryReplSet in tests). withTransaction retries automatically
// on transient write conflicts, so a racing join is re-checked, not lost.
async function runTx(fn) {
  const session = await mongoose.startSession();
  try { return await session.withTransaction(() => fn(session)); }
  finally { await session.endSession(); }
}
function handleBiz(res, e) {
  if (e && e.status) return res.status(e.status).json({ error: { message: e.message, code: e.code } });
  throw e;
}

// ---- Create a team (leader = creator) ----
router.post('/', auth, withIdempotency(async (req, res, next) => {
  try {
    const data = createSchema.parse(req.body);
    const result = await runTx(async (session) => {
      const me = await User.findById(req.userId).session(session);
      if (!me) throw biz(404, 'User not found', 'NOT_FOUND');
      if (me.teamId) throw biz(409, 'You are already in a team', 'ALREADY_IN_TEAM');
      const inviteCode = generateInviteCode();
      const [team] = await Team.create([{
        hackathonId: config.hackathonId, name: data.name, description: data.description,
        leader: me._id, members: [{ user: me._id, joinedAt: new Date() }], maxSize: config.teamMaxSize,
        inviteCode, inviteCodeExpiresAt: new Date(Date.now() + config.inviteTtlHours * 3600 * 1000),
        lookingForTeammates: data.lookingForTeammates, skillsWanted: data.skillsWanted,
      }], { session });
      await User.findByIdAndUpdate(me._id, { teamId: team._id, lookingForTeammates: false }, { session });
      await audit(session, team._id, me._id, 'team_created', `Team "${team.name}" created`);
      return team;
    });
    metrics.teamsCreated += 1;
    const full = await Team.findById(result._id).populate('members.user', 'name skills timezone utcOffset').populate('leader', 'name');
    emitBoard({ type: 'team_created', teamId: String(result._id) });
    return res.status(201).json({ team: publicTeam(full) });
  } catch (e) { if (e && e.status) return handleBiz(res, e); if (e && e.name === 'ZodError') return res.status(400).json({ error: { message: 'Invalid input', code: 'VALIDATION_ERROR' } }); return next(e); }
}));

// ---- My team ----
router.get('/mine', auth, async (req, res, next) => {
  try {
    const me = await User.findById(req.userId).lean();
    if (!me || !me.teamId) return res.json({ team: null });
    const team = await Team.findById(me.teamId).populate('members.user', 'name email skills timezone utcOffset bio').populate('leader', 'name email');
    if (!team) return res.json({ team: null });
    const requests = await JoinRequest.find({ team: team._id, status: 'pending' }).populate('user', 'name skills timezone utcOffset bio').sort({ createdAt: 1 });
    return res.json({ team: publicTeam(team), pendingRequests: requests });
  } catch (e) { return next(e); }
});

// ---- Team detail ----
router.get('/:id', auth, async (req, res, next) => {
  try {
    const team = await Team.findById(req.params.id).populate('members.user', 'name email skills timezone utcOffset bio').populate('leader', 'name email');
    if (!team) return res.status(404).json({ error: { message: 'Team not found', code: 'NOT_FOUND' } });
    const isMember = team.members.some((m) => String(m.user._id) === String(req.userId));
    const requests = isMember ? await JoinRequest.find({ team: team._id, status: 'pending' }).populate('user', 'name skills timezone utcOffset bio').sort({ createdAt: 1 }) : [];
    return res.json({ team: publicTeam(team), pendingRequests: requests, isMember });
  } catch (e) { return next(e); }
});

// ---- Join with invite code (the race-proof path) ----
router.post('/:id/join', auth, withIdempotency(async (req, res, next) => {
  try {
    const { inviteCode } = joinSchema.parse(req.body);
    const team = await Team.findById(req.params.id);
    if (!team) return res.status(404).json({ error: { message: 'Team not found', code: 'NOT_FOUND' } });
    if (team.inviteCode !== inviteCode) {
      if (!wrongCodeAllowed(req, team._id)) return res.status(429).json({ error: { message: 'Too many wrong invite attempts, try again later', code: 'RATE_LIMITED' } });
      recordWrongCode(req, team._id);
      metrics.joinsRejected += 1;
      return res.status(400).json({ error: { message: 'Wrong invite code', code: 'INVALID_INVITE' } });
    }
    if (team.inviteCodeExpiresAt < new Date()) return res.status(410).json({ error: { message: 'Invite code expired', code: 'INVITE_EXPIRED' } });
    try {
      const updated = await runTx(async (session) => {
        const me = await User.findById(req.userId).session(session);
        if (!me) throw biz(404, 'User not found', 'NOT_FOUND');
        if (me.teamId) throw biz(409, 'You are already in a team', 'ALREADY_IN_TEAM');
        // ONE atomic conditional update: only matches while the team still
        // has a free seat and the user is not already a member. Two
        // concurrent joins both try to modify the same document — MongoDB
        // aborts one with a write conflict, and withTransaction retries it,
        // at which point the seat is gone and it fails with 409. Exactly
        // one of 50 concurrent joiners can ever succeed.
        const now = new Date();
        const next = await Team.findOneAndUpdate(
          { _id: team._id, inviteCodeExpiresAt: { $gt: now }, 'members.user': { $ne: new mongoose.Types.ObjectId(req.userId) },
            $expr: { $lt: [{ $size: '$members' }, team.maxSize] } },
          { $push: { members: { user: new mongoose.Types.ObjectId(req.userId), joinedAt: now } } },
          { session, new: true });
        if (!next) throw biz(409, 'Team is full', 'TEAM_FULL');
        await User.findByIdAndUpdate(req.userId, { teamId: team._id, lookingForTeammates: false }, { session });
        await audit(session, team._id, req.userId, 'member_joined', 'Joined with invite code');
        return next;
      });
      metrics.joinsSucceeded += 1;
      const full = await Team.findById(updated._id).populate('members.user', 'name skills timezone utcOffset').populate('leader', 'name');
      emitBoard({ type: 'member_joined', teamId: String(team._id) });
      emitTeam(team._id, { type: 'member_joined', team: publicTeam(full) });
      return res.json({ team: publicTeam(full) });
    } catch (e) { if (e && e.status) return handleBiz(res, e); throw e; }
  } catch (e) { if (e && e.name === 'ZodError') return res.status(400).json({ error: { message: 'Invalid input', code: 'VALIDATION_ERROR' } }); return next(e); }
}));

// ---- Ask to join (leader approves later) ----
router.post('/:id/request', auth, withIdempotency(async (req, res, next) => {
  try {
    const { message } = requestSchema.parse(req.body);
    const team = await Team.findById(req.params.id);
    if (!team) return res.status(404).json({ error: { message: 'Team not found', code: 'NOT_FOUND' } });
    const me = await User.findById(req.userId);
    if (!me) return res.status(404).json({ error: { message: 'User not found', code: 'NOT_FOUND' } });
    if (me.teamId) return res.status(409).json({ error: { message: 'You are already in a team', code: 'ALREADY_IN_TEAM' } });
    if (team.members.some((m) => String(m.user) === String(req.userId))) return res.status(409).json({ error: { message: 'You are already a member', code: 'ALREADY_MEMBER' } });
    const pending = await JoinRequest.findOne({ team: team._id, user: req.userId, status: 'pending' });
    if (pending) return res.status(409).json({ error: { message: 'Request already pending', code: 'ALREADY_REQUESTED' } });
    const jr = await JoinRequest.create({ team: team._id, user: req.userId, message });
    emitTeam(team._id, { type: 'join_requested', requestId: String(jr._id) });
    return res.status(201).json({ request: jr });
  } catch (e) { if (e && e.name === 'ZodError') return res.status(400).json({ error: { message: 'Invalid input', code: 'VALIDATION_ERROR' } }); return next(e); }
}));

// ---- Leader accepts a join request (race-proof: same atomic seat check) ----
router.post('/:id/requests/:requestId/accept', auth, withIdempotency(async (req, res, next) => {
  try {
    const out = await runTx(async (session) => {
      const team = await Team.findById(req.params.id).session(session);
      if (!team) throw biz(404, 'Team not found', 'NOT_FOUND');
      if (String(team.leader) !== String(req.userId)) throw biz(403, 'Only the leader can accept requests', 'FORBIDDEN');
      const jr = await JoinRequest.findOneAndUpdate({ _id: req.params.requestId, team: team._id, status: 'pending' },
        { status: 'accepted' }, { session, new: true });
      if (!jr) throw biz(409, 'Request is no longer pending', 'REQUEST_NOT_PENDING');
      const applicant = await User.findById(jr.user).session(session);
      if (!applicant || applicant.teamId) throw biz(409, 'Applicant already joined another team', 'ALREADY_IN_TEAM');
      const now = new Date();
      const next = await Team.findOneAndUpdate({ _id: team._id, $expr: { $lt: [{ $size: '$members' }, team.maxSize] } },
        { $push: { members: { user: applicant._id, joinedAt: now } } }, { session, new: true });
      if (!next) throw biz(409, 'Team is full', 'TEAM_FULL');
      await User.findByIdAndUpdate(applicant._id, { teamId: team._id, lookingForTeammates: false }, { session });
      await audit(session, team._id, req.userId, 'request_accepted', `Accepted ${applicant.name}`);
      return next;
    });
    const full = await Team.findById(out._id).populate('members.user', 'name skills timezone utcOffset').populate('leader', 'name');
    emitBoard({ type: 'member_joined', teamId: String(out._id) }); emitTeam(out._id, { type: 'member_joined', team: publicTeam(full) });
    return res.json({ team: publicTeam(full) });
  } catch (e) { if (e && e.status) return handleBiz(res, e); return next(e); }
}));

// ---- Leader declines a join request ----
router.post('/:id/requests/:requestId/decline', auth, async (req, res, next) => {
  try {
    const team = await Team.findById(req.params.id);
    if (!team) return res.status(404).json({ error: { message: 'Team not found', code: 'NOT_FOUND' } });
    if (String(team.leader) !== String(req.userId)) return res.status(403).json({ error: { message: 'Only the leader can decline requests', code: 'FORBIDDEN' } });
    const jr = await JoinRequest.findOneAndUpdate({ _id: req.params.requestId, team: team._id, status: 'pending' }, { status: 'declined' }, { new: true });
    if (!jr) return res.status(409).json({ error: { message: 'Request is no longer pending', code: 'REQUEST_NOT_PENDING' } });
    await AuditLog.create({ hackathonId: config.hackathonId, team: team._id, actor: req.userId, action: 'request_declined', details: 'Declined a join request' });
    emitTeam(team._id, { type: 'join_declined', requestId: String(jr._id) });
    return res.json({ request: jr });
  } catch (e) { return next(e); }
});

// ---- Leave a team (leader transfer / last-member delete) ----
router.post('/:id/leave', auth, withIdempotency(async (req, res, next) => {
  try {
    const result = await runTx(async (session) => {
      const team = await Team.findById(req.params.id).session(session);
      if (!team) throw biz(404, 'Team not found', 'NOT_FOUND');
      const idx = team.members.findIndex((m) => String(m.user) === String(req.userId));
      if (idx === -1) throw biz(409, 'You are not a member of this team', 'NOT_A_MEMBER');
      const wasLeader = String(team.leader) === String(req.userId);
      const remaining = team.members.filter((m) => String(m.user) !== String(req.userId));
      await User.findByIdAndUpdate(req.userId, { teamId: null, lookingForTeammates: true }, { session });
      if (remaining.length === 0) {
        // Last member leaving deletes the team — no empty ghost teams.
        await Team.deleteOne({ _id: team._id }, { session });
        await JoinRequest.deleteMany({ team: team._id, status: 'pending' }, { session });
        await audit(session, team._id, req.userId, 'team_deleted', `Last member left; team "${team.name}" deleted`);
        return { deleted: true, teamId: String(team._id) };
      }
      // Leadership passes to the oldest remaining member (earliest joinedAt).
      let newLeader = team.leader;
      if (wasLeader) {
        newLeader = [...remaining].sort((a, b) => new Date(a.joinedAt) - new Date(b.joinedAt))[0].user;
      }
      await Team.findByIdAndUpdate(team._id, { members: remaining, leader: newLeader }, { session });
      await audit(session, team._id, req.userId, 'member_left', wasLeader ? `Leader left; leadership passed on` : 'Member left');
      if (wasLeader) await audit(session, team._id, newLeader, 'leader_changed', 'Leadership transferred to oldest remaining member');
      return { deleted: false, teamId: String(team._id), newLeader: String(newLeader) };
    });
    emitBoard({ type: 'member_left', teamId: result.teamId });
    emitTeam(result.teamId, { type: 'member_left' });
    return res.json(result);
  } catch (e) { if (e && e.status) return handleBiz(res, e); return next(e); }
}));

// ---- Leader removes a member ----
router.post('/:id/remove/:userId', auth, async (req, res, next) => {
  try {
    const team = await Team.findById(req.params.id);
    if (!team) return res.status(404).json({ error: { message: 'Team not found', code: 'NOT_FOUND' } });
    if (String(team.leader) !== String(req.userId)) return res.status(403).json({ error: { message: 'Only the leader can remove members', code: 'FORBIDDEN' } });
    if (String(req.params.userId) === String(req.userId)) return res.status(400).json({ error: { message: 'Leader cannot remove themself — leave the team instead', code: 'VALIDATION_ERROR' } });
    const target = team.members.find((m) => String(m.user) === String(req.params.userId));
    if (!target) return res.status(404).json({ error: { message: 'User is not a member', code: 'NOT_FOUND' } });
    const session = await mongoose.startSession();
    try {
      await session.withTransaction(async () => {
        await Team.findByIdAndUpdate(team._id, { $pull: { members: { user: new mongoose.Types.ObjectId(req.params.userId) } } }, { session });
        await User.findByIdAndUpdate(req.params.userId, { teamId: null, lookingForTeammates: true }, { session });
        await AuditLog.create([{ hackathonId: config.hackathonId, team: team._id, actor: req.userId, action: 'member_removed', details: 'Leader removed a member' }], { session });
      });
    } finally { await session.endSession(); }
    emitTeam(team._id, { type: 'member_removed' });
    emitBoard({ type: 'member_removed', teamId: String(team._id) });
    return res.json({ ok: true });
  } catch (e) { return next(e); }
});

// ---- Leader regenerates the invite code (rate-limited) ----
router.post('/:id/regenerate-invite', auth, inviteLimiter, async (req, res, next) => {
  try {
    const team = await Team.findById(req.params.id);
    if (!team) return res.status(404).json({ error: { message: 'Team not found', code: 'NOT_FOUND' } });
    if (String(team.leader) !== String(req.userId)) return res.status(403).json({ error: { message: 'Only the leader can regenerate the invite code', code: 'FORBIDDEN' } });
    team.inviteCode = generateInviteCode();
    team.inviteCodeExpiresAt = new Date(Date.now() + config.inviteTtlHours * 3600 * 1000);
    await team.save();
    await AuditLog.create({ hackathonId: config.hackathonId, team: team._id, actor: req.userId, action: 'invite_regenerated', details: 'New invite code issued' });
    return res.json({ inviteCode: team.inviteCode, inviteCodeExpiresAt: team.inviteCodeExpiresAt });
  } catch (e) { return next(e); }
});

// ---- Audit log for a team (members only) ----
router.get('/:id/audit', auth, async (req, res, next) => {
  try {
    const team = await Team.findById(req.params.id).lean();
    if (!team) return res.status(404).json({ error: { message: 'Team not found', code: 'NOT_FOUND' } });
    if (!team.members.some((m) => String(m.user) === String(req.userId))) return res.status(403).json({ error: { message: 'Only members can see the audit log', code: 'FORBIDDEN' } });
    const logs = await AuditLog.find({ team: team._id }).populate('actor', 'name').sort({ createdAt: -1 }).limit(100);
    return res.json({ logs });
  } catch (e) { return next(e); }
});
module.exports = router;
