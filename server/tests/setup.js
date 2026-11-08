// Shared test setup: one in-memory REPLICA SET (transactions need one),
// one Express app, helpers to register users and make teams.
process.env.NODE_ENV = 'test';
process.env.JWT_SECRET = 'test-secret';
const mongoose = require('mongoose');
const request = require('supertest');
const { MongoMemoryReplSet } = require('mongodb-memory-server');
const { createApp } = require('../src/app');

let replset;
async function init() {
  replset = await MongoMemoryReplSet.create({ replSet: { count: 1, storageEngine: 'wiredTiger' } });
  await mongoose.connect(replset.getUri('teamforge-test'));
  return request(createApp());
}
async function close() { await mongoose.disconnect(); if (replset) await replset.stop(); }

let n = 0;
async function registerUser(api, overrides = {}) {
  n += 1;
  const email = overrides.email || `user${Date.now()}-${n}@test.dev`;
  const res = await api.post('/api/auth/register').send({
    name: overrides.name || `User ${n}`, email, password: 'Password123',
    skills: overrides.skills || ['React'], timezone: overrides.timezone || 'Asia/Dhaka',
    utcOffset: overrides.utcOffset !== undefined ? overrides.utcOffset : 6,
    bio: overrides.bio || '',
  });
  if (res.status !== 201) throw new Error(`register failed: ${res.status} ${JSON.stringify(res.body)}`);
  return { token: res.body.token, user: res.body.user };
}
async function createTeam(api, token, overrides = {}) {
  const res = await api.post('/api/teams').set('Authorization', `Bearer ${token}`)
    .set('Idempotency-Key', `team-${Date.now()}-${Math.random()}`).send({
      name: overrides.name || 'Team Alpha', description: overrides.description || 'A test team',
      skillsWanted: overrides.skillsWanted || ['Node.js'], lookingForTeammates: true });
  if (res.status !== 201) throw new Error(`create team failed: ${res.status} ${JSON.stringify(res.body)}`);
  return res.body.team;
}
async function getTeam(api, token, teamId) {
  const res = await api.get(`/api/teams/${teamId}`).set('Authorization', `Bearer ${token}`);
  if (res.status !== 200) throw new Error(`get team failed: ${res.status} ${JSON.stringify(res.body)}`);
  return res.body.team;
}
module.exports = { init, close, registerUser, createTeam, getTeam };
