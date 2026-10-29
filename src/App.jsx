import { useState } from 'react'
import { Routes, Route, Navigate, NavLink, useLocation } from 'react-router-dom'
import { useAuth } from './lib/auth.jsx'
import { configured, isManager, isDirector } from './lib/supabase'
import Login from './screens/Login.jsx'
import Playbook from './screens/Playbook.jsx'
import Note from './screens/Note.jsx'
import Reports from './screens/Reports.jsx'
import Dashboard from './screens/Dashboard.jsx'
import Settings from './screens/Settings.jsx'
import Method from './screens/Method.jsx'
import ModulePage from './screens/ModulePage.jsx'
import Ask from './screens/Ask.jsx'
import Clinics from './screens/Clinics.jsx'
import SopStudio from './screens/SopStudio.jsx'
import SopPage from './screens/SopPage.jsx'
import Appointments from './screens/Appointments.jsx'

const Icon = ({ d }) => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d={d} /></svg>
export const icons = {
  playbook: 'M4 4h12a2 2 0 012 2v14H6a2 2 0 01-2-2V4zm0 0v14M8 8h6M8 12h6',
  reports: 'M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8zM14 2v6h6M8 13h8M8 17h5',
  dashboard: 'M3 3v18h18M7 14l4-4 4 4 5-6',
  method: 'M2 3h6a4 4 0 014 4v14a3 3 0 00-3-3H2zM22 3h-6a4 4 0 00-4 4v14a3 3 0 013-3h7z',
  ask: 'M21 11.5a8.4 8.4 0 01-.9 3.8 8.5 8.5 0 01-7.6 4.7 8.4 8.4 0 01-3.8-.9L3 21l1.9-5.7a8.4 8.4 0 01-.9-3.8 8.5 8.5 0 014.7-7.6 8.4 8.4 0 013.8-.9h.5a8.5 8.5 0 018 8v.5z',
  more: 'M5 12h.01M12 12h.01M19 12h.01',
  clinics: 'M8 2v4M16 2v4M3 10h18M5 4h14a2 2 0 012 2v14a2 2 0 01-2 2H5a2 2 0 01-2-2V6a2 2 0 012-2zM9 15l2 2 4-4',
  settings: 'M12 15a3 3 0 100-6 3 3 0 000 6zM19.4 15a1.7 1.7 0 00.3 1.8l.1.1a2 2 0 11-2.8 2.8l-.1-.1a1.7 1.7 0 00-1.8-.3 1.7 1.7 0 00-1 1.5V21a2 2 0 11-4 0v-.1a1.7 1.7 0 00-1.1-1.5 1.7 1.7 0 00-1.8.3l-.1.1a2 2 0 11-2.8-2.8l.1-.1a1.7 1.7 0 00.3-1.8 1.7 1.7 0 00-1.5-1H3a2 2 0 110-4h.1a1.7 1.7 0 001.5-1.1 1.7 1.7 0 00-.3-1.8l-.1-.1a2 2 0 112.8-2.8l.1.1a1.7 1.7 0 001.8.3H9a1.7 1.7 0 001-1.5V3a2 2 0 114 0v.1a1.7 1.7 0 001 1.5 1.7 1.7 0 001.8-.3l.1-.1a2 2 0 112.8 2.8l-.1.1a1.7 1.7 0 00-.3 1.8V9a1.7 1.7 0 001.5 1H21a2 2 0 110 4h-.1a1.7 1.7 0 00-1.5 1z',
}

