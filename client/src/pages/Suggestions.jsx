import { useEffect, useState } from 'react';
import { api } from '../api.js';
export default function Suggestions() {
  const [list, setList] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  useEffect(() => { api.suggestions().then((d) => { setList(d.suggestions || []); setLoading(false); }).catch((e) => { setError(e.message); setLoading(false); }); }, []);
  return (
    <section aria-labelledby="sug-title">
      <h1 id="sug-title">Teammates suggested for you</h1>
      <p className="muted">Ranked by complementary skills (60%) + timezone overlap (40%). Full formula: see README / DESIGN.md. To team up with someone here, find them on the board — or create a team and share your invite code with them.</p>
      {loading && <p role="status">Finding people…</p>}
      {error && <p className="error" role="alert">{error}</p>}
      {!loading && !error && list.length === 0 && <p>No suggestions right now — check back after more people join.</p>}
      <ul className="cards">
        {list.map((s) => (
          <li key={s.id} className="card">
            <h2>{s.name} <span className="badge badge-accent">{Math.round(s.score * 100)}% match</span></h2>
            <p>{(s.skills || []).join(', ')}</p>
            <p className="muted">{s.timezone} (UTC{s.utcOffset >= 0 ? '+' : ''}{s.utcOffset})</p>
            <p>{s.reason}</p>
            <p className="muted">Skills {Math.round(s.skillScore * 100)}% · Timezone {Math.round(s.timezoneScore * 100)}%</p>
            {s.bio && <p>{s.bio}</p>}
            <p><a className="btn primary" href="#/board">Find them on the board</a></p>
          </li>
        ))}
      </ul>
    </section>
  );
}
