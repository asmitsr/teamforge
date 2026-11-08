# TeamForge — Design Doc (1 page)

**Problem (PS1):** team formation for a hackathon with 10,000 participants.
Teams of 2–4, invite codes, leader-approved join requests, a live board — and it
must stay correct when hundreds click at the same moment.

## Data model

- **User** — name, email (unique), bcrypt passwordHash, skills[], timezone +
  utcOffset, bio, lookingForTeammates, `teamId` (null = free agent) — the single
  source of truth for "one team per person".
- **Team** — hackathonId, name, description, leader, `members[{user, joinedAt}]`
  (embedded, so "how full?" is one document read), maxSize 4, inviteCode (unique,
  +48h expiry), lookingForTeammates, skillsWanted[].
- **JoinRequest** — team, user, status pending/accepted/declined, message.
- **AuditLog** — append-only: team, actor, action, details, timestamp.
- **IdempotencyKey** — key (unique), user, endpoint, stored response, expiresAt (TTL 24h).

## How races are prevented

1. **Transactions.** Join / accept / leave / create run in a MongoDB transaction,
   so Team + User.teamId + AuditLog change atomically — never a member without a
   teamId, never an audit row for something that did not happen. Needs a replica
   set (Atlas M0 in prod, in-memory replica set in tests). If the DB were a
   standalone, transactions would fail at startup — that is a deliberate
   requirement, not an accident.
2. **Atomic conditional update.** Inside the transaction the seat is taken by one
   `findOneAndUpdate` that only matches while `members.size < maxSize`, the code
   is still valid, and the user is not already a member. Two concurrent joins hit
   the same document: MongoDB aborts one with a write conflict, the transaction
   retries it, the retry sees the team full → 409 TEAM_FULL. Exactly one winner.
3. **One team per person, under concurrency.** Both the team update and the
   `User.teamId` write touch the same user document; a second concurrent join by
   the same user aborts on write conflict and retries into a 409 ALREADY_IN_TEAM.
   Tested: one user racing 10 teams lands in exactly 1.
4. **Idempotency.** Mutations accept `Idempotency-Key`. The first request
   atomically claims the key (unique-index insert, "processing" placeholder);
   a concurrent retry gets the stored response instead of re-running the handler.
   Tested with 10 concurrent identical creates → 1 team, 10 identical 201s.
5. **Leadership / deletion.** Leader leaves → oldest remaining member (earliest
   joinedAt) becomes leader. Last member leaves → team + pending requests deleted.
   Both inside the same transaction as the leave.

## Other decisions

- **Realtime:** Socket.io. `board:update` broadcast + `team:<id>` rooms. The
  server emits after a successful mutation and clients refetch — a missed event
  self-heals on the next one.
- **Suggestions:** `score = 0.6·skillScore + 0.4·timezoneScore`, where skillScore is
  the share of the candidate's skills the user lacks (complementary, not overlap)
  and timezoneScore is `1 − |Δoffset|/12`. Skills weigh more: a team that cannot
  build together fails even if it meets easily.
- **Security:** JWT + bcrypt; only the leader accepts/declines/removes; invite codes
  are 8 Crockford chars (32⁸ ≈ 1.1T combos, no I/L/O/U); wrong-code attempts capped
  at 5/10min per IP+team (correct-code races never throttled); zod validates every
  input; helmet + CORS; no emails on the public board.
- **Minimum size:** teams start at 1 (the creator alone) and are "forming" until
  they reach 2 — the API deliberately does not reject 1-member teams, because a
  team must exist before anyone can join it. The minimum is a participation
  threshold (shown as a "Forming" badge on the board), not a creation-time gate;
  the maximum (4) is enforced atomically on every join/accept.
- **Board speed:** the hottest read, cached in-process for ≤5s **and invalidated
  on every team mutation** (emitBoard clears it). Measured here: uncached p95
  ~511–558ms at 100 concurrent users, cached p95 67.7ms on verifier re-run (target <200ms). Filtered
  queries are never cached. Trade-off: per-instance cache; two instances could
  disagree for ≤5s — a shared cache is the first "one more week" item.
## Trade-offs (defended)

- **Transactions over a single atomic update alone:** a bare conditional update
  protects the seat but cannot keep User.teamId and the audit log in step. The
  transaction costs a replica set and ~ms of latency, and buys cross-document
  atomicity. Worth it: correctness is the #1 judging criterion.
- **In-process cache over Redis:** zero extra infra on free tiers; the cost is
  per-instance staleness (≤5s, zero after any mutation). Redis is the upgrade.
- **No separate worker/queue:** PS1 has no background jobs; adding one would be
  complexity with no requirement behind it.

## What I would do with one more week

1. Redis: shared board cache + Socket.io adapter (true multi-instance realtime).
2. Join-request expiry + leader reminders; team search with text index.
3. Processing-timeout for idempotency keys + a "request already went through" UI.
4. Rate-limit by user as well as IP; request-id tracing (X-Request-Id).
5. Re-run the load test against the deployed URL (k6 in `server/load/`) + p95 alert.