// Two experiences: the Owner/Operator run the business from the CEO view; everyone else gets the SOPs and the assistant.
export default function App() {
  const { session, profile, roles, realRole, viewAs, setViewAs, previewing, signOut } = useAuth()
  const [more, setMore] = useState(false)
  const loc = useLocation()

  if (!configured) return <div className="auth"><div className="card"><h1>Next Level <span>OS</span></h1><p>Missing Supabase settings. Add <code>VITE_SUPABASE_URL</code> and <code>VITE_SUPABASE_ANON_KEY</code> to the environment variables.</p></div></div>
  if (session === undefined) return <div className="auth"><p className="muted">Loading…</p></div>
  if (!session) return <Login />
  if (!profile) return <div className="auth"><p className="muted">Setting up your profile…</p></div>

  const manager = isManager(roles)
  const all = {
    ceo: ['/dashboard', 'CEO', icons.dashboard],
    appointments: ['/appointments', 'Appointments', icons.clinics],
    clinics: ['/clinics', 'Clinics', icons.clinics],
    sops: ['/sops', 'SOP Studio', icons.playbook],
    playbook: ['/playbook', manager ? 'Playbook' : 'SOPs', icons.playbook],
    ask: ['/ask', 'Ask', icons.ask],
    settings: ['/settings', 'You', icons.settings],
  }
  const ordered = manager ? ['ceo', 'appointments', 'clinics', 'sops', 'playbook', 'ask', 'settings'] : isDirector(roles) ? ['playbook', 'sops', 'ask', 'settings'] : ['playbook', 'ask', 'settings']
  const primary = ordered.slice(0, 4), extra = ordered.slice(4)
  const isExtraActive = extra.some(k => loc.pathname.startsWith(all[k][0]))
  const home = manager ? '/dashboard' : '/playbook'

  const Tab = ({ k }) => { const [to, label, d] = all[k]; return <NavLink to={to} onClick={() => setMore(false)} className={({ isActive }) => isActive ? 'active' : ''}><Icon d={d} /><span>{label}</span></NavLink> }

  return (
    <div className="app">
      <header className="topbar">
        <div className="brand">NEXT <b>LEVEL</b> <i>OS</i></div>
        <div className="row">
          <NavLink to="/settings" className="pill gold">{profile.full_name || profile.email}</NavLink>
          <button className="btn ghost small" onClick={signOut}>Out</button>
        </div>
      </header>
      {realRole === 'owner' && (
        <div className={`viewas ${previewing ? 'on' : ''}`}>
          <span className="small">{previewing ? 'Previewing as' : 'View as'}</span>
          <select className="input" value={viewAs} onChange={e => setViewAs(e.target.value)}>
            <option value="">Me (Owner)</option>
            <option value="sales">Sales</option>
            <option value="coach">Coach</option>
            <option value="coach+sales">Coach + Sales</option>
            <option value="frontdesk">Concession</option>
            <option value="director">Director (Simon)</option>
            <option value="newhire">New hire</option>
          </select>
          {previewing && <button className="btn small" onClick={() => setViewAs('')}>Exit preview</button>}
        </div>
      )}
      <main className="main">
        <Routes>
          <Route path="/" element={<Navigate to={home} replace />} />
          <Route path="/playbook" element={<Playbook />} />
          <Route path="/playbook/:slug" element={<Note />} />
          <Route path="/sop/:key" element={<SopPage />} />
          <Route path="/sops" element={isDirector(roles) ? <SopStudio /> : <Navigate to="/playbook" />} />
          <Route path="/method" element={<Method />} />
          <Route path="/method/:id" element={<ModulePage />} />
          <Route path="/ask" element={<Ask />} />
          <Route path="/reports" element={<Reports />} />
          <Route path="/settings" element={<Settings />} />
          <Route path="/dashboard" element={manager ? <Dashboard /> : <Navigate to="/playbook" />} />
          <Route path="/appointments" element={manager ? <Appointments /> : <Navigate to="/playbook" />} />
          <Route path="/clinics" element={manager ? <Clinics /> : <Navigate to="/playbook" />} />
          <Route path="*" element={<Navigate to={home} replace />} />
        </Routes>
      </main>
      {more && <div className="sheet-backdrop" onClick={() => setMore(false)}><div className="sheet" onClick={e => e.stopPropagation()}>
        {extra.map(k => <Tab key={k} k={k} />)}
      </div></div>}
      <nav className="tabbar">
        {primary.map(k => <Tab key={k} k={k} />)}
        {extra.length > 0 && <a className={`more ${more || isExtraActive ? 'active' : ''}`} onClick={() => setMore(!more)}><Icon d={icons.more} /><span>More</span></a>}
        <div className="side-extra">{extra.map(k => <Tab key={k} k={k} />)}</div>
      </nav>
    </div>
  )
}
