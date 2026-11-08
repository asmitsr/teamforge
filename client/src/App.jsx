import { useEffect, useState } from 'react';
import { getUser, clearAuth } from './api.js';
import Login from './pages/Login.jsx';
import Board from './pages/Board.jsx';
import CreateTeam from './pages/CreateTeam.jsx';
import TeamDetail from './pages/TeamDetail.jsx';
import MyTeam from './pages/MyTeam.jsx';
import Suggestions from './pages/Suggestions.jsx';

// Tiny hash router — no extra dependency, and every route is a real URL
// you can bookmark or share (#/team/<id>).
function useHashRoute() {
  const [hash, setHash] = useState(window.location.hash || '#/board');
  useEffect(() => {
    const onChange = () => setHash(window.location.hash || '#/board');
    window.addEventListener('hashchange', onChange);
    return () => window.removeEventListener('hashchange', onChange);
  }, []);
  return hash.replace(/^#/, '') || '/board';
}
export function go(path) { window.location.hash = '#' + path; }

export default function App() {
  const [user, setUser] = useState(getUser());
  const route = useHashRoute();
  const authed = !!user;
  function logout() { clearAuth(); setUser(null); go('/board'); }
  // Current route, for the active nav state (colour + underline + aria-current).
  const navLink = (path, label) => (
    <a href={'#' + path} className={route === path ? 'active' : undefined} aria-current={route === path ? 'page' : undefined}>{label}</a>
  );
  let page = null;
  if (route === '/login') page = <Login onAuth={(u) => { setUser(u); go('/board'); }} />;
  else if (route === '/board') page = <Board user={user} />;
  else if (route === '/create') page = authed ? <CreateTeam /> : <Login onAuth={(u) => { setUser(u); go('/create'); }} />;
  else if (route.startsWith('/team/')) page = authed ? <TeamDetail id={route.split('/')[2]} user={user} /> : <Login onAuth={(u) => { setUser(u); }} />;
  else if (route === '/my-team') page = authed ? <MyTeam user={user} /> : <Login onAuth={(u) => { setUser(u); go('/my-team'); }} />;
  else if (route === '/suggestions') page = authed ? <Suggestions /> : <Login onAuth={(u) => { setUser(u); go('/suggestions'); }} />;
  else page = <Board user={user} />;
  return (
    <div>
      <a className="skip-link" href="#main">Skip to main content</a>
      <header className="topbar">
        <div className="topbar-inner">
          <a className="brand" href="#/board">Team<span className="brand-accent">Forge</span></a>
          <nav aria-label="Main">
            {navLink('/board', 'Board')}
            {navLink('/suggestions', 'Suggestions')}
            {authed && navLink('/my-team', 'My team')}
            {authed && navLink('/create', 'Create team')}
          </nav>
          <div className="auth-area">
            {authed ? (<><span className="hello">Hi, {user.name}</span><button type="button" className="btn on-dark" onClick={logout}>Log out</button></>)
              : (<a className="btn on-dark" href="#/login">Log in / Register</a>)}
          </div>
        </div>
      </header>
      <main id="main" className="container">{page}</main>
      <footer className="footer"><p>TeamForge — Hack4Hack Crew Hiring Challenge 2026, PS1. Race-proof team formation: one seat, one winner.</p></footer>
    </div>
  );
}
