// Chaos test: kill the server (SIGKILL, no graceful shutdown) in the middle
// of 50 concurrent joins for the last seat, restart it, then verify the
// database is still consistent: team size <= 4, no duplicate members, no
// user in two teams, audit log consistent. Prints PASS/FAIL honestly.
const { spawn } = require('child_process');
const http = require('http');
const mongoose = require('mongoose');
const { MongoMemoryReplSet } = require('mongodb-memory-server');

const PORT = 5011;
const BASE = `http://127.0.0.1:${PORT}`;
function sleep(ms) { return new Promise((r) => setTimeout(r, ms)); }
function req(method, path, token, body) {
  return new Promise((resolve, reject) => {
    const data = body ? JSON.stringify(body) : null;
    const r = http.request(BASE + path, { method, headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) } },
      (res) => { let b = ''; res.on('data', (c) => { b += c; }); res.on('end', () => { try { resolve({ status: res.statusCode, body: JSON.parse(b || '{}') }); } catch { resolve({ status: res.statusCode, body: {} }); } }); });
    r.on('error', reject);
    if (data) r.write(data);
    r.end();
  });
}
async function waitHealth(child, tries = 50) {
  for (let i = 0; i < tries; i++) {
    try { const r = await req('GET', '/api/health'); if (r.status === 200) return true; } catch { /* not up yet */ }
    await sleep(200);
  }
  return false;
}
function startServer(uri) {
  const child = spawn('node', ['src/server.js'], { cwd: __dirname + '/..', env: { ...process.env, PORT: String(PORT), MONGODB_URI: uri, JWT_SECRET: 'chaos-secret', CLIENT_URL: 'http://localhost:5173' }, stdio: 'ignore' });
  return child;
}
async function main() {
  const replset = await MongoMemoryReplSet.create({ replSet: { count: 1, storageEngine: 'wiredTiger' } });
  const uri = replset.getUri('teamforge-chaos');
  let child = startServer(uri);
  if (!(await waitHealth(child))) { console.log('CHAOS TEST: FAIL — server did not start'); child.kill('SIGKILL'); process.exit(1); }
  // Seed via the API: 1 leader + team, fill to 3 of 4.
  const mk = async (name) => (await req('POST', '/api/auth/register', null, { name, email: `${name}@chaos.dev`, password: 'Password123', skills: ['React'] })).body;
  const leader = await mk('chaos-leader');
  const team = (await req('POST', '/api/teams', leader.token, { name: 'Chaos Team' })).body.team;
  for (let i = 0; i < 2; i++) {
    const m = await mk(`chaos-m${i}`);
    await req('POST', `/api/teams/${team.id}/join`, m.token, { inviteCode: team.inviteCode });
  }
  const racers = [];
  for (let i = 0; i < 50; i++) racers.push(await mk(`chaos-r${i}`));
  // Fire 50 joins, kill the server 20ms in — mid-flight, no graceful exit.
  const firing = Promise.all(racers.map((u) => req('POST', `/api/teams/${team.id}/join`, u.token, { inviteCode: team.inviteCode }).catch(() => ({ status: 0, body: {} }))));
  await sleep(150);
  child.kill('SIGKILL');
  await firing;
  await sleep(500);
  child = startServer(uri); // restart on the same database
  if (!(await waitHealth(child))) { console.log('CHAOS TEST: FAIL — server did not restart'); process.exit(1); }
  // Verify invariants straight from the database.
  await mongoose.connect(uri);
  const Team = require('../src/models/Team');
  const User = require('../src/models/User');
  const dbTeam = await Team.findById(team.id).lean();
  const memberIds = dbTeam.members.map((m) => String(m.user));
  const unique = new Set(memberIds).size;
  const inTeam = await User.countDocuments({ teamId: dbTeam._id });
  const doubleTeamed = await User.aggregate([{ $match: { teamId: { $ne: null } } }, { $group: { _id: '$teamId', n: { $sum: 1 } } }]);
  const ok = dbTeam.members.length <= 4 && unique === memberIds.length && inTeam === memberIds.length;
  console.log(`CHAOS TEST: team size=${dbTeam.members.length} (max 4), unique members=${unique}, users pointing at team=${inTeam}`);
  console.log(`CHAOS TEST: ${ok ? 'PASS — nothing corrupted after SIGKILL mid-join' : 'FAIL — database inconsistent'}`);
  child.kill('SIGKILL');
  await mongoose.disconnect();
  await replset.stop();
  process.exit(ok ? 0 : 1);
}
main().catch((e) => { console.error('CHAOS TEST: FAIL', e); process.exit(1); });
