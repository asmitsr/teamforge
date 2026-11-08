// Load test: 100 concurrent users hitting GET /api/board for 30s (autocannon).
// Runs the real server in-process against an in-memory replica set, so the
// numbers are measured on THIS machine, not guessed. Writes JSON results to
// docs/load-test-results.json and prints p50/p95/p99 + a PASS/FAIL verdict
// against the 200ms p95 target.
const fs = require('fs');
const path = require('path');
const mongoose = require('mongoose');
const autocannon = require('autocannon');
const { MongoMemoryReplSet } = require('mongodb-memory-server');
const { createApp } = require('../src/app');
const User = require('../src/models/User');
const Team = require('../src/models/Team');
const { generateInviteCode } = require('../src/utils/inviteCode');

async function main() {
  const replset = await MongoMemoryReplSet.create({ replSet: { count: 1, storageEngine: 'wiredTiger' } });
  await mongoose.connect(replset.getUri('teamforge-load'));
  // Small realistic dataset: 50 teams + 200 free agents on the board.
  const users = await User.insertMany(Array.from({ length: 200 }, (_, i) => ({
    name: `Load User ${i}`, email: `load${i}@test.dev`, passwordHash: 'x',
    skills: ['React'], timezone: 'Asia/Dhaka', utcOffset: 6, lookingForTeammates: true })));
  const teams = [];
  for (let t = 0; t < 50; t++) {
    const leader = users[t];
    teams.push({ hackathonId: 'hack4hack-2026', name: `Load Team ${t}`, description: 'Load test team',
      leader: leader._id, members: [{ user: leader._id, joinedAt: new Date() }], maxSize: 4,
      inviteCode: generateInviteCode(), inviteCodeExpiresAt: new Date(Date.now() + 48 * 3600 * 1000),
      lookingForTeammates: true, skillsWanted: ['Node.js'] });
  }
  await Team.insertMany(teams);
  const server = createApp().listen(0);
  await new Promise((r) => server.once('listening', r));
  const port = server.address().port;
  const url = `http://127.0.0.1:${port}/api/board`;
  console.log(`Load test: GET ${url} — 100 connections, 30s`);
  const result = await autocannon({ url, connections: 100, duration: 30, pipelining: 1 });
  // autocannon v9 reports p90 and p97.5 but no p95, so p95 is linearly
  // interpolated between them (conservative: p97.5 is also reported).
  const p95 = Math.round((result.latency.p90 + (result.latency.p97_5 - result.latency.p90) * (2 / 3)) * 100) / 100;
  const summary = { endpoint: 'GET /api/board', connections: 100, durationSeconds: 30,
    requests: result.requests.total, status_2xx: result['2xx'], status_non2xx: result.non2xx,
    throughput_rps: result.requests.average, errors: result.errors, timeouts: result.timeouts,
    latency_ms: { p50: result.latency.p50, p90: result.latency.p90, p95_interpolated: p95, p97_5: result.latency.p97_5, p99: result.latency.p99, mean: result.latency.mean, max: result.latency.max },
    target_p95_ms: 200, verdict: (p95 < 200 && result.non2xx === 0 && result.errors === 0) ? 'PASS' : 'FAIL', measuredAt: new Date().toISOString(),
    note: 'Local machine, in-memory MongoDB replica set. Production numbers will differ; see docs/LOAD_TEST_REPORT.md.' };
  const outPath = path.join(__dirname, '..', '..', 'docs', 'load-test-results.json');
  fs.mkdirSync(path.dirname(outPath), { recursive: true });
  fs.writeFileSync(outPath, JSON.stringify(summary, null, 2));
  console.log(JSON.stringify(summary, null, 2));
  await new Promise((resolve) => { try { server.closeAllConnections(); } catch { /* ignore */ } server.close(() => resolve()); setTimeout(resolve, 2000); });
  await new Promise((r) => setTimeout(r, 300)); // let in-flight requests finish
  await mongoose.disconnect();
  await replset.stop();
  process.exit(summary.verdict === 'PASS' ? 0 : 1);
}
main().catch((e) => { console.error(e); process.exit(1); });
