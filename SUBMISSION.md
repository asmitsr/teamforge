# Hack4Hack submission — copy-paste fields

Fill these into the "Submit your project" form at hack4hack.com/workspace.
Fields marked TODO need the parent agent: create the GitHub repo, deploy, record the video.

- **Project name:** TeamForge
- **Theme:** Developer Tools / Collaboration
- **One-line pitch (≤140 chars):** Race-proof team formation for hackathons — 50 people race for the last seat and exactly one gets it, proven by test.
- **Description:**
  TeamForge is a production-grade team-formation service for a hackathon with 10,000 participants. Teams of 2–4 with expiring invite codes, leader-approved join requests, and a live "looking for teammates" board. Correctness under concurrency is the core: joins run in MongoDB transactions with an atomic conditional seat check, so 50 concurrent joiners for the last seat produce exactly 1 winner and 49 clean 409s (proven by an automated test, run 3x). Mutations are idempotent via Idempotency-Key, every team change is written to an audit log in the same transaction, and teammate suggestions rank people by complementary skills (60%) + timezone overlap (40%) with the formula explained. The React UI is responsive on desktop, laptop, tablet and mobile, and keyboard-only usable, with optimistic join + rollback on conflict and live Socket.io updates. Verified: 36 API tests green, seed of 10,000 users + 2,000 teams in 3.3s, board load test p95 72.3ms at 100 concurrent users (target <200ms), chaos test (SIGKILL mid-join) passes with no corruption. Stack: Node.js, Express, MongoDB (Mongoose), Socket.io, React, Vite.
- **Tech stack:** Node.js, Express, MongoDB, Mongoose, Socket.io, React, Vite, Jest, autocannon, Docker
- **Repository:** https://github.com/asmitsr/teamforge
- **Live demo:** https://teamforge-mu.vercel.app (frontend on Vercel; backend live on Railway https://teamforge-production-8d4a.up.railway.app)
- **Demo video:** https://youtu.be/oUe8eZ0ln5g?si=aK0BXHtXqcbV599e (uploaded Unlisted 8 Nov 15:52 Dhaka to Asmit Tech Hub; verified — plays, title correct, Unlisted confirmed via search check).
- **Pitch deck:** https://github.com/asmitsr/teamforge/blob/main/docs/DESIGN.md (optional field — the required 1-page design doc; user chose this link 8 Nov 2026).
