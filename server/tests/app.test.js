const mongoose = require('mongoose');
const { init, close, registerUser, createTeam, getTeam, getCaptcha } = require('./setup');
const Team = require('../src/models/Team');
const User = require('../src/models/User');

let api;
beforeAll(async () => { api = await init(); }, 300000);
afterAll(async () => { await close(); }, 120000);

function auth(token) { return { Authorization: `Bearer ${token}` }; }

describe('auth', () => {
  test('registers a user and returns a token, never the password hash', async () => {
    const captcha = await getCaptcha(api);
    const res = await api.post('/api/auth/register').send({ name: 'Asmit', email: 'asmit@test.dev', password: 'Password123', skills: ['React'], ...captcha });
    expect(res.status).toBe(201);
    expect(res.body.token).toBeTruthy();
    expect(res.body.user.email).toBe('asmit@test.dev');
    expect(JSON.stringify(res.body)).not.toMatch(/passwordHash/);
  });
  test('rejects a duplicate email with 409', async () => {
    await registerUser(api, { email: 'dup@test.dev' });
    const captcha = await getCaptcha(api);
    const res = await api.post('/api/auth/register').send({ name: 'Dup', email: 'dup@test.dev', password: 'Password123', ...captcha });
    expect(res.status).toBe(409);
  });
  test('rejects a short password with 400', async () => {
    const captcha = await getCaptcha(api);
    const res = await api.post('/api/auth/register').send({ name: 'Short', email: 'short@test.dev', password: '123', ...captcha });
    expect(res.status).toBe(400);
  });
  test('rejects a bad email with 400', async () => {
    const captcha = await getCaptcha(api);
    const res = await api.post('/api/auth/register').send({ name: 'Bad', email: 'not-an-email', password: 'Password123', ...captcha });
    expect(res.status).toBe(400);
  });
  test('login succeeds with the right password', async () => {
    await registerUser(api, { email: 'login@test.dev' });
    const captcha = await getCaptcha(api);
    const res = await api.post('/api/auth/login').send({ email: 'login@test.dev', password: 'Password123', ...captcha });
    expect(res.status).toBe(200);
    expect(res.body.token).toBeTruthy();
  });
  test('login fails with the wrong password', async () => {
    await registerUser(api, { email: 'login2@test.dev' });
    const captcha = await getCaptcha(api);
    const res = await api.post('/api/auth/login').send({ email: 'login2@test.dev', password: 'WrongPass1', ...captcha });
    expect(res.status).toBe(401);
  });
  test('protected route without a token is 401', async () => {
    const res = await api.get('/api/teams/mine');
    expect(res.status).toBe(401);
  });
});

describe('captcha', () => {
  test('GET /api/captcha returns an id and a question, never the answer', async () => {
    const res = await api.get('/api/captcha');
    expect(res.status).toBe(200);
    expect(res.body.captchaId).toBeTruthy();
    expect(res.body.question).toMatch(/^\d+ [+-] \d+ = \?$/);
    expect(res.body.answer).toBeUndefined();
  });
  test('register without captcha fields is 400 VALIDATION_ERROR', async () => {
    const res = await api.post('/api/auth/register').send({ name: 'NoCap', email: 'nocap@test.dev', password: 'Password123' });
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
  });
  test('register with a wrong answer is 400 CAPTCHA_FAILED and creates no user', async () => {
    const captcha = await getCaptcha(api);
    const res = await api.post('/api/auth/register').send({ name: 'Wrong', email: 'wrongcap@test.dev', password: 'Password123', captchaId: captcha.captchaId, captchaAnswer: String(Number(captcha.captchaAnswer) + 1) });
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('CAPTCHA_FAILED');
    expect(await User.findOne({ email: 'wrongcap@test.dev' }).lean()).toBeNull();
  });
  test('a captcha is one-time use: the same id twice fails the second time', async () => {
    const captcha = await getCaptcha(api);
    const first = await api.post('/api/auth/register').send({ name: 'Once', email: 'once@test.dev', password: 'Password123', ...captcha });
    expect(first.status).toBe(201);
    const second = await api.post('/api/auth/register').send({ name: 'Once', email: 'once@test.dev', password: 'Password123', ...captcha });
    expect(second.status).toBe(400);
    expect(second.body.error.code).toBe('CAPTCHA_FAILED');
  });
  test('login with a wrong answer is 400 CAPTCHA_FAILED before the password check', async () => {
    await registerUser(api, { email: 'login3@test.dev' });
    const captcha = await getCaptcha(api);
    const res = await api.post('/api/auth/login').send({ email: 'login3@test.dev', password: 'WrongPass1', captchaId: captcha.captchaId, captchaAnswer: String(Number(captcha.captchaAnswer) + 1) });
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('CAPTCHA_FAILED');
  });
});

