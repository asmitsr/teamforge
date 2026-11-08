import { useState } from 'react';
import { api } from '../api.js';
import { go } from '../App.jsx';
export default function CreateTeam() {
  const [form, setForm] = useState({ name: '', description: '', skillsWanted: '' });
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  function set(k, v) { setForm((f) => ({ ...f, [k]: v })); }
  async function submit(e) {
    e.preventDefault(); setError(''); setBusy(true);
    try {
      const team = await api.createTeam({ name: form.name, description: form.description,
        skillsWanted: form.skillsWanted.split(',').map((s) => s.trim()).filter(Boolean) });
      go(`/team/${team.team.id}`);
    } catch (err) { setError(err.message); } finally { setBusy(false); }
  }
  return (
    <section aria-labelledby="create-title">
      <h1 id="create-title">Create a team</h1>
      <p className="muted">Teams have 2–4 members. You become the leader and get an invite code (valid 48 hours) to share.</p>
      {error && <p className="error" role="alert">{error}</p>}
      <form onSubmit={submit} className="form">
        <label htmlFor="team-name">Team name<input id="team-name" value={form.name} onChange={(e) => set('name', e.target.value)} required minLength={2} maxLength={80} /></label>
        <label htmlFor="team-desc">What are you building?<textarea id="team-desc" value={form.description} onChange={(e) => set('description', e.target.value)} maxLength={500} rows={3} /></label>
        <label htmlFor="team-skills">Skills you are looking for (comma separated)<input id="team-skills" value={form.skillsWanted} onChange={(e) => set('skillsWanted', e.target.value)} placeholder="Node.js, UI/UX" /></label>
        <button className="btn accent" type="submit" disabled={busy}>{busy ? 'Creating…' : 'Create team'}</button>
      </form>
    </section>
  );
}
