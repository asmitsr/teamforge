// k6 alternative to the autocannon load test (k6 is NOT installed in this
// sandbox; autocannon is the verified path — see scripts/load-test.js).
// Run: k6 run -e BOARD_URL=https://<your-live-url>/api/board load/k6-board.js
import http from 'k6/http';
import { check } from 'k6';
export const options = { vus: 100, duration: '30s', thresholds: { http_req_duration: ['p(95)<200'] } };
export default function () {
  const res = http.get(__ENV.BOARD_URL || 'http://localhost:5000/api/board');
  check(res, { 'status 200': (r) => r.status === 200 });
}