describe('create team', () => {
  test('creates a team with the creator as leader and an 8-char invite code', async () => {
    const { token, user } = await registerUser(api);
    const team = await createTeam(api, token, { name: 'Rocket' });
    expect(String(team.leader._id || team.leader)).toBe(user.id);
    expect(team.size).toBe(1);
    expect(team.inviteCode).toMatch(/^[0-9A-HJKMNP-TV-Z]{8}$/);
    expect(team.seatsLeft).toBe(3);
  });
  test('one team per person: a second create is 409', async () => {
    const { token } = await registerUser(api);
    await createTeam(api, token, { name: 'First' });
    const res = await api.post('/api/teams').set(auth(token)).set('Idempotency-Key', `k-${Date.now()}`).send({ name: 'Second' });
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('ALREADY_IN_TEAM');
  });
  test('rejects an empty team name with 400', async () => {
    const { token } = await registerUser(api);
    const res = await api.post('/api/teams').set(auth(token)).send({ name: '' });
    expect(res.status).toBe(400);
  });
});

describe('invite join', () => {
  test('a member joins with the correct invite code', async () => {
    const leader = await registerUser(api);
    const team = await createTeam(api, leader.token);
    const member = await registerUser(api);
    const res = await api.post(`/api/teams/${team.id}/join`).set(auth(member.token)).send({ inviteCode: team.inviteCode });
    expect(res.status).toBe(200);
    expect(res.body.team.size).toBe(2);
  });
  test('a wrong invite code is 400', async () => {
    const leader = await registerUser(api);
    const team = await createTeam(api, leader.token);
    const member = await registerUser(api);
    const res = await api.post(`/api/teams/${team.id}/join`).set(auth(member.token)).send({ inviteCode: 'ZZZZZZZZ' });
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('INVALID_INVITE');
  });
  test('5 wrong codes then a 6th is rate-limited with 429', async () => {
    const leader = await registerUser(api);
    const team = await createTeam(api, leader.token);
    const member = await registerUser(api);
    let last;
    for (let i = 0; i < 6; i++) {
      last = await api.post(`/api/teams/${team.id}/join`).set(auth(member.token)).send({ inviteCode: 'ZZZZZZZZ' });
    }
    expect(last.status).toBe(429);
    expect(last.body.error.code).toBe('RATE_LIMITED');
  });
  test('a user already in a team cannot join another (409)', async () => {
    const a = await registerUser(api);
    const teamA = await createTeam(api, a.token);
    const b = await registerUser(api);
    const teamB = await createTeam(api, b.token);
    const res = await api.post(`/api/teams/${teamB.id}/join`).set(auth(a.token)).send({ inviteCode: teamB.inviteCode });
    expect(res.status).toBe(409);
    expect(teamA.id).toBeTruthy();
  });
  test('an expired invite code is 410', async () => {
    const leader = await registerUser(api);
    const team = await createTeam(api, leader.token);
    await Team.updateOne({ _id: team.id }, { inviteCodeExpiresAt: new Date(Date.now() - 1000) });
    const member = await registerUser(api);
    const res = await api.post(`/api/teams/${team.id}/join`).set(auth(member.token)).send({ inviteCode: team.inviteCode });
    expect(res.status).toBe(410);
  });
});

