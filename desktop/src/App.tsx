import React, { useState, useEffect, useRef } from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import { SERVER_URL } from './lib/serverUrl';
import LoginPage from './pages/LoginPage';
import AdminDashboard from './pages/AdminDashboard';
import CaretakerDashboard from './pages/CaretakerDashboard';
import PatientDashboard from './pages/PatientDashboard';

type SessionUser = { username: string; role: string; token: string; id?: number };
type Sessions = Record<string, SessionUser>;

const SESSIONS_KEY = 'sessions_by_role';
const SPLIT_KEY = 'split_view';

// DEMO ONLY -- delete this block and the auto-provision effect below before any
// real deployment. It lets split view open both panes without a manual sign-in.
const DEMO_CREDENTIALS: Record<string, { username: string; password: string }> = {
  patient: { username: 'patient', password: '123' },
  caretaker: { username: 'care', password: '123' },
};

const loginAs = async (role: string): Promise<SessionUser | null> => {
  const creds = DEMO_CREDENTIALS[role];
  if (!creds) return null;
  try {
    const res = await fetch(`${SERVER_URL}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams(creds),
    });
    if (!res.ok) return null;
    const data = await res.json();
    return { username: data.username, role: data.role, token: data.access_token, id: data.id };
  } catch {
    return null;
  }
};

const readSessions = (): Sessions => {
  try {
    return JSON.parse(localStorage.getItem(SESSIONS_KEY) || '{}');
  } catch {
    return {};
  }
};

const PaneConnecting: React.FC<{ role: string }> = ({ role }) => (
  <div className="w-full h-full flex items-center justify-center bg-zinc-50 dark:bg-zinc-950">
    <p className="text-sm text-zinc-400 capitalize">Connecting {role} session...</p>
  </div>
);

// Split view needs a token per role. A pane whose role has never signed in
// renders this instead of the dashboard.
const PaneLogin: React.FC<{ role: string; onAuthed: (u: SessionUser) => void }> = ({ role, onAuthed }) => {
  const [username, setUsername] = useState(role === 'caretaker' ? 'care' : role);
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError('');
    try {
      const res = await fetch(`${SERVER_URL}/api/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({ username, password }),
      });
      if (!res.ok) throw new Error('Incorrect username or password');
      const data = await res.json();
      if (data.role !== role) throw new Error(`That account is "${data.role}", not "${role}"`);
      onAuthed({ username: data.username, role: data.role, token: data.access_token, id: data.id });
    } catch (err: any) {
      setError(err?.message || 'Sign in failed');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="w-full h-full flex items-center justify-center bg-zinc-50 dark:bg-zinc-950 p-8">
      <form onSubmit={submit} className="w-full max-w-xs flex flex-col gap-3">
        <p className="text-xs uppercase tracking-widest text-zinc-400 font-bold">Split view</p>
        <h2 className="text-xl font-bold text-zinc-900 dark:text-zinc-100 capitalize">Sign in as {role}</h2>
        <p className="text-sm text-zinc-500 mb-2">This pane needs its own session. You only have to do this once.</p>
        <input
          className="px-4 py-3 rounded-xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 text-zinc-900 dark:text-zinc-100"
          value={username}
          onChange={(e) => setUsername(e.target.value)}
          placeholder="Username"
          autoComplete="username"
        />
        <input
          className="px-4 py-3 rounded-xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 text-zinc-900 dark:text-zinc-100"
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          placeholder="Password"
          autoComplete="current-password"
        />
        {error && <p className="text-sm text-red-500">{error}</p>}
        <button
          type="submit"
          disabled={busy}
          className="px-4 py-3 rounded-xl bg-brand-600 text-white font-semibold disabled:opacity-50"
        >
          {busy ? 'Signing in...' : 'Sign in'}
        </button>
      </form>
    </div>
  );
};

