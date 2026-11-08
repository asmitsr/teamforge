import { useEffect, useState } from 'react';
import { api } from '../api.js';
import TeamDetail from './TeamDetail.jsx';
import { go } from '../App.jsx';
export default function MyTeam({ user }) {
  const [teamId, setTeamId] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  useEffect(() => {
    setLoading(true);
    api.myTeam()
      .then((d) => { setTeamId(d.team ? d.team.id : null); setError(''); setLoading(false); })
      .catch((e) => { setError(e.message); setLoading(false); });
  }, []);
  if (loading) return <p role="status">Loading your team…</p>;
  if (error) return (<section><h1>My team</h1><p className="error" role="alert">Could not load your team: {error}</p><p className="muted">The server may be waking up — please try again.</p><button className="btn primary" type="button" onClick={() => window.location.reload()}>Try again</button></section>);
  if (!teamId) return (<section><h1>My team</h1><p>You are not in a team yet.</p><button className="btn primary" type="button" onClick={() => go('/board')}>Find a team on the board</button>{' '}<button className="btn" type="button" onClick={() => go('/create')}>Create a team</button></section>);
  return <TeamDetail id={teamId} user={user} />;
}
