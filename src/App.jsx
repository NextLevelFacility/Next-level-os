import { useState } from 'react'
import { Routes, Route, Navigate, NavLink, useLocation } from 'react-router-dom'
import { useAuth } from './lib/auth.jsx'
import { configured, isManager, isCoach, isDirector } from './lib/supabase'
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
import Athletes from './screens/Athletes.jsx'
import AthleteDetail from './screens/AthleteDetail.jsx'
import LogSession from './screens/LogSession.jsx'
import PlayerReport from './screens/PlayerReport.jsx'
import Method from './screens/Method.jsx'
import ModulePage from './screens/ModulePage.jsx'
import Ask from './screens/Ask.jsx'
import Clinics from './screens/Clinics.jsx'

const Icon = ({ d }) => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d={d} /></svg>
export const icons = {
  today: 'M3 12l9-9 9 9M5 10v10h14V10',
  playbook: 'M4 4h12a2 2 0 012 2v14H6a2 2 0 01-2-2V4zm0 0v14M8 8h6M8 12h6',
  checklists: 'M9 11l3 3L22 4M21 12v7a2 2 0 01-2 2H5a2 2 0 01-2-2V5a2 2 0 012-2h11',
  onboarding: 'M16 21v-2a4 4 0 00-4-4H6a4 4 0 00-4 4v2M9 11a4 4 0 100-8 4 4 0 000 8zM19 8v6M22 11h-6',
  reports: 'M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8zM14 2v6h6M8 13h8M8 17h5',
  team: 'M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2M9 11a4 4 0 100-8 4 4 0 000 8zM23 21v-2a4 4 0 00-3-3.87M16 3.13a4 4 0 010 7.75',
  dashboard: 'M3 3v18h18M7 14l4-4 4 4 5-6',
  athletes: 'M12 2a4 4 0 100 8 4 4 0 000-8zM4 22v-2a6 6 0 016-6h4a6 6 0 016 6v2M9 14l3 3 3-3',
  method: 'M2 3h6a4 4 0 014 4v14a3 3 0 00-3-3H2zM22 3h-6a4 4 0 00-4 4v14a3 3 0 013-3h7z',
  ask: 'M21 11.5a8.4 8.4 0 01-.9 3.8 8.5 8.5 0 01-7.6 4.7 8.4 8.4 0 01-3.8-.9L3 21l1.9-5.7a8.4 8.4 0 01-.9-3.8 8.5 8.5 0 014.7-7.6 8.4 8.4 0 013.8-.9h.5a8.5 8.5 0 018 8v.5z',
  more: 'M5 12h.01M12 12h.01M19 12h.01',
  clinics: 'M8 2v4M16 2v4M3 10h18M5 4h14a2 2 0 012 2v14a2 2 0 01-2 2H5a2 2 0 01-2-2V6a2 2 0 012-2zM9 15l2 2 4-4',
  settings: 'M12 15a3 3 0 100-6 3 3 0 000 6zM19.4 15a1.7 1.7 0 00.3 1.8l.1.1a2 2 0 11-2.8 2.8l-.1-.1a1.7 1.7 0 00-1.8-.3 1.7 1.7 0 00-1 1.5V21a2 2 0 11-4 0v-.1a1.7 1.7 0 00-1.1-1.5 1.7 1.7 0 00-1.8.3l-.1.1a2 2 0 11-2.8-2.8l.1-.1a1.7 1.7 0 00.3-1.8 1.7 1.7 0 00-1.5-1H3a2 2 0 110-4h.1a1.7 1.7 0 001.5-1.1 1.7 1.7 0 00-.3-1.8l-.1-.1a2 2 0 112.8-2.8l.1.1a1.7 1.7 0 001.8.3H9a1.7 1.7 0 001-1.5V3a2 2 0 114 0v.1a1.7 1.7 0 001 1.5 1.7 1.7 0 001.8-.3l.1-.1a2 2 0 112.8 2.8l-.1.1a1.7 1.7 0 00-.3 1.8V9a1.7 1.7 0 001.5 1H21a2 2 0 110 4h-.1a1.7 1.7 0 00-1.5 1z',
}