describe('join requests', () => {
  test('a request is created as pending', async () => {
    const leader = await registerUser(api);
    const team = await createTeam(api, leader.token);
    const member = await registerUser(api);
    const res = await api.post(`/api/teams/${team.id}/request`).set(auth(member.token)).send({ message: 'Hi, I do Node!' });
    expect(res.status).toBe(201);
    expect(res.body.request.status).toBe('pending');
  });
  test('a non-leader cannot accept a request (403)', async () => {
    const leader = await registerUser(api);
    const team = await createTeam(api, leader.token);
    const asker = await registerUser(api);
    const reqRes = await api.post(`/api/teams/${team.id}/request`).set(auth(asker.token)).send({});
    const other = await registerUser(api);
    const res = await api.post(`/api/teams/${team.id}/requests/${reqRes.body.request._id}/accept`).set(auth(other.token)).send({});
    expect(res.status).toBe(403);
  });
  test('the leader accepting adds the member', async () => {
    const leader = await registerUser(api);
    const team = await createTeam(api, leader.token);
    const asker = await registerUser(api);
    const reqRes = await api.post(`/api/teams/${team.id}/request`).set(auth(asker.token)).send({});
    const res = await api.post(`/api/teams/${team.id}/requests/${reqRes.body.request._id}/accept`).set(auth(leader.token)).send({});
    expect(res.status).toBe(200);
    expect(res.body.team.size).toBe(2);
  });
  test('the leader declining leaves the user out', async () => {
    const leader = await registerUser(api);
    const team = await createTeam(api, leader.token);
    const asker = await registerUser(api);
    const reqRes = await api.post(`/api/teams/${team.id}/request`).set(auth(asker.token)).send({});
    const res = await api.post(`/api/teams/${team.id}/requests/${reqRes.body.request._id}/decline`).set(auth(leader.token)).send({});
    expect(res.status).toBe(200);
    expect(res.body.request.status).toBe('declined');
    const after = await getTeam(api, leader.token, team.id);
    expect(after.size).toBe(1);
  });
  test('a duplicate pending request is 409', async () => {
    const leader = await registerUser(api);
    const team = await createTeam(api, leader.token);
    const asker = await registerUser(api);
    await api.post(`/api/teams/${team.id}/request`).set(auth(asker.token)).send({});
    const res = await api.post(`/api/teams/${team.id}/request`).set(auth(asker.token)).send({});
    expect(res.status).toBe(409);
  });
  test('accepting when the team is full is 409', async () => {
    const leader = await registerUser(api);
    const team = await createTeam(api, leader.token);
    const asker = await registerUser(api);
    const reqRes = await api.post(`/api/teams/${team.id}/request`).set(auth(asker.token)).send({});
    // Fill the team to 4 with invite joins.
    for (let i = 0; i < 3; i++) {
      const m = await registerUser(api);
      const r = await api.post(`/api/teams/${team.id}/join`).set(auth(m.token)).send({ inviteCode: team.inviteCode });
      expect(r.status).toBe(200);
    }
    const res = await api.post(`/api/teams/${team.id}/requests/${reqRes.body.request._id}/accept`).set(auth(leader.token)).send({});
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('TEAM_FULL');
  });
});

describe('idempotency (sequential retries)', () => {
  test('same Idempotency-Key creating a team twice makes exactly one team', async () => {
    const { token, user } = await registerUser(api);
    const key = `idem-team-${Date.now()}`;
    const first = await api.post('/api/teams').set(auth(token)).set('Idempotency-Key', key).send({ name: 'Once Only' });
    expect(first.status).toBe(201);
    const second = await api.post('/api/teams').set(auth(token)).set('Idempotency-Key', key).send({ name: 'Once Only' });
    expect(second.status).toBe(201);
    expect(second.headers['x-idempotent-replay']).toBe('true');
    expect(second.body.team.id).toBe(first.body.team.id);
    const count = await Team.countDocuments({ leader: new mongoose.Types.ObjectId(user.id) });
    expect(count).toBe(1);
  });
  test('same Idempotency-Key joining twice joins once', async () => {
    const leader = await registerUser(api);
    const team = await createTeam(api, leader.token);
    const member = await registerUser(api);
    const key = `idem-join-${Date.now()}`;
    const first = await api.post(`/api/teams/${team.id}/join`).set(auth(member.token)).set('Idempotency-Key', key).send({ inviteCode: team.inviteCode });
    expect(first.status).toBe(200);
    const second = await api.post(`/api/teams/${team.id}/join`).set(auth(member.token)).set('Idempotency-Key', key).send({ inviteCode: team.inviteCode });
    expect(second.status).toBe(200);
    expect(second.headers['x-idempotent-replay']).toBe('true');
    const after = await getTeam(api, leader.token, team.id);
    expect(after.size).toBe(2);
  });
});

