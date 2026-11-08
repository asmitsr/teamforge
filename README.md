# TeamForge — Race-proof team formation

**Hack4Hack Crew Hiring Challenge 2026 · PS1 · Race-proof team formation at scale**

One sentence: a hackathon team-formation service where 50 people can click the
last seat at the same instant and **exactly one** gets it — proven by an automated test.

- Live demo: https://teamforge-mu.vercel.app (frontend on Vercel; backend live on Railway https://teamforge-production-8d4a.up.railway.app)
- Repo: https://github.com/asmitsr/teamforge

## What it does

- Teams (2–4 members) with 8-character invite codes that expire after 48h
- Join requests the leader accepts or declines; direct join with an invite code
- Live "looking for teammates" board + live team pages (Socket.io, no refresh)
- Teammate suggestions ranked by complementary skills (60%) + timezone overlap (40%)
- Audit log of every team change (who, what, when)
- Idempotent mutations (safe double-clicks / retries), JWT auth, rate limits, zod validation
- 36 API tests including a real 50-way race test, running in GitHub Actions
- Seed script: 10,000 users + 2,000 teams in 3.2s (verifier re-run) · Load test: board p95 **72.3ms** at 100 concurrent users (target < 200ms, verifier re-run 8 Nov 2026, sandbox — see docs/LOAD_TEST_REPORT.md) · Chaos test: SIGKILL mid-join, nothing corrupted

## Run it in 5 minutes

```bash
# 1. Needs Node 20+ and (for the server) a MongoDB replica set.
#    Locally we use an in-memory replica set — no Atlas account needed.
cd server && npm install
npm test            # 36 tests, ~25s (first run downloads a MongoDB binary once)
npm run seed:memory # 10,000 users + 2,000 teams (demo accounts below)
npm start           # server on http://localhost:5000

cd ../client && npm install
npm run dev         # client on http://localhost:5173 (proxies /api to the server)
```

Demo accounts (seeded): `demo1@teamforge.dev` / `Demo1234!` and
`demo2@teamforge.dev` / `Demo1234!`

Production-style run with Docker (needs Docker on your machine):

```bash
docker compose up --build   # mongo + server + client
```

## API (all under `/api`)

| Method & path | Auth | What it does |
|---|---|---|
| `POST /auth/register` · `POST /auth/login` | — | JWT auth (bcrypt passwords) |
| `GET /board` | — | Teams + people looking for teammates (the load-tested endpoint) |
| `GET /teams/mine` · `GET /teams/:id` | JWT | Your team / team detail (members, pending requests) |
| `POST /teams` | JWT + `Idempotency-Key` | Create a team (you become leader) |
| `POST /teams/:id/join` | JWT + `Idempotency-Key` | Join with invite code — the race-proof path |
| `POST /teams/:id/request` | JWT + `Idempotency-Key` | Ask to join (leader approves later) |
| `POST /teams/:id/requests/:req/accept` · `.../decline` | leader | Accept (race-proof) / decline a request |
| `POST /teams/:id/leave` | JWT + `Idempotency-Key` | Leave; leader → oldest member; last member deletes the team |
| `POST /teams/:id/remove/:userId` | leader | Remove a member |
| `POST /teams/:id/regenerate-invite` | leader | New invite code (rate-limited) |
| `GET /teams/:id/audit` | member | Audit log |
| `GET /suggestions` | JWT | Ranked teammate suggestions with score breakdown |
| `GET /metrics` · `GET /health` | — | Counters + liveness |

Real-time: Socket.io — `board:update` to everyone, `team:update` to room `team:<id>`.

## Deploy (free tiers)

1. **Database:** MongoDB Atlas, M0 free cluster — it is a replica set, which
   transactions need. Copy the connection string.
2. **Server:** Railway trial web service (no card; Render was tried first but
   needs a card even for Free — see DEPLOY.md). Root: `server/`,
   build `npm install`, start `npm start`. Env vars: `MONGODB_URI` (Atlas),
   `JWT_SECRET` (long random string), `CLIENT_URL` (your Vercel URL),
   `PORT` (Railway sets it).
3. **Client:** Vercel. Root: `client/`, build `npm run build`, output `dist`.
   Env var: `VITE_API_URL=https://<your-railway-service>.up.railway.app`.
4. Then `npm run seed` against the Atlas URI (once) for demo data, and put
   the live URL in `SUBMISSION.md`.

## How the race-proofing works (short version)

Every join/accept/leave runs in a **MongoDB transaction** (replica set required).
Inside it, the seat is taken by **one atomic conditional update**:
`findOneAndUpdate({_id, inviteCode still valid, user not already a member, members.size < maxSize}, {$push: member})`.
Two concurrent joins both try to modify the same team document — MongoDB aborts
one with a write conflict, the transaction retries it, and the retry now sees the
team full and returns 409. The full story, trade-offs and the "one more week" list
are in [`docs/DESIGN.md`](docs/DESIGN.md). The numbers are in
[`docs/LOAD_TEST_REPORT.md`](docs/LOAD_TEST_REPORT.md).

## Honest limitations

- Single server instance: the board cache is in-process (see DESIGN.md); Socket.io
  has no Redis adapter yet, so two instances would not share live updates.
- Idempotency "processing" keys expire after 24h; a crashed first request blocks
  that key until expiry (safe side — never double-applies).
- No email verification, no password reset, no file uploads (PS1 does not need them).
- Load-test numbers are from this dev sandbox (4 CPUs, in-memory MongoDB), not
  production hardware. A live check on 8 Nov 2026 confirmed the deployed board
  is up and error-free under 100 concurrent users, but no live p95 can be
  honestly quoted from this sandbox — see docs/LOAD_TEST_REPORT.md.
- The load test measures the cached board path (see DESIGN.md); the uncached
  baseline on this machine was p95 ~558ms and is reported, not hidden.

## Project layout

```
server/  Express + Mongoose + Socket.io API, Jest tests, seed/load/chaos scripts
client/  React + Vite UI (mobile-first, keyboard-only usable)
docs/    DESIGN.md (1 page) · LOAD_TEST_REPORT.md · INTERVIEW_NOTES_BN.md
.github/workflows/ci.yml   docker-compose.yml   SUBMISSION.md
```