export default function App() {
  const { session, profile, role, roles, signOut } = useAuth()
  const [more, setMore] = useState(false)
  const loc = useLocation()

  if (!configured) return <div className="auth"><div className="card"><h1>Next Level <span>OS</span></h1><p>Missing Supabase settings. Add <code>VITE_SUPABASE_URL</code> and <code>VITE_SUPABASE_ANON_KEY</code> to the environment variables.</p></div></div>
  if (session === undefined) return <div className="auth"><p className="muted">Loading…</p></div>
  if (!session) return <Login />
  if (!profile) return <div className="auth"><p className="muted">Setting up your profile…</p></div>

  const manager = isManager(roles), coach = isCoach(roles)
  // Primary tabs (4) + More. People with two roles get the union, in priority order.
  const all = {
    today: ['/', 'Today', icons.today],
    athletes: ['/athletes', 'Athletes', icons.athletes],
    method: ['/method', 'Method', icons.method],
    playbook: ['/playbook', 'Playbook', icons.playbook],
    checklists: ['/checklists', 'Checklists', icons.checklists],
    reports: ['/reports', 'Reports', icons.reports],
    hires: ['/onboarding', manager ? 'Hires' : 'My plan', icons.onboarding],
    team: ['/team', 'Team', icons.team],
    ceo: ['/dashboard', role === 'owner' ? 'CEO' : 'KPIs', icons.dashboard],
    ask: ['/ask', 'Ask', icons.ask],
    clinics: ['/clinics', 'Clinics', icons.clinics],
    settings: ['/settings', 'You', icons.settings],
  }
  const wants = ['today']
  if (manager) wants.push('ceo', 'athletes')
  if (coach) wants.push('athletes', 'method')
  if (roles.includes('sales')) wants.push('clinics', 'reports')
  if (roles.includes('frontdesk')) wants.push('checklists', 'clinics')
  if (role === 'newhire') wants.push('hires', 'playbook')
  wants.push('ask', 'clinics', 'playbook', 'checklists', 'reports', 'method', 'hires', 'team', 'settings')
  const ordered = [...new Set(wants)].filter(k => k !== 'hires' || manager || role === 'newhire').filter(k => k !== 'ceo' || manager).filter(k => k !== 'method' || coach)
  const primary = ordered.slice(0, 4), extra = ordered.slice(4)
  const isExtraActive = extra.some(k => loc.pathname.startsWith(all[k][0]) && all[k][0] !== '/')

  const Tab = ({ k }) => { const [to, label, d] = all[k]; return <NavLink to={to} end={to === '/'} onClick={() => setMore(false)} className={({ isActive }) => isActive ? 'active' : ''}><Icon d={d} /><span>{label}</span></NavLink> }

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
          <Route path="/athletes" element={<Athletes />} />
          <Route path="/athletes/:id" element={<AthleteDetail />} />
          <Route path="/athletes/:id/report/:reportId" element={<PlayerReport />} />
          <Route path="/sessions/new" element={coach ? <LogSession /> : <Navigate to="/" />} />
          <Route path="/sessions/:id" element={<LogSession />} />
          <Route path="/method" element={<Method />} />
          <Route path="/method/:id" element={<ModulePage />} />
          <Route path="/ask" element={<Ask />} />
          <Route path="/clinics" element={<Clinics />} />
          <Route path="/settings" element={<Settings />} />
          <Route path="*" element={<Navigate to="/" />} />
        </Routes>
      </main>
      {more && <div className="sheet-backdrop" onClick={() => setMore(false)}><div className="sheet" onClick={e => e.stopPropagation()}>
        {extra.map(k => <Tab key={k} k={k} />)}
      </div></div>}
      <nav className="tabbar">
        {primary.map(k => <Tab key={k} k={k} />)}
        <a className={more || isExtraActive ? 'active' : ''} onClick={() => setMore(!more)}><Icon d={icons.more} /><span>More</span></a>
        <div className="side-extra">{extra.map(k => <Tab key={k} k={k} />)}</div>
      </nav>
    </div>
  )
}
