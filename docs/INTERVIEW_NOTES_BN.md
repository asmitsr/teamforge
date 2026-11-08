# TeamForge — Interview Notes (বাংলায়)

এই ফাইলটা তোমার জন্য — interview-তে (২৩–২৬ নভেম্বর) প্রতিটা লাইন বোঝাতে পারার জন্য।
টেকনিক্যাল শব্দগুলো ইংরেজিতে রাখা হয়েছে, কারণ interview ইংরেজিতেই হবে; ব্যাখ্যা বাংলায়।

## ১. প্রজেক্টটা এক লাইনে

TeamForge হলো হ্যাকাথনের টিম বানানোর সার্ভিস। ১০,০০০ জনের হ্যাকাথনে ৫০ জন একসাথে
শেষ সিটে ক্লিক করলেও ঠিক **১ জন** পাবে — এটা automated test দিয়ে প্রমাণ করা আছে।

## ২. ফোল্ডার আর ফাইল — কোনটা কী করে (১–২ লাইনে)

**server/ (Node + Express + Mongoose)**
- `src/server.js` — সার্ভার চালু করে: MongoDB-তে connect, Socket.io বসায়, port-এ listen করে।
- `src/app.js` — Express app বানায়: helmet, CORS, JSON parse, routes বসানো, error handler।
- `src/config.js` — সব setting env variable থেকে নেয় (PORT, MONGODB_URI, JWT_SECRET...)।
- `src/db.js` — MongoDB-তে connect করার ছোট helper।
- `src/models/User.js` — ইউজার: নাম, email, passwordHash, skills, timezone, `teamId`।
  `teamId` হলো "একজন একটাই টিমে" নিয়মের মূল — এটা null মানে সে কোনো টিমে নেই।
- `src/models/Team.js` — টিম: নাম, leader, `members[{user, joinedAt}]`, maxSize 4,
  inviteCode, inviteCodeExpiresAt (৪৮ ঘণ্টা), skillsWanted।
- `src/models/JoinRequest.js` — জয়েন রিকোয়েস্ট: team, user, status (pending/accepted/declined)।
- `src/models/AuditLog.js` — প্রতিটা টিম-পরিবর্তনের লগ: কে, কী করলো, কখন।
- `src/models/IdempotencyKey.js` — Idempotency-Key আর তার উত্তর সংরক্ষণ করে (২৪ ঘণ্টা TTL)।
- `src/routes/auth.js` — register/login; bcrypt দিয়ে পাসওয়ার্ড hash, JWT token দেয়।
- `src/routes/teams.js` — আসল কাজ: টিম বানানো, invite code-এ জয়েন, রিকোয়েস্ট accept/decline,
  leave (leader বদল / টিম delete), member remove, invite regenerate, audit দেখা।
- `src/routes/board.js` — পাবলিক board: টিম + মানুষের লিস্ট; ৫ সেকেন্ডের cache আছে।
- `src/routes/suggestions.js` — সাজেশন: complementary skill + timezone দিয়ে র‍্যাঙ্ক।
- `src/routes/metricsRoute.js` — `/api/metrics`: কত request, কত টিম, কত জয়েন।
- `src/middleware/auth.js` — JWT token চেক করে, না থাকলে 401 দেয়।
- `src/middleware/rateLimit.js` — rate limit: login ২০/১৫ মিনিট, ভুল invite code ৫/১০ মিনিট।
- `src/middleware/validate.js` — zod দিয়ে input চেক করে, ভুল হলে 400 দেয়।
- `src/middleware/idempotency.js` — একই Idempotency-Key দুবার এলে দ্বিতীয়বার handler চালায় না।
- `src/middleware/error.js` — সব error এক জায়গায় ধরে, stack trace বাইরে পাঠায় না।
- `src/socket.js` — Socket.io: board-এ `board:update`, টিম পেজে `team:update` পাঠায়।
- `src/utils/inviteCode.js` — ৮ অক্ষরের invite code বানায় (Crockford alphabet: I, L, O, U নেই,
  তাই ফোনে শুনে ভুল হয় না; ৩২^৮ ≈ ১.১ ট্রিলিয়ন কম্বিনেশন)।
