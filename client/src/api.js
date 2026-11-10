// All HTTP + realtime access in one place, so pages stay simple.
// API base: same origin in dev (Vite proxy) or VITE_API_URL in production.
import { io } from 'socket.io-client';
const API = import.meta.env.VITE_API_URL || '';
export function getToken() { return localStorage.getItem('tf_token'); }
export function getUser() { try { return JSON.parse(localStorage.getItem('tf_user') || 'null'); } catch { return null; } }
export function saveAuth(token, user) { localStorage.setItem('tf_token', token); localStorage.setItem('tf_user', JSON.stringify(user)); }
export function clearAuth() { localStorage.removeItem('tf_token'); localStorage.removeItem('tf_user'); }
export async function request(path, { method = 'GET', body, token, idempotencyKey } = {}) {
  const res = await fetch(API + path, { method, headers: { 'Content-Type': 'application/json',
    ...(token || getToken() ? { Authorization: `Bearer ${token || getToken()}` } : {}),
    ...(idempotencyKey ? { 'Idempotency-Key': idempotencyKey } : {}) },
    ...(body ? { body: JSON.stringify(body) } : {}) });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) { const err = new Error((data.error && data.error.message) || `Request failed (${res.status})`); err.status = res.status; err.code = data.error && data.error.code; throw err; }
  return data;
}
export const api = {
  captcha: () => request('/api/captcha'),
  register: (d) => request('/api/auth/register', { method: 'POST', body: d }),
  login: (d) => request('/api/auth/login', { method: 'POST', body: d }),
  board: (q) => request('/api/board' + (q ? `?q=${encodeURIComponent(q)}` : '')),
  myTeam: () => request('/api/teams/mine'),
  team: (id) => request(`/api/teams/${id}`),
  createTeam: (d) => request('/api/teams', { method: 'POST', body: d, idempotencyKey: `web-${Date.now()}-${Math.random().toString(36).slice(2)}` }),
  joinTeam: (id, inviteCode) => request(`/api/teams/${id}/join`, { method: 'POST', body: { inviteCode }, idempotencyKey: `join-${id}-${Date.now()}` }),
  requestJoin: (id, message) => request(`/api/teams/${id}/request`, { method: 'POST', body: { message } }),
  acceptRequest: (teamId, reqId) => request(`/api/teams/${teamId}/requests/${reqId}/accept`, { method: 'POST' }),
  declineRequest: (teamId, reqId) => request(`/api/teams/${teamId}/requests/${reqId}/decline`, { method: 'POST' }),
  leaveTeam: (id) => request(`/api/teams/${id}/leave`, { method: 'POST' }),
  removeMember: (teamId, userId) => request(`/api/teams/${teamId}/remove/${userId}`, { method: 'POST' }),
  regenerateInvite: (id) => request(`/api/teams/${id}/regenerate-invite`, { method: 'POST' }),
  audit: (id) => request(`/api/teams/${id}/audit`),
  suggestions: () => request('/api/suggestions'),
  metrics: () => request('/api/metrics'),
};
// One shared socket. Pages subscribe to board:update / team:update and
// refetch — no refresh needed, and a failed refetch never crashes the page.
let socket = null;
export function getSocket() {
  if (!socket) socket = io(API || undefined, { autoConnect: true });
  return socket;
}
