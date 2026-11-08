# TeamForge — 5-minute walkthrough video script

Record on your phone: screen-record the live site, speak in English, keep it
under 5 minutes. Upload as Unlisted on YouTube and paste that link in the
Hack4Hack form's "Demo video" field.

Demo accounts (seeded live): demo1@teamforge.dev / Demo1234! and
demo2@teamforge.dev / Demo1234!

## 0:00–0:30 — Intro (show the live site)
"Hi, I'm Asmit Sarkar. This is TeamForge — race-proof team formation for
hackathons, built for Hack4Hack PS1. The problem: hundreds of people click
Join at the same second, and exactly one must get the last seat. I'll show
you the board, a team forming live, and the test that proves the race is
safe."

## 0:30–1:15 — Register + create a team
Log in as demo1. Open the board — it lists teams and people looking for
teammates. Click Create Team, name it, pick skills. Point out: the team
gets an 8-character invite code that expires in 48 hours, and the board
updates live for everyone without refresh.

## 1:15–2:15 — Invite + join request
Copy the invite code. Switch to demo2 (second account). Join with the code
/ send a join request. Back as demo1 (leader), show the pending request and
click Accept. The member list grows to 2 and the audit log records
`request_accepted` and `member_joined` — show the audit log on the team page.

## 2:15–3:15 — The race proof (terminal)
Show the terminal: `npm run test:race`. Explain in one line: "50 people race
for the last seat — exactly 1 success, 49 get a clean 409 TEAM_FULL, team
size stays 4." Show the passing output. Mention the join also runs inside a
MongoDB transaction with an atomic seat check, and retries with the same
Idempotency-Key never join twice.

## 3:15–4:15 — Suggestions + live board
Open Suggestions as demo2: ranked teammates with skill score, timezone
score and a reason — formula 0.6 skill + 0.4 timezone, explained on screen.
Go back to the board and show it updating live when a team changes
(Socket.io, no refresh). Show the responsive layout briefly if you can:
same board on phone width.

## 4:15–4:50 — What it is + close
"36 API tests green, seed of 10,000 users and 2,000 teams, board load test
p95 67.7 milliseconds at 100 concurrent users against a 200 millisecond
target. Stack: React, Node.js, Express, MongoDB, Socket.io. The repo and
live URL are in the submission. Thanks — I'm Asmit, and I can walk through
any line of this code in the interview."

## Recording tips
- Record in a quiet place; speak slowly and clearly.
- Do the demo once off-camera first so clicks land first time.
- If a step fails on camera, say so honestly and show the retry — do not
  re-record to hide it.
- Keep the terminal font large enough to read on a laptop screen.
- Total must stay under 5:00 — if you run long, cut the suggestions section
  to 30 seconds.