- `src/utils/scoring.js` — সাজেশনের স্কোরের ফর্মুলা (নিচে দেখো)।
- `tests/app.test.js` — ৩২টা টেস্ট: auth, টিম, জয়েন, রিকোয়েস্ট, idempotency, leave, board...
- `tests/race.test.js` — ৪টা টেস্ট: ৫০ জনের race, ১০ টিমে একসাথে জয়েন, concurrent idempotency, chaos।
- `scripts/seed.js` — ১০,০০০ ইউজার + ২,০০০ টিম বানায় (৩.২ সেকেন্ড, verifier-এর re-run)।
- `scripts/load-test.js` — autocannon দিয়ে ১০০ concurrent ইউজারে board-এর load test।
- `scripts/chaos-test.js` — সার্ভারকে SIGKILL করে মাঝখানে মেরে আবার চালিয়ে DB চেক করে।
- `load/k6-board.js` — k6 দিয়ে load test-এর বিকল্প স্ক্রিপ্ট।

**client/ (React + Vite, plain CSS)**
- `src/api.js` — সব API call + Socket.io connection এক জায়গায়।
- `src/App.jsx` — ছোট hash router (`#/board`, `#/team/:id`...) আর উপরের ন্যাভবার।
- `src/pages/Board.jsx` — board: টিমের কার্ড, সার্চ, live update এলে নিজে refresh হয়।
- `src/pages/Login.jsx` — login/register ফর্ম।
- `src/pages/CreateTeam.jsx` — টিম বানানোর ফর্ম।
- `src/pages/TeamDetail.jsx` — টিম পেজ: মেম্বার, invite code (copy বাটন), রিকোয়েস্ট,
  audit log, leave/remove। জয়েন optimistic: ক্লিক করলেই তুমি লিস্টে আসো, 409 এলে rollback।
- `src/pages/MyTeam.jsx` — আমার টিম (না থাকলে board-এ পাঠায়)।
- `src/pages/Suggestions.jsx` — সাজেশন লিস্ট, স্কোরসহ।
- `src/styles.css` — মোবাইল-ফার্স্ট CSS; keyboard-এ চলার জন্য focus সবসময় দেখা যায়।

## ৩. Race-proof কীভাবে কাজ করে (সবচেয়ে গুরুত্বপূর্ণ প্রশ্ন)

**সমস্যা:** ৫০ জন একসাথে শেষ সিটে ক্লিক করলে, সাধারণ কোডে সবাই "সিট খালি আছে" দেখে
সবাইকে ঢুকিয়ে দেবে — টিম ৪ জনের জায়গায় ১০ জন হয়ে যাবে।

**আমার সমাধান — দুই স্তর:**
1. **Transaction:** জয়েন/accept/leave — সবকিছু MongoDB transaction-এর ভেতরে চলে।
   Team + User.teamId + AuditLog একসাথে বদলায়, নয়তো কিছুই বদলায় না।
   Transaction চালাতে replica set লাগে (Atlas M0-তে আছে, টেস্টে in-memory replica set)।
2. **Atomic conditional update:** সিট নেওয়া হয় একটাই `findOneAndUpdate` দিয়ে, যার
   শর্ত: `members.size < maxSize` AND invite code এখনো valid AND ইউজার ইতিমধ্যে মেম্বার নয়।
   দুজন একসাথে একই টিম ডকুমেন্ট বদলাতে গেলে MongoDB একজনের transaction abort করে
   (write conflict); abort হওয়া জন retry করে, তখন দেখে সিট শেষ — 409 TEAM_FULL পায়।
   তাই ৫০ জনে ঠিক ১ জন জেতে। টেস্টে ৩ বার চালিয়ে প্রমাণ করা হয়েছে: ১ success, ৪৯ fail।

**একজন একটাই টিমে — concurrency-তেও:** একই ইউজার ১০টা টিমে একসাথে জয়েন করতে গেলে,
দ্বিতীয়বার `User.teamId` বদলাতে গিয়ে write conflict হয়, retry-তে দেখে teamId সেট হয়ে
গেছে — 409 ALREADY_IN_TEAM। টেস্ট আছে।

## ৪. Idempotency কীভাবে কাজ করে

ডাবল-ক্লিক বা নেটওয়ার্ক গোলমালে একই request দুবার এলে যাতে দুটো টিম না হয়:
প্রতিটা mutation-এ ক্লায়েন্ট `Idempotency-Key` হেডার পাঠায়। প্রথম request key-টা
atomicভাবে claim করে (unique index-এ insert, "processing" লেখা থাকে)। দ্বিতীয়
request দেখে key আছে — handler আর চালায় না, প্রথমবারের উত্তরটাই ফেরত দেয়।
১০টা concurrent একই key-এর request-এ ১টাই টিম হয়, ১০টাই একই 201 পায় — টেস্ট আছে।

## ৫. Realtime কীভাবে কাজ করে

