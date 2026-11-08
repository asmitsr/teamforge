# TeamForge — Deploy checklist (free tier only)

The code is complete and verified (36/36 tests, race test, load p95 67.7ms in
sandbox). Deploy was blocked because the GitHub App cannot create a
repository (GitHub API 403) and Atlas/Render need an account signup. Do these
three steps, in order — about 15 minutes total — then tell Muse to finish the
deploy (Vercel frontend + live verification).

## A. Create the GitHub repo (2 min, on your phone)

1. Open https://github.com/new while logged in as `asmitsr`.
2. Repository name: `teamforge`
3. Description: `Race-proof team formation for hackathons — Hack4Hack PS1`
4. Public. Do NOT tick "Add a README file". Click **Create repository**.
5. Tell Muse "repo created". Muse then runs:
   `git remote add origin https://github.com/asmitsr/teamforge.git`
   `git push -u origin main` (one local commit is ready, `124dce2`).

## B. MongoDB Atlas M0 — free database (5 min)

1. Go to https://cloud.mongodb.com and sign up / log in (Google sign-in works).
2. Create → Shared **M0 Free** cluster (any region, e.g. Mumbai `ap-south-1`).
3. Database Access → Add Database User: username `teamforge`, password —
   generate one and save it (you will paste it into Render, never into chat).
4. Network Access → Add IP Address → **Allow access from anywhere**
   (`0.0.0.0/0`) — required because Render's IPs change.
5. Database → Connect → Drivers → copy the connection string. It looks like:
   `mongodb+srv://teamforge:<password>@cluster0.xxxxx.mongodb.net/teamforge`
   Keep it ready for step C.

## C. Render — free backend (5 min)

1. Go to https://dashboard.render.com, sign up / log in (GitHub sign-in works).
2. New + → **Web Service** → connect the `asmitsr/teamforge` repo.
3. Settings: Name `teamforge-server`, Region Singapore, Branch `main`,
   Root Directory `server`, Runtime `Node`, Build Command `npm install`,
   Start Command `node src/server.js`, Instance Type **Free**.
4. Environment variables (Advanced → Add):
   - `MONGODB_URI` = the Atlas string from step B
   - `JWT_SECRET` = any long random string (e.g. 32+ characters you invent)
   - `CLIENT_URL` = leave as `http://localhost:5173` for now; Muse updates it
     to the Vercel URL after step D
5. Create Web Service. Wait until it says **Live**. Copy its URL, e.g.
   `https://teamforge-server-xxxx.onrender.com`. Tell Muse the URL.
   (Free Render sleeps after inactivity — first request can take ~50s.)

## D. What Muse does next (no action from you)

1. Push the local commit to the new GitHub repo, verify files + CI on GitHub.
2. Create the Vercel project from `asmitsr/teamforge` (root `client`),
   set `VITE_API_URL` to the Render URL, deploy the frontend.
3. Update `CLIENT_URL` on Render to the Vercel URL, redeploy the backend.
4. Verify live: register, log in, create a team, board loads, Socket.io
   connects. Re-run the load test against the live board URL and record the
   real live numbers in `docs/LOAD_TEST_REPORT.md` (sandbox numbers are NOT
   live numbers).
5. Update `SUBMISSION.md` / `README.md` with the real repo + live demo URLs.

## Notes

- Never put the Atlas password or `JWT_SECRET` in the repo or in chat.
- Demo accounts (seeded by `npm run seed` with `MONGODB_URI` set):
  `demo1@teamforge.dev` / `Demo1234!`, `demo2@teamforge.dev` / `Demo1234!`
- Free Render sleeps; if the judges hit a cold start, the first load is slow
  — that is a free-tier limit, disclosed in the design doc.
