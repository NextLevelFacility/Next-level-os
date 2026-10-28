import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { useAuth } from '../lib/auth.jsx'
import { supabase, ROLES, isManager, isCoach, today } from '../lib/supabase'
import { sops } from '../lib/vault'
import Clock from '../components/Clock.jsx'
import Goals from '../components/Goals.jsx'
import ClinicBoard from '../components/ClinicBoard.jsx'

export default function Today() {
  const { profile, role, locationId, user } = useAuth()
  const [templates, setTemplates] = useState([])
  const [runs, setRuns] = useState([])
  const [reads, setReads] = useState(new Set())
  const [hire, setHire] = useState(null)
  const [tasks, setTasks] = useState([])
  const [reportsToday, setReportsToday] = useState(0)
  const [sessionsToday, setSessionsToday] = useState([])
  const [modules, setModules] = useState({ total: 0, done: 0 })

  useEffect(() => {
    (async () => {
      const { data: t } = await supabase.from('checklist_templates').select('*').eq('active', true)
      setTemplates((t || []).filter(x => !x.role || x.role === role || isManager(role)))
      const { data: r } = await supabase.from('checklist_runs').select('*').eq('run_date', today()).eq('location_id', locationId)
      setRuns(r || [])
      const { data: rd } = await supabase.from('sop_reads').select('sop_path').eq('user_id', user.id)
      setReads(new Set((rd || []).map(x => x.sop_path)))
      const { data: h } = await supabase.from('hires').select('*').eq('user_id', user.id).neq('status', 'complete').maybeSingle()
      setHire(h)
      if (h) { const { data: tk } = await supabase.from('onboarding_tasks').select('*').eq('hire_id', h.id).order('sort'); setTasks(tk || []) }
      const { count } = await supabase.from('reports').select('*', { count: 'exact', head: true }).eq('user_id', user.id).eq('report_date', today())
      setReportsToday(count || 0)
      if (isCoach(role)) {
        const { data: s } = await supabase.from('sessions').select('id, start_time, session_type, session_athletes(count)').eq('session_date', today()).eq('coach_id', user.id).order('start_time')
        setSessionsToday(s || [])
        const { data: m } = await supabase.from('modules').select('id').eq('published', true)
        const { data: p } = await supabase.from('module_progress').select('module_id').eq('user_id', user.id)
        setModules({ total: (m || []).length, done: (p || []).filter(x => (m || []).some(mm => mm.id === x.module_id)).length })
      }
    })()
  }, [role, locationId, user.id])

  const mySops = sops().filter(n => roleMatches(n, role))
  const unread = mySops.filter(n => !reads.has(n.path))
  const openChecklists = templates.filter(t => !runs.find(r => r.template_id === t.id && r.done))
  const hour = new Date().getHours()
  const greet = hour < 12 ? 'Good morning' : hour < 17 ? 'Good afternoon' : 'Good evening'

  return (
    <>
      <h1>{greet}, {(profile.full_name || '').split(' ')[0]}</h1>
      <p className="muted">{ROLES[role]} · {new Date().toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric' })}</p>

      <Goals />
      <Clock />
      <ClinicBoard compact />

      {hire && (
        <div className="card accent">
          <h2>Your onboarding · {hire.status.replace('week', 'Week ').replace('pre-start', 'Before Day 1').replace('day', 'Day ')}</h2>
          <Progress tasks={tasks} />
          <ul className="list">
            {tasks.filter(t => !t.done && t.owner === 'hire').slice(0, 4).map(t => <li key={t.id}><span className="pill gold">{t.c}</span><span className="grow">{t.text}</span></li>)}
          </ul>
          <Link className="btn gold small" to={`/onboarding/${hire.id}`}>Open my 30-day plan</Link>
        </div>
      )}

      {isCoach(role) && (
        <div className="card">
          <div className="row between"><h2>Sessions</h2><Link to="/athletes" className="small">Athletes</Link></div>
          {sessionsToday.length === 0 ? <p className="muted">No sessions logged yet today.</p> : (
            <ul className="list">
              {sessionsToday.map(s => <li key={s.id}><span className="pill pink">{s.start_time ? s.start_time.slice(0, 5) : '—'}</span><span className="grow">{s.session_type || 'Session'} <span className="muted small">· {s.session_athletes?.[0]?.count ?? 0} players</span></span><Link className="btn ghost small" to={`/sessions/${s.id}`}>Open</Link></li>)}
            </ul>
          )}
          <Link className="btn block" to="/sessions/new" style={{ marginTop: 10 }}>+ Log a session</Link>
          {modules.total > 0 && <p className="small muted" style={{ marginTop: 10 }}>Method: {modules.done} of {modules.total} modules complete · <Link to="/method">continue</Link></p>}
        </div>
      )}

      <div className="card">
        <div className="row between"><h2>Checklists</h2><Link to="/checklists" className="small">All</Link></div>
        {openChecklists.length === 0 ? <p className="muted">Everything for today is done. ✓</p> : (
          <ul className="list">
            {openChecklists.map(t => <li key={t.id}><span className="pill pink">{t.slot}</span><span className="grow title">{t.name}</span><Link className="btn small" to="/checklists">Open</Link></li>)}
          </ul>
        )}
      </div>

      <div className="card">
        <div className="row between"><h2>Reports</h2><Link to="/reports" className="small">File one</Link></div>
        <p className="muted">{reportsToday === 0 ? 'No report filed today yet.' : `${reportsToday} report${reportsToday > 1 ? 's' : ''} filed today.`}</p>
      </div>

      <div className="card">
        <div className="row between"><h2>Playbook</h2><Link to="/playbook" className="small">All SOPs</Link></div>
        {unread.length === 0 ? <p className="muted">You've read every SOP for your role.</p> : (
          <>
            <p className="muted small">{unread.length} to read</p>
            <ul className="list">
              {unread.slice(0, 4).map(n => <li key={n.path}><span className="grow title">{n.title}</span><Link className="btn ghost small" to={`/playbook/${n.slug}`}>Read</Link></li>)}
            </ul>
          </>
        )}
      </div>

      <div className="card accent">
        <h2>Stuck on something?</h2>
        <p className="muted small">Ask the Next Level assistant. It knows every SOP, standard and belief in the Playbook.</p>
        <Link className="btn gold small" to="/ask">Ask a question</Link>
      </div>
    </>
  )
}

export function roleMatches(note, role) {
  const t = note.tags
  if (isManager(role)) return true
  if (isCoach(role)) return t.includes('coaching') || t.includes('people') || t.includes('onboarding') || /coach|standard|belief|culture|method/i.test(note.title)
  if (role === 'sales') return t.includes('sales') || /sales|member|belief|culture|standard/i.test(note.title)
  if (role === 'frontdesk') return /facility|front desk|member experience|belief|culture|standard/i.test(note.title)
  return /belief|standard|culture|onboarding/i.test(note.title)
}

export function Progress({ tasks }) {
  const done = tasks.filter(t => t.done).length
  const pct = tasks.length ? Math.round(done / tasks.length * 100) : 0
  return <div style={{ margin: '8px 0 12px' }}><div className="progress"><div style={{ width: pct + '%' }} /></div><div className="small muted">{done} of {tasks.length} done · {pct}%</div></div>
}