Socket.io। সার্ভার কোনো টিম-পরিবর্তন সফল হলে `board:update` সবাইকে আর
`team:update` ওই টিমের room-এ পাঠায়। ক্লায়েন্ট শুনে পেজ refetch করে — refresh লাগে না।
কোনো event মিস হলেও পরের event-এ ঠিক হয়ে যায়, কারণ ক্লায়েন্ট সার্ভার থেকে
আবার ডেটা আনে (নিজের state-এর উপর ভরসা করে না)।

## ৬. Suggestions-এর ফর্মুলা

`score = 0.6 × skillScore + 0.4 × timezoneScore`
- skillScore = (candidate-এর যে skill তোমার নেই) / (candidate-এর মোট skill) —
  মানে complementary skill-কে পুরস্কার দেওয়া হয়, একই skill-কে নয়।
- timezoneScore = `1 − |Δoffset| / 12` — একই timezone হলে ১, ১২ ঘণ্টা তফাৎ হলে ০।
- skill-এর ওজন বেশি (০.৬), কারণ একসাথে বানাতে না পারলে টিম ব্যর্থ হবে, দেখা হওয়া
  তার চেয়ে কম গুরুত্বপূর্ণ — তবুও timezone জরুরি, তাই ০.৪।

## ৭. সম্ভাব্য interview প্রশ্নোত্তর

**Q: Transaction ছাড়া শুধু atomic update দিয়ে হতো না?**
A: সিট বাঁচাতে হতো, কিন্তু User.teamId আর audit log একসাথে বদলানো যেত না — একটা
সফল হয়ে আরেকটা ব্যর্থ হলে ডেটা অমিল হতো। তাই transaction। Trade-off: replica set
লাগে, আর একটু latency বাড়ে — correctness-এর জন্য সেটা মেনে নেওয়া হয়েছে।

**Q: Board cache করলে ডেটা stale হয় না?**
A: Cache শুধু ৫ সেকেন্ডের, আর প্রতিটা mutation-এ cache clear হয় (emitBoard)।
তাই mutation-এর পরপরই নতুন ডেটা দেখা যায়। Cache ছাড়া এই মেশিনে p95 ছিল ~৫৫৮ms,
cache-সহ ৭৬.৭ms — এটা load report-এ লুকানো হয়নি, খোলাখুলি লেখা আছে।

**Q: Invite code brute-force করা যাবে না কেন?**
A: ৩২^৮ কম্বিনেশন, আর ভুল code-এ ৫ বার চেষ্টার পর ১০ মিনিট block (প্রতি IP+team)।
সঠিক code-এর race-কে throttle করা হয় না — শুধু ভুল চেষ্টা গোনা হয়।

**Q: Leader চলে গেলে কী হয়? শেষ মেম্বার গেলে?**
A: Leader গেলে সবচেয়ে পুরনো মেম্বার (earliest joinedAt) leader হয়। শেষ মেম্বার
গেলে টিম আর তার pending request delete হয়ে যায় — খালি ghost team থাকে না।

**Q: এক সার্ভারের বেশি চালালে কী ভাঙবে?**
A: দুটো জিনিস: board cache প্রতি instance-এ আলাদা (≤৫ সেকেন্ড অমিল হতে পারে),
আর Socket.io-র Redis adapter নেই, তাই এক instance-এর update অন্য instance-এর
ক্লায়েন্ট পাবে না। এটাই "এক সপ্তাহ বেশি পেলে" তালিকার ১ নম্বর কাজ — Redis।

**Q: কেন MongoDB, কেন SQL নয়?**
A: Team-এর members embedded array হিসেবে রাখলে "কতটা ভরা" একটা document read-এ
জানা যায়, আর size check + push একটাই atomic update-এ করা যায়। SQL-এও করা যেত
(row lock দিয়ে), কিন্তু এই মডেলে MongoDB-র transaction + conditional update
সবচেয়ে সরাসরি মেলে।

## ৮. যাচাই করা সংখ্যা (মুখস্থ রাখো)

- টেস্ট: **৩৬টা, সব pass** (৩২ functional + ৪ race/chaos)। Race test ৩ বার চালানো — প্রতিবার ১/৫০।
- Seed: ১০,০০০ ইউজার + ২,০০০ টিম, **৩.৫ সেকেন্ড**।
- Load test: board, ১০০ concurrent, ৩০ সেকেন্ড — **p95 ৭৬.৭ms, p99 ১৩৬ms, ৬৪,৬২৩ request, ০ error** (target <২০০ms, PASS)।
- Chaos test: SIGKILL-এর পর **PASS** — টিম size ৪ (max ৪), কোনো duplicate মেম্বার নেই।
- Client build: ২০২KB JS (৬৪KB gzip), ১.৫৫ সেকেন্ডে build।
