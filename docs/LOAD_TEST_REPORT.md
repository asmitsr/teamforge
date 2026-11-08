# TeamForge — Load Test Report

**Endpoint:** `GET /api/board` (public board: teams + people looking for teammates)
**Target:** p95 < 200ms with 100 concurrent users (PS1 requirement)
**Tool:** autocannon v9 (`server/scripts/load-test.js`, `npm run load`)
**Date:** 8 Nov 2026, 04:27 UTC (re-run by the independent verifier, measured in this sandbox)
**Dataset:** 50 teams + 200 users on the board (seeded by the script)

## Result — PASS

| Metric | Value |
|---|---|
| Requests (30s) | 64,542 |
| Throughput | 2,152 req/s |
| Status 2xx / non-2xx | 64,542 / 0 |
| Errors / timeouts | 0 / 0 |
| Latency p50 | 38 ms |
| Latency p90 | 53 ms |
| **Latency p95** | **67.7 ms** (interpolated — see Method) |
| Latency p97.5 | 75 ms |
| Latency p99 | 109 ms |
| Latency mean / max | 46.5 ms / 1,683 ms |
| **Verdict vs 200ms target** | **PASS** |

Raw JSON: [`docs/load-test-results.json`](load-test-results.json) (written by the script).

## Method

`node scripts/load-test.js` starts an in-memory MongoDB replica set, seeds 50
teams + 200 users, starts the real Express server, then runs autocannon with
100 connections for 30s against `/api/board`. No mocks: real HTTP, real DB.
autocannon v9 reports p90 and p97.5 but no p95, so p95 is linearly interpolated
between them (53 + (75−53)·⅔ = 67.7ms) and p97.5 is reported alongside it so the
interpolation can be checked. The script exits non-zero if p95 ≥ 200ms or any
request is non-2xx. (An earlier run on the same machine measured p95 76.7ms;
the number varies run to run, both well under the target.)

## What the numbers mean — and what they do not

- The board is cached in-process for ≤5s and invalidated on every team mutation
  (see DESIGN.md). This run measures the **cached production path**: most
  requests are cache hits; the ~5s cache refreshes under load are the slow tail
  (max 1,683ms is one such refresh).
- **Uncached baseline, same machine:** an earlier run without the cache measured
  p50 368ms, p95 ~558ms, p99 915ms at the same 100 users — a FAIL. The independent
  verifier re-measured the uncached path (filtered query `?q=`, never cached) on
  8 Nov 2026: 7,669 requests, p50 355ms, p95 511ms, p99 920ms — same conclusion.
  The cache is the difference, and it is disclosed here rather than hidden.
- **Environment caveat:** this sandbox has 4 CPUs and ~1GB free RAM with server,
  MongoDB and autocannon sharing the box. Production hardware (Render free tier +
  Atlas M0) will differ — re-run `npm run load` (or the k6 script in
  `server/load/k6-board.js`) against the deployed URL before quoting numbers.
- **Two bugs found by the load test, fixed:** (1) `express-rate-limit` was given
  an invalid `standardHeaders` value and threw on requests; (2) the general API
  rate limiter (300/15min/IP) was applied to the public board and 429'd 99% of
  the load-test traffic. The limiter now applies to auth + mutations only; the
  board is read-only, capped at 50 rows, and served from cache.

## Reproduce

```bash
cd server && npm run load
```
