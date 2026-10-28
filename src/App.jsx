import { Routes, Route, Navigate, NavLink } from 'react-router-dom'
import { useAuth } from './lib/auth.jsx'
import { configured, isManager } from './lib/supabase'
import Login from './screens/Login.jsx'
import Today from './screens/Today.jsx'
import Playbook from './screens/Playbook.jsx'
import Note from './screens/Note.jsx'
import Checklists from './screens/Checklists.jsx'
import Onboarding from './screens/Onboarding.jsx'
import HireDetail from './screens/HireDetail.jsx'
import Reports from './screens/Reports.jsx'
import Team from './screens/Team.jsx'
import Dashboard from './screens/Dashboard.jsx'
import Settings from './screens/Settings.jsx'

const Icon = ({ d }) => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d={d} /></svg>
const icons = {
  today: 'M3 12l9-9 9 9M5 10v10h14V10',
  playbook: 'M4 4h12a2 2 0 012 2v14H6a2 2 0 01-2-2V4zm0 0v14M8 8h6M8 12h6',
  checklists: 'M9 11l3 3L22 4M21 12v7a2 2 0 01-2 2H5a2 2 0 01-2-2V5a2 2 0 012-2h11',
  onboarding: 'M16 21v-2a4 4 0 00-4-4H6a4 4 0 00-4 4v2M9 11a4 4 0 100-8 4 4 0 000 8zM19 8v6M22 11h-6',
  reports: 'M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8zM14 2v6h6M8 13h8M8 17h5',
  team: 'M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2M9 11a4 4 0 100-8 4 4 0 000 8zM23 21v-2a4 4 0 00-3-3.87M16 3.13a4 4 0 010 7.75',
  dashboard: 'M3 3v18h18M7 14l4-4 4 4 5-6',
}

export default function App() {
  const { session, profile, role, signOut } = useAuth()

  if (!configured) return <div className="auth"><div className="card"><h1>Next Level <span>OS</span></h1><p>Missing Supabase settings. Add <code>VITE_SUPABASE_URL</code> and <code>VITE_SUPABASE_ANON_KEY</code> to the environment variables.</p></div></div>
  if (session === undefined) return <div className="auth"><p className="muted">Loading…</p></div>
  if (!session) return <Login />
  if (!profile) return <div className="auth"><p className="muted">Setting up your profile…</p></div>

  const manager = isManager(role)
  const tabs = [
    ['/', 'Today', icons.today],
    ['/playbook', 'Playbook', icons.playbook],
    ['/checklists', 'Checklists', icons.checklists],
    ['/reports', 'Reports', icons.reports],
    ...(manager || role === 'newhire' ? [['/onboarding', 'Onboarding', icons.onboarding]] : []),
    ['/team', 'Team', icons.team],
    ...(manager ? [['/dashboard', 'Dashboard', icons.dashboard]] : []),
  ]

  return (
    <div className="app">
      <header className="topbar">
        <div className="brand">NEXT <b>LEVEL</b> <i>OS</i></div>
        <div className="row">
          <NavLink to="/settings" className="pill gold">{profile.full_name || profile.email}</NavLink>
          <button className="btn ghost small" onClick={signOut}>Out</button>
        </div>
      </header>
      <main className="main">
        <Routes>
          <Route path="/" element={<Today />} />
          <Route path="/playbook" element={<Playbook />} />
          <Route path="/playbook/:slug" element={<Note />} />
          <Route path="/checklists" element={<Checklists />} />
          <Route path="/onboarding" element={<Onboarding />} />
          <Route path="/onboarding/:id" element={<HireDetail />} />
          <Route path="/reports" element={<Reports />} />
          <Route path="/team" element={<Team />} />
          <Route path="/dashboard" element={manager ? <Dashboard /> : <Navigate to="/" />} />
          <Route path="/settings" element={<Settings />} />
          <Route path="*" element={<Navigate to="/" />} />
        </Routes>
      </main>
      <nav className="tabbar">
        {tabs.map(([to, label, d]) => (
          <NavLink key={to} to={to} end={to === '/'} className={({ isActive }) => isActive ? 'active' : ''}>
            <Icon d={d} /><span>{label}</span>
          </NavLink>
        ))}
      </nav>
    </div>
  )
}
