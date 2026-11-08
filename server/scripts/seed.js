// Seed: 10,000 users + 2,000 teams, deterministic and fast.
// Usage: MONGODB_URI=mongodb://127.0.0.1:27017/teamforge node scripts/seed.js
//    or: node scripts/seed.js --memory   (in-memory replica set, for demos/tests)
// The bcrypt hash is computed ONCE and reused for every user — hashing
// 10,000 passwords one by one would take minutes; the hash is the same
// because bcrypt verifies against the stored hash, not per-user salt reuse
// in a harmful way for seed/demo data. Demo password: Demo1234!
const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
const config = require('../src/config');
const User = require('../src/models/User');
const Team = require('../src/models/Team');
const JoinRequest = require('../src/models/JoinRequest');
const AuditLog = require('../src/models/AuditLog');
const { generateInviteCode } = require('../src/utils/inviteCode');

const FIRST = ['Aarav', 'Ananya', 'Rahul', 'Priya', 'Arjun', 'Sneha', 'Vikram', 'Meera', 'Karan', 'Isha', 'Rohan', 'Nisha', 'Aditya', 'Kavya', 'Nikhil', 'Tara', 'Dev', 'Riya', 'Sana', 'Farhan', 'Asmit', 'Tanvir', 'Nusrat', 'Hasan', 'Mim'];
const LAST = ['Sharma', 'Patel', 'Khan', 'Das', 'Roy', 'Ahmed', 'Singh', 'Gupta', 'Mehta', 'Nair', 'Sarkar', 'Chowdhury', 'Hossain', 'Rahman', 'Iyer', 'Joshi', 'Verma', 'Kulkarni', 'Banerjee', 'Ali'];
const SKILLS = ['React', 'Node.js', 'MongoDB', 'Python', 'TypeScript', 'UI/UX', 'Flutter', 'Kotlin', 'Go', 'Rust', 'DevOps', 'ML', 'Data Science', 'Next.js', 'Express', 'Docker'];
const ZONES = [
  { tz: 'Asia/Kolkata', off: 5.5 }, { tz: 'Asia/Dhaka', off: 6 }, { tz: 'Asia/Kathmandu', off: 5.75 },
  { tz: 'Europe/London', off: 0 }, { tz: 'Europe/Berlin', off: 1 }, { tz: 'America/New_York', off: -5 },
  { tz: 'America/Los_Angeles', off: -8 }, { tz: 'Asia/Singapore', off: 8 }, { tz: 'Australia/Sydney', off: 11 },
  { tz: 'Africa/Cairo', off: 2 },
];
function pick(arr, i) { return arr[i % arr.length]; }

async function main() {
  const useMemory = process.argv.includes('--memory');
  let replset = null;
  let uri = process.env.MONGODB_URI || config.mongoUri;
  if (useMemory) {
    const { MongoMemoryReplSet } = require('mongodb-memory-server');
    replset = await MongoMemoryReplSet.create({ replSet: { count: 1, storageEngine: 'wiredTiger' } });
    uri = replset.getUri('teamforge-seed');
  }
  const started = Date.now();
  await mongoose.connect(uri);
  console.log('Seeding', uri.replace(/\/\/.*@/, '//***@'));

  // Start clean for this hackathon (keeps re-runs idempotent).
  await Promise.all([User.deleteMany({}), Team.deleteMany({}), JoinRequest.deleteMany({}), AuditLog.deleteMany({})]);

  const passwordHash = await bcrypt.hash('Demo1234!', 10);
  const users = [];
  users.push({ name: 'Demo One', email: 'demo1@teamforge.dev', passwordHash, skills: ['React', 'Node.js'], timezone: 'Asia/Dhaka', utcOffset: 6, bio: 'Demo account 1', lookingForTeammates: false });
  users.push({ name: 'Demo Two', email: 'demo2@teamforge.dev', passwordHash, skills: ['Python', 'ML'], timezone: 'Asia/Kolkata', utcOffset: 5.5, bio: 'Demo account 2', lookingForTeammates: true });
  for (let i = 0; i < 9998; i++) {
    const z = pick(ZONES, i);
    const nSkills = 1 + (i % 4);
    const skills = [];
    for (let k = 0; k < nSkills; k++) skills.push(pick(SKILLS, i * 3 + k * 5));
    users.push({ name: `${pick(FIRST, i)} ${pick(LAST, i * 7)} ${i}`, email: `seed${i}@teamforge.dev`, passwordHash,
      skills: [...new Set(skills)], timezone: z.tz, utcOffset: z.off, bio: '', lookingForTeammates: i % 3 !== 0 });
  }
  const inserted = await User.insertMany(users, { ordered: false });
  console.log(`Users inserted: ${inserted.length}`);

  // 2,000 teams: leaders are the first 2,000 users, members 2–4 people.
  const usedCodes = new Set();
  const teams = [];
  const teamMemberUserIds = []; // [userId...] per team, to set teamId afterwards
  for (let t = 0; t < 2000; t++) {
    let code = generateInviteCode();
    while (usedCodes.has(code)) code = generateInviteCode();
    usedCodes.add(code);
    const size = 2 + (t % 3); // 2, 3 or 4 members
    const members = [];
    for (let m = 0; m < size; m++) {
      const u = inserted[(t * 4 + m) % inserted.length];
      members.push({ user: u._id, joinedAt: new Date(Date.now() - (size - m) * 3600000) });
    }
    teamMemberUserIds.push(members.map((x) => x.user));
    teams.push({ hackathonId: config.hackathonId, name: `Team ${t + 1}`, description: `Seed team ${t + 1} looking for ${pick(SKILLS, t)}`,
      leader: members[0].user, members, maxSize: 4, inviteCode: code,
      inviteCodeExpiresAt: new Date(Date.now() + 48 * 3600 * 1000),
      lookingForTeammates: size < 4, skillsWanted: [pick(SKILLS, t + 2)] });
  }
  const insertedTeams = await Team.insertMany(teams, { ordered: false });
  console.log(`Teams inserted: ${insertedTeams.length}`);
  // Point every member at their team (one bulkWrite, not 10k round trips).
  const ops = [];
  insertedTeams.forEach((team, i) => {
    for (const uid of teamMemberUserIds[i]) ops.push({ updateOne: { filter: { _id: uid }, update: { teamId: team._id, lookingForTeammates: false } } });
  });
  await User.bulkWrite(ops, { ordered: false });
  const secs = ((Date.now() - started) / 1000).toFixed(1);
  console.log(`Seed complete: ${inserted.length} users, ${insertedTeams.length} teams in ${secs}s`);
  console.log('Demo accounts: demo1@teamforge.dev / Demo1234!  and  demo2@teamforge.dev / Demo1234!');
  await mongoose.disconnect();
  if (replset) await replset.stop();
}
main().catch((e) => { console.error(e); process.exit(1); });
