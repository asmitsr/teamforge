const mongoose = require('mongoose');
const { init, close, registerUser, createTeam, getTeam } = require('./setup');
const Team = require('../src/models/Team');
const User = require('../src/models/User');
const AuditLog = require('../src/models/AuditLog');

let api;
beforeAll(async () => { api = await init(); }, 300000);
afterAll(async () => { await close(); }, 120000);
function auth(token) { return { Authorization: `Bearer ${token}` }; }

// Register many users fast (batches of 10 in parallel).
async function registerMany(count, tag) {
  const out = [];
  for (let i = 0; i < count; i += 10) {
    const batch = await Promise.all(Array.from({ length: Math.min(10, count - i) }, (_, j) =>
      registerUser(api, { name: `${tag}-${i + j}`, skills: ['React'] })));
    out.push(...batch);
  }
  return out;
}

describe('race-proof joins', () => {
  test('50 people race for the last seat: exactly 1 succeeds, 49 fail, size is 4', async () => {
    const leader = await registerUser(api);
    const team = await createTeam(api, leader.token, { name: 'Race Team' });
    // Fill to 3 of 4: one seat left.
    for (let i = 0; i < 2; i++) {
      const m = await registerUser(api);
      const r = await api.post(`/api/teams/${team.id}/join`).set(auth(m.token)).send({ inviteCode: team.inviteCode });
      expect(r.status).toBe(200);
    }
    const racers = await registerMany(50, 'racer');
    const results = await Promise.all(racers.map((u) =>
      api.post(`/api/teams/${team.id}/join`).set(auth(u.token)).send({ inviteCode: team.inviteCode })));
    const ok = results.filter((r) => r.status === 200);
    const full = results.filter((r) => r.status === 409 && r.body.error && r.body.error.code === 'TEAM_FULL');
    expect(ok.length).toBe(1);
    expect(full.length).toBe(49);
    const after = await getTeam(api, leader.token, team.id);
    expect(after.size).toBe(4);
    const memberIds = after.members.map((m) => String(m.user._id || m.user.id || m.user));
    expect(new Set(memberIds).size).toBe(4); // no duplicate members
    const inTeam = await User.countDocuments({ teamId: new mongoose.Types.ObjectId(team.id) });
    expect(inTeam).toBe(4);
  }, 300000);

  test('one person racing to join 10 teams at once lands in exactly 1 team', async () => {
    const teams = [];
    for (let i = 0; i < 10; i++) {
      const leader = await registerUser(api);
      teams.push(await createTeam(api, leader.token, { name: `Multi-${i}` }));
    }
    const solo = await registerUser(api);
    const results = await Promise.all(teams.map((t) =>
      api.post(`/api/teams/${t.id}/join`).set(auth(solo.token)).send({ inviteCode: t.inviteCode })));
    const ok = results.filter((r) => r.status === 200);
    expect(ok.length).toBe(1);
    const me = await User.findById(solo.user.id).lean();
    expect(me.teamId).toBeTruthy();
    const memberships = await Team.countDocuments({ 'members.user': new mongoose.Types.ObjectId(solo.user.id) });
    expect(memberships).toBe(1);
  }, 300000);

  test('10 concurrent create-team requests with one Idempotency-Key make exactly 1 team', async () => {
    const { token, user } = await registerUser(api);
    const key = `race-idem-${Date.now()}`;
    const results = await Promise.all(Array.from({ length: 10 }, () =>
      api.post('/api/teams').set(auth(token)).set('Idempotency-Key', key).send({ name: 'Race Create' })));
    const created = results.filter((r) => r.status === 201);
    expect(created.length).toBe(10); // all get the same stored 201 replay
    const ids = new Set(created.map((r) => r.body.team.id));
    expect(ids.size).toBe(1);
    const count = await Team.countDocuments({ leader: new mongoose.Types.ObjectId(user.id) });
    expect(count).toBe(1);
  }, 120000);
});

describe('chaos: aborted transaction corrupts nothing', () => {
  test('aborting a join mid-transaction leaves team, user and audit log untouched', async () => {
    const leader = await registerUser(api);
    const team = await createTeam(api, leader.token, { name: 'Chaos Team' });
    const member = await registerUser(api);
    const session = await mongoose.startSession();
    try {
      await session.withTransaction(async () => {
        await Team.findByIdAndUpdate(team.id, { $push: { members: { user: new mongoose.Types.ObjectId(member.user.id), joinedAt: new Date() } } }, { session });
        await User.findByIdAndUpdate(member.user.id, { teamId: team.id }, { session });
        await AuditLog.create([{ hackathonId: 'hack4hack-2026', team: team.id, actor: member.user.id, action: 'member_joined', details: 'chaos' }], { session });
        await session.abortTransaction(); // simulate a crash mid-join
      });
    } catch { /* abort throws; that is the point */ } finally { await session.endSession(); }
    const after = await getTeam(api, leader.token, team.id);
    expect(after.size).toBe(1); // the pushed member is gone
    const me = await User.findById(member.user.id).lean();
    expect(me.teamId).toBeNull();
    const logs = await AuditLog.countDocuments({ team: new mongoose.Types.ObjectId(team.id), action: 'member_joined' });
    expect(logs).toBe(0); // the audit row was rolled back too
  });
});
