import { useEffect, useState } from 'react';
import { api, getSocket } from '../api.js';
import { go } from '../App.jsx';

// Team page: members, invite code, join requests, audit log.
// Join is OPTIMISTIC: you appear in the member list instantly; if the
// server says the seat is gone (409), the UI rolls you back out and says so.
export default function TeamDetail({ id, user }) {
  const [team, setTeam] = useState(null);
  const [requests, setRequests] = useState([]);
  const [logs, setLogs] = useState([]);
  const [inviteCode, setInviteCode] = useState('');
  const [msg, setMsg] = useState('');
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [loading, setLoading] = useState(true);
  const [copied, setCopied] = useState(false);
  const isLeader = team && team.leader && (team.leader._id === user.id || team.leader === user.id);
  const isMember = team && team.members.some((m) => (m.user._id || m.user) === user.id);

  async function load() {
    try {
      const data = await api.team(id);
      setTeam(data.team); setRequests(data.pendingRequests || []);
      if (data.isMember) { const a = await api.audit(id); setLogs(a.logs || []); }
      setError('');
    } catch (e) { setError(e.message); } finally { setLoading(false); }
  }
  useEffect(() => { load(); }, [id]);
  useEffect(() => {
    const s = getSocket();
    s.emit('join-team', id);
    const onUpdate = () => load();
    s.on('team:update', onUpdate);
    return () => { s.off('team:update', onUpdate); s.emit('leave-team', id); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  async function join() {
    if (!team || !inviteCode.trim()) { setError('Enter the invite code first.'); return; }
    const code = inviteCode.trim().toUpperCase();
    // Optimistic: add yourself immediately, roll back on failure.
    const optimistic = { user: { _id: user.id, name: `${user.name} (joining…)` }, joinedAt: new Date().toISOString() };
    const before = team;
    setTeam({ ...team, members: [...team.members, optimistic] });
    setError(''); setNotice('');
    try {
      const data = await api.joinTeam(id, code);
      setTeam(data.team);
      setNotice('You joined the team.');
    } catch (e) {
      setTeam(before); // rollback
      setError(e.code === 'TEAM_FULL' ? 'Too late — someone else took the last seat. The list is back to how it was.' : e.message);
    }
  }
  async function askToJoin() {
    try { await api.requestJoin(id, msg); setNotice('Join request sent. The leader will accept or decline it.'); setMsg(''); }
    catch (e) { setError(e.message); }
  }
  async function decide(reqId, accept) {
    try {
      if (accept) { const d = await api.acceptRequest(id, reqId); setTeam(d.team); }
      else await api.declineRequest(id, reqId);
      await load();
    } catch (e) { setError(e.message); }
  }
  async function leave() {
    if (!window.confirm('Leave this team? If you are the leader, leadership passes to the oldest remaining member.')) return;
    try { await api.leaveTeam(id); go('/board'); } catch (e) { setError(e.message); }
  }
  async function removeMember(userId, name) {
    if (!window.confirm(`Remove ${name} from the team?`)) return;
    try { await api.removeMember(id, userId); await load(); } catch (e) { setError(e.message); }
  }
  async function regen() {
    try { const d = await api.regenerateInvite(id); setTeam({ ...team, inviteCode: d.inviteCode }); setNotice('New invite code issued (valid 48 hours).'); }
    catch (e) { setError(e.message); }
  }
  function copyCode() {
    if (!team) return;
    const done = () => { setCopied(true); setTimeout(() => setCopied(false), 2000); };
    const fail = () => { setError('Copy did not work in this browser — please select the code above and copy it manually.'); };
    if (navigator.clipboard && navigator.clipboard.writeText) { navigator.clipboard.writeText(team.inviteCode).then(done, fail); return; }
    // Fallback for browsers without the async clipboard API: select + copy.
    try {
      const ta = document.createElement('textarea');
      ta.value = team.inviteCode;
      ta.setAttribute('readonly', '');
      ta.style.position = 'absolute'; ta.style.left = '-9999px';
      document.body.appendChild(ta); ta.select();
      const ok = document.execCommand('copy');
      document.body.removeChild(ta);
      if (ok) done(); else fail();
    } catch { fail(); }
  }
  if (loading) return <p role="status">Loading team…</p>;
  if (error && !team) return <p className="error" role="alert">{error}</p>;
  if (!team) return <p>Team not found.</p>;
  return (
    <section aria-labelledby="team-title">
      <h1 id="team-title">{team.name}</h1>
      <p className="muted">{team.description || 'No description yet.'}</p>
      <p><strong>{team.members.length}/{team.maxSize} members</strong> · {team.maxSize - team.members.length} seat{team.maxSize - team.members.length === 1 ? '' : 's'} left · Leader: {team.leader && team.leader.name}</p>
      {notice && <p className="live" role="status">{notice}</p>}
      {error && <p className="error" role="alert">{error}</p>}
      <h2>Members</h2>
      <ul className="member-list">
        {team.members.map((m) => (
          <li key={m.user._id || m.user}>
            <strong>{m.user.name}</strong> {(m.user.skills || []).join(', ')}
            <span className="muted"> · joined {new Date(m.joinedAt).toLocaleDateString()}</span>
            {(team.leader._id === m.user._id) && <span className="badge">Leader</span>}
            {isLeader && m.user._id !== user.id && (
              <button type="button" className="linklike danger" onClick={() => removeMember(m.user._id, m.user.name)}>Remove</button>)}
          </li>
        ))}
      </ul>
      {isMember && (
        <div className="invite-box">
          <h2>Invite code</h2>
          <p><code className="code">{team.inviteCode}</code> <span className="muted">(expires {new Date(team.inviteCodeExpiresAt).toLocaleString()})</span></p>
          <button type="button" className="btn" onClick={copyCode}>{copied ? 'Copied!' : 'Copy invite code'}</button>
          {isLeader && <button type="button" className="btn" onClick={regen}>Generate a new code</button>}
        </div>
      )}
      {!isMember && team.members.length >= team.maxSize && (
        <p className="error" role="status">This team is full ({team.members.length}/{team.maxSize} members) — you can ask the leader for a place on the board instead.</p>
      )}
      {!isMember && team.members.length < team.maxSize && (
        <div className="join-box">
          <h2>Join this team</h2>
          <label htmlFor="invite">Invite code<input id="invite" value={inviteCode} onChange={(e) => setInviteCode(e.target.value.toUpperCase())} placeholder="e.g. K7M2Q9XA" autoComplete="off" /></label>
          <button type="button" className="btn accent" onClick={join}>Join now</button>
          <p className="muted">No code? Ask the leader instead:</p>
          <label htmlFor="req-msg">Message to the leader<textarea id="req-msg" value={msg} onChange={(e) => setMsg(e.target.value)} maxLength={300} rows={2} /></label>
          <button type="button" className="btn primary" onClick={askToJoin}>Send join request</button>
        </div>
      )}
      {isLeader && requests.length === 0 && (
        <p className="muted">No pending join requests. New requests from the board will appear here for you to accept or decline.</p>
      )}
      {isLeader && requests.length > 0 && (
        <div><h2>Join requests ({requests.length})</h2>
          <ul className="member-list">{requests.map((r) => (
            <li key={r._id}><strong>{r.user.name}</strong> {(r.user.skills || []).join(', ')} — {r.message || 'No message'}
              <button type="button" className="btn primary" onClick={() => decide(r._id, true)}>Accept</button>{' '}
              <button type="button" className="btn" onClick={() => decide(r._id, false)}>Decline</button>
            </li>))}</ul>
        </div>
      )}
      {isMember && (
        <p><button type="button" className="btn danger" onClick={leave}>Leave team</button></p>
      )}
      {isMember && logs.length > 0 && (
        <div><h2>Team history (audit log)</h2>
          <ul className="member-list">{logs.map((l) => (
            <li key={l._id}>{new Date(l.createdAt).toLocaleString()} — <strong>{l.action.replaceAll('_', ' ')}</strong> {l.actor ? `by ${l.actor.name}` : ''} {l.details ? `· ${l.details}` : ''}</li>))}
          </ul>
        </div>
      )}
    </section>
  );
}
