# Hack4Hack submission — copy-paste fields

Fill these into the "Submit your project" form at hack4hack.com/workspace.
Fields marked TODO need the parent agent: create the GitHub repo, deploy, record the video.

- **Project name:** TeamForge
- **Theme:** Developer Tools / Collaboration
- **One-line pitch (≤140 chars):** Race-proof team formation for hackathons — 50 people race for the last seat and exactly one gets it, proven by test.
- **Description:**
  TeamForge is a production-grade team-formation service for a hackathon with 10,000 participants. Teams of 2–4 with expiring invite codes, leader-approved join requests, and a live "looking for teammates" board. Correctness under concurrency is the core: joins run in MongoDB transactions with an atomic conditional seat check, so 50 concurrent joiners for the last seat produce exactly 1 winner and 49 clean 409s (proven by an automated test, run 3x). Mutations are idempotent via Idempotency-Key, every team change is written to an audit log in the same transaction, and teammate suggestions rank people by complementary skills (60%) + timezone overlap (40%) with the formula explained. The React UI is responsive on desktop, laptop, tablet and mobile, and keyboard-only usable, with optimistic join + rollback on conflict and live Socket.io updates. Verified: 36 API tests green, seed of 10,000 users + 2,000 teams in 3.2s, board load test p95 67.7ms at 100 concurrent users (target <200ms), chaos test (SIGKILL mid-join) passes with no corruption. Stack: Node.js, Express, MongoDB (Mongoose), Socket.io, React, Vite.
- **Tech stack:** Node.js, Express, MongoDB, Mongoose, Socket.io, React, Vite, Jest, autocannon, Docker
- **Repository:** https://github.com/asmitsr/teamforge — TODO: repo does not exist yet; create it and push this code, then paste the real URL.
- **Live demo:** TODO: deploy (server on Render/Railway + client on Vercel, Atlas M0) and paste the URL. See README "Deploy".
- **Demo video:** TODO: record a ≤5-minute walkthrough on the phone (script: register → create team → copy invite code → second account joins → race test in terminal → board live update → suggestions → audit log) and paste the link.
- **Pitch deck:** TODO (optional field — leave blank or link the DESIGN.md if accepted).