describe('leave, leadership, removal', () => {
  test('leader leaving passes leadership to the oldest remaining member', async () => {
    const leader = await registerUser(api);
    const team = await createTeam(api, leader.token);
    const m1 = await registerUser(api);
    await api.post(`/api/teams/${team.id}/join`).set(auth(m1.token)).send({ inviteCode: team.inviteCode });
    const m2 = await registerUser(api);
    await api.post(`/api/teams/${team.id}/join`).set(auth(m2.token)).send({ inviteCode: team.inviteCode });
    const res = await api.post(`/api/teams/${team.id}/leave`).set(auth(leader.token)).send({});
    expect(res.status).toBe(200);
    expect(res.body.newLeader).toBe(m1.user.id); // m1 joined first
    const after = await getTeam(api, m1.token, team.id);
    expect(String(after.leader._id || after.leader)).toBe(m1.user.id);
    expect(after.size).toBe(2);
  });
  test('last member leaving deletes the team', async () => {
    const { token, user } = await registerUser(api);
    const team = await createTeam(api, token, { name: 'Solo' });
    const res = await api.post(`/api/teams/${team.id}/leave`).set(auth(token)).send({});
    expect(res.status).toBe(200);
    expect(res.body.deleted).toBe(true);
    const gone = await api.get(`/api/teams/${team.id}`).set(auth(token));
    expect(gone.status).toBe(404);
    const me = await User.findById(user.id).lean();
    expect(me.teamId).toBeNull();
  });
  test('a non-leader leaving keeps the team', async () => {
    const leader = await registerUser(api);
    const team = await createTeam(api, leader.token);
    const m = await registerUser(api);
    await api.post(`/api/teams/${team.id}/join`).set(auth(m.token)).send({ inviteCode: team.inviteCode });
    const res = await api.post(`/api/teams/${team.id}/leave`).set(auth(m.token)).send({});
    expect(res.status).toBe(200);
    expect(res.body.deleted).toBe(false);
    const after = await getTeam(api, leader.token, team.id);
    expect(after.size).toBe(1);
  });
  test('leader can remove a member; a non-leader cannot', async () => {
    const leader = await registerUser(api);
    const team = await createTeam(api, leader.token);
    const m = await registerUser(api);
    await api.post(`/api/teams/${team.id}/join`).set(auth(m.token)).send({ inviteCode: team.inviteCode });
    const no = await api.post(`/api/teams/${team.id}/remove/${leader.user.id}`).set(auth(m.token)).send({});
    expect(no.status).toBe(403);
    const ok = await api.post(`/api/teams/${team.id}/remove/${m.user.id}`).set(auth(leader.token)).send({});
    expect(ok.status).toBe(200);
    const removed = await User.findById(m.user.id).lean();
    expect(removed.teamId).toBeNull();
  });
});

describe('board, suggestions, audit, metrics', () => {
  test('board lists teams and people, without emails', async () => {
    const leader = await registerUser(api, { name: 'Board Leader' });
    await createTeam(api, leader.token, { name: 'Board Team' });
    const res = await api.get('/api/board');
    expect(res.status).toBe(200);
    expect(res.body.teams.length).toBeGreaterThan(0);
    expect(res.body.people.length).toBeGreaterThan(0);
    expect(JSON.stringify(res.body.people)).not.toMatch(/@test.dev/);
  });
  test('suggestions rank complementary skills first', async () => {
    const me = await registerUser(api, { skills: ['React'], utcOffset: 6 });
    await registerUser(api, { name: 'Same Skills', skills: ['React'], utcOffset: 6 });
    const comp = await registerUser(api, { name: 'Complementary', skills: ['Node.js', 'MongoDB'], utcOffset: 6 });
    const res = await api.get('/api/suggestions').set(auth(me.token));
    expect(res.status).toBe(200);
    const names = res.body.suggestions.map((s) => s.name);
    expect(names.indexOf('Complementary')).toBeLessThan(names.indexOf('Same Skills'));
    const top = res.body.suggestions.find((s) => s.id === comp.user.id);
    expect(top.score).toBeGreaterThan(0.9);
    expect(top.complementarySkills).toEqual(expect.arrayContaining(['Node.js']));
  });
  test('audit log records team creation and joins', async () => {
    const leader = await registerUser(api);
    const team = await createTeam(api, leader.token);
    const m = await registerUser(api);
    await api.post(`/api/teams/${team.id}/join`).set(auth(m.token)).send({ inviteCode: team.inviteCode });
    const res = await api.get(`/api/teams/${team.id}/audit`).set(auth(leader.token));
    expect(res.status).toBe(200);
    const actions = res.body.logs.map((l) => l.action);
    expect(actions).toContain('team_created');
    expect(actions).toContain('member_joined');
  });
  test('a non-member cannot read the audit log (403)', async () => {
    const leader = await registerUser(api);
    const team = await createTeam(api, leader.token);
    const outsider = await registerUser(api);
    const res = await api.get(`/api/teams/${team.id}/audit`).set(auth(outsider.token));
    expect(res.status).toBe(403);
  });
  test('metrics and health endpoints answer', async () => {
    const m = await api.get('/api/metrics');
    expect(m.status).toBe(200);
    expect(typeof m.body.requests).toBe('number');
    expect(m.body.teamsCreated).toBeGreaterThan(0);
    const h = await api.get('/api/health');
    expect(h.status).toBe(200);
    expect(h.body.ok).toBe(true);
  });
});