function App() {
  const [user, setUser] = useState<SessionUser | null>(null);
  const [sessions, setSessions] = useState<Sessions>({});
  const [splitView, setSplitView] = useState(false);
  const [autoFailed, setAutoFailed] = useState<Record<string, boolean>>({});
  const authInFlight = useRef<Record<string, boolean>>({});

  useEffect(() => {
    const savedToken = localStorage.getItem('token');
    const savedUser = localStorage.getItem('user');
    if (savedToken && savedUser) {
      setUser({ ...JSON.parse(savedUser), token: savedToken });
    }
    setSessions(readSessions());
    setSplitView(localStorage.getItem(SPLIT_KEY) === '1');
  }, []);

  // Split view needs a token per role. Sign both in automatically so the demo
  // never stops at a login form; falls back to PaneLogin if that fails.
  useEffect(() => {
    if (!splitView) return;
    (['patient', 'caretaker'] as const).forEach(async (role) => {
      if (sessions[role] || autoFailed[role] || authInFlight.current[role]) return;
      authInFlight.current[role] = true;
      const session = await loginAs(role);
      authInFlight.current[role] = false;
      if (session) {
        addSession(session);
      } else {
        setAutoFailed((prev) => ({ ...prev, [role]: true }));
      }
    });
  }, [splitView, sessions, autoFailed]);

  const addSession = (u: SessionUser) => {
    setSessions((prev) => {
      const next = { ...prev, [u.role]: u };
      localStorage.setItem(SESSIONS_KEY, JSON.stringify(next));
      return next;
    });
  };

  const handleLogin = (userData: any) => {
    const userInfo: SessionUser = {
      username: userData.username,
      role: userData.role,
      token: userData.access_token,
      id: userData.id,
    };
    setUser(userInfo);
    addSession(userInfo);
    localStorage.setItem('token', userData.access_token);
    localStorage.setItem('user', JSON.stringify({
      username: userData.username,
      role: userData.role,
      id: userData.id,
    }));
  };

  const handleLogout = () => {
    setUser(null);
    setSessions({});
    setSplitView(false);
    setAutoFailed({});
    localStorage.removeItem('token');
    localStorage.removeItem('user');
    localStorage.removeItem(SESSIONS_KEY);
    localStorage.removeItem(SPLIT_KEY);
  };

  const toggleSplit = () => {
    setSplitView((prev) => {
      const next = !prev;
      localStorage.setItem(SPLIT_KEY, next ? '1' : '0');
      return next;
    });
  };

  // Held as JSX rather than a nested component so React keeps the panes
  // mounted across re-renders and their sockets stay connected.
  const splitPanes = (
    <div className="flex w-screen h-screen overflow-hidden bg-zinc-800">
      <div className="relative flex-1 h-full overflow-hidden">
        {sessions.patient
          ? <PatientDashboard user={sessions.patient} onLogout={handleLogout} splitView onToggleSplit={toggleSplit} />
          : autoFailed.patient
            ? <PaneLogin role="patient" onAuthed={addSession} />
            : <PaneConnecting role="patient" />}
      </div>
      <div className="w-px h-full bg-zinc-700 shrink-0" />
      <div className="relative flex-1 h-full overflow-hidden">
        {sessions.caretaker
          ? <CaretakerDashboard user={sessions.caretaker} onLogout={handleLogout} splitView onToggleSplit={toggleSplit} />
          : autoFailed.caretaker
            ? <PaneLogin role="caretaker" onAuthed={addSession} />
            : <PaneConnecting role="caretaker" />}
      </div>
    </div>
  );

  return (
    <Router>
      <Routes>
        <Route
          path="/login"
          element={user ? <Navigate to={`/${user.role}`} /> : <LoginPage onLogin={handleLogin} />}
        />
        <Route
          path="/admin/*"
          element={user?.role === 'admin' ? <AdminDashboard onLogout={handleLogout} /> : <Navigate to="/login" />}
        />
        <Route
          path="/caretaker/*"
          element={
            user?.role === 'caretaker'
              ? (splitView
                  ? splitPanes
                  : <CaretakerDashboard user={user} onLogout={handleLogout} splitView={false} onToggleSplit={toggleSplit} />)
              : <Navigate to="/login" />
          }
        />
        <Route
          path="/patient/*"
          element={
            user?.role === 'patient'
              ? (splitView
                  ? splitPanes
                  : <PatientDashboard user={user} onLogout={handleLogout} splitView={false} onToggleSplit={toggleSplit} />)
              : <Navigate to="/login" />
          }
        />
        <Route path="*" element={<Navigate to="/login" />} />
      </Routes>
    </Router>
  );
}

export default App;
