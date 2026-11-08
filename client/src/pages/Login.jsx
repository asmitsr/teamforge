import { useState } from 'react';
import { api, saveAuth } from '../api.js';
export default function Login({ onAuth }) {
  const [mode, setMode] = useState('login');
  const [form, setForm] = useState({ name: '', email: '', password: '', skills: '', timezone: 'Asia/Dhaka', utcOffset: 6 });
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  function set(k, v) { setForm((f) => ({ ...f, [k]: v })); }
  async function submit(e) {
    e.preventDefault();
    setError(''); setBusy(true);
    try {
      const data = mode === 'login'
        ? await api.login({ email: form.email, password: form.password })
        : await api.register({ name: form.name, email: form.email, password: form.password,
            skills: form.skills.split(',').map((s) => s.trim()).filter(Boolean), timezone: form.timezone, utcOffset: Number(form.utcOffset) });
      saveAuth(data.token, data.user);
      onAuth(data.user);
    } catch (err) { setError(err.message); } finally { setBusy(false); }
  }
  return (
    <section aria-labelledby="login-title">
      <h1 id="login-title">{mode === 'login' ? 'Log in' : 'Create your account'}</h1>
      <p className="demo-note">Demo account: <strong>demo1@teamforge.dev</strong> / <strong>Demo1234!</strong> (seeded — see README).</p>
      {error && <p className="error" role="alert">{error}</p>}
      <form onSubmit={submit} className="form">
        {mode === 'register' && (<>
          <label htmlFor="name">Name<input id="name" value={form.name} onChange={(e) => set('name', e.target.value)} required minLength={2} autoComplete="name" /></label>
          <label htmlFor="skills">Skills (comma separated)<input id="skills" value={form.skills} onChange={(e) => set('skills', e.target.value)} placeholder="React, Node.js" autoComplete="off" /></label>
          <label htmlFor="timezone">Timezone
            <select id="timezone" value={`${form.timezone}|${form.utcOffset}`} onChange={(e) => { const [tz, off] = e.target.value.split('|'); set('timezone', tz); set('utcOffset', Number(off)); }}>
              <option value="Asia/Dhaka|6">Asia/Dhaka (UTC+6)</option>
              <option value="Asia/Kolkata|5.5">Asia/Kolkata (UTC+5:30)</option>
              <option value="Asia/Kathmandu|5.75">Asia/Kathmandu (UTC+5:45)</option>
              <option value="Asia/Singapore|8">Asia/Singapore (UTC+8)</option>
              <option value="UTC|0">UTC (UTC+0)</option>
              <option value="Europe/London|0">Europe/London (UTC+0)</option>
              <option value="Europe/Berlin|1">Europe/Berlin (UTC+1)</option>
              <option value="America/New_York|-5">America/New_York (UTC−5)</option>
              <option value="America/Los_Angeles|-8">America/Los_Angeles (UTC−8)</option>
              <option value="Australia/Sydney|11">Australia/Sydney (UTC+11)</option>
            </select>
          </label>
        </>)}
        <label htmlFor="email">Email<input id="email" type="email" value={form.email} onChange={(e) => set('email', e.target.value)} required autoComplete="email" /></label>
        <label htmlFor="password">Password (at least 8 characters)<input id="password" type="password" value={form.password} onChange={(e) => set('password', e.target.value)} required minLength={8} autoComplete={mode === 'login' ? 'current-password' : 'new-password'} /></label>
        <button className="btn accent" type="submit" disabled={busy}>{busy ? 'Please wait…' : mode === 'login' ? 'Log in' : 'Register'}</button>
      </form>
      <p><button type="button" className="linklike" onClick={() => setMode(mode === 'login' ? 'register' : 'login')}>
        {mode === 'login' ? 'No account yet? Register' : 'Already have an account? Log in'}</button></p>
    </section>
  );
}
