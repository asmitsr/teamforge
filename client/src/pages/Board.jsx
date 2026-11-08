import { useEffect, useRef, useState } from 'react';
import { api, getSocket } from '../api.js';
import { go } from '../App.jsx';
export default function Board({ user }) {
  const [data, setData] = useState({ teams: [], people: [] });
  const [q, setQ] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [liveNote, setLiveNote] = useState('');
  // The search box value is read through a ref so the live-update
  // listener is subscribed exactly once instead of on every keystroke.
  const qRef = useRef(q);
  qRef.current = q;
  async function load(query) {
    try { setData(await api.board(query)); setError(''); }
    catch (e) { setError(e.message); } finally { setLoading(false); }
  }
  useEffect(() => { load(''); }, []);
  // Live updates: any team change anywhere refreshes this board.
  useEffect(() => {
    const s = getSocket();
    const onUpdate = () => { setLiveNote('Live update received — refreshing…'); load(qRef.current); setTimeout(() => setLiveNote(''), 2000); };
    s.on('board:update', onUpdate);
    return () => { s.off('board:update', onUpdate); };
  }, []);
  function search(e) { e.preventDefault(); setLoading(true); load(q); }
  return (
    <section aria-labelledby="board-title">
      <h1 id="board-title">Looking for teammates</h1>
      <p className="muted">Teams with open seats and people looking for a team — updates live, no refresh needed.</p>
      {liveNote && <p className="live" role="status">{liveNote}</p>}
      <form onSubmit={search} className="search" role="search">
        <label htmlFor="q">Search teams<input id="q" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Team name" /></label>
        <button className="btn" type="submit">Search</button>
      </form>
      {loading && <p role="status">Loading the board…</p>}
      {error && <p className="error" role="alert">{error}</p>}
      {!loading && !error && data.teams.length === 0 && (<p>No teams are looking right now. Be the first — create a team. <button className="btn accent" type="button" onClick={() => go(user ? '/create' : '/login')}>{user ? 'Create a team' : 'Log in to create a team'}</button></p>)}
      <ul className="cards">
        {data.teams.map((t) => (
          <li key={t.id} className="card">
            <div className="card-head"><h2>{t.name}</h2></div>
            <p>{t.description || 'No description yet.'}</p>
            <p className="chip-row" aria-label={`Team size ${t.size} of ${t.maxSize}, ${t.seatsLeft} seats left`}>
              <span className="chip"><strong>{t.size}/{t.maxSize}</strong>&nbsp;members</span>
              <span className={t.seatsLeft > 0 ? 'chip chip-accent' : 'chip chip-danger'}>{t.seatsLeft} seat{t.seatsLeft === 1 ? '' : 's'} left</span>
              {t.size < 2 && <span className="badge">Forming — needs at least 2 members</span>}
            </p>
            <p className="muted">Members: {t.memberNames.join(', ') || '—'}</p>
            {t.skillsWanted.length > 0 && (
              <p className="chips"><span className="muted">Looking for:</span>{t.skillsWanted.map((s) => (<span key={s} className="chip">{s}</span>))}</p>
            )}
            <button className="btn primary" type="button" onClick={() => go(`/team/${t.id}`)}>{user ? 'View team' : 'Log in to view team'}</button>
          </li>
        ))}
      </ul>
      <h2>People looking for a team</h2>
      {data.people.length === 0 ? <p>No one is listed right now.</p> : (
        <ul className="cards">
          {data.people.map((p) => (
            <li key={p._id} className="card">
              <h3>{p.name}</h3>
              <p>{(p.skills || []).join(', ') || 'No skills listed'}</p>
              <p className="muted">{p.timezone} (UTC{p.utcOffset >= 0 ? '+' : ''}{p.utcOffset})</p>
              {p.bio && <p>{p.bio}</p>}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
