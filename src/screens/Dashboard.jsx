import { useEffect, useState } from 'react'
import { useAuth } from '../lib/auth.jsx'
import { supabase } from '../lib/supabase'
import { REPORT_TYPES } from './Reports.jsx'

const today = () => new Date().toISOString().slice(0, 10)
const daysAgo = n => new Date(Date.now() - n * 864e5).toISOString().slice(0, 10)

export default function Dashboard() {
  const { role, locationId, locations } = useAuth()
  const [loc, setLoc] = useState(role === 'owner' ? 'all' : locationId)
  const [d, setD] = useState(null)

  useEffect(() => {
    (async () => {
      const scope = q => loc === 'all' ? q : q.eq('location_id', loc)
      const { data: reports } = await scope(supabase.from('reports').select('*, profiles(full_name)')).gte('report_date', daysAgo(7)).order('created_at', { ascending: false })
      const { data: runs } = await scope(supabase.from('checklist_runs').select('*')).eq('run_date', today())
      const { data: templates } = await supabase.from('checklist_templates').select('id, name, slot').eq('active', true)
      const { data: hires } = await scope(supabase.from('hires').select('*, onboarding_tasks(done)')).neq('status', 'complete')
      const { data: people } = await scope(supabase.from('profiles').select('id, full_name, role'))
      setD({ reports: reports || [], runs: runs || [], templates: templates || [], hires: hires || [], people: people || [] })
    })()
  }, [loc])

  if (!d) return <p className="muted">Loading…</p>
  const todayReports = d.reports.filter(r => r.report_date === today())
  const sum = (kind, key, days = 0) => d.reports.filter(r => r.kind === kind && (!days || r.report_date >= daysAgo(days))).reduce((a, r) => a + (Number(r.data?.[key]) || 0), 0)
  const checklistsDone = d.runs.filter(r => r.done).length
  const incidents = d.reports.filter(r => r.kind === 'incident')
  const closed7 = sum('sales', 'closed', 7), leads7 = sum('sales', 'leads', 7), rev7 = sum('sales', 'revenue', 7)
  const evalsB = sum('sales', 'evals_booked', 7), evalsS = sum('sales', 'evals_showed', 7)

  return (
    <>
      <div className="row between wrap">
        <h1>CEO Dashboard</h1>
        {role === 'owner' && (
          <select className="input" style={{ width: 'auto', minHeight: 36, padding: '6px 10px' }} value={loc} onChange={e => setLoc(e.target.value)}>
            <option value="all">All locations</option>{locations.map(l => <option key={l.id} value={l.id}>{l.name}</option>)}
          </select>
        )}
      </div>
      <p className="muted">Last 7 days from staff reports and checklists. Square, PushPress, GoHighLevel, Sheets and Calendar feeds arrive in Phase 2.</p>

      <h2>Sales · 7 days</h2>
      <div className="grid">
        <Stat label="New revenue signed" value={'$' + rev7.toLocaleString()} tone="pink" />
        <Stat label="Members closed" value={closed7} tone="gold" />
        <Stat label="Leads" value={leads7} />
        <Stat label="Evals booked → showed" value={`${evalsB} → ${evalsS}`} />
        <Stat label="Close rate" value={evalsS ? Math.round(closed7 / evalsS * 100) + '%' : '—'} tone="gold" />
      </div>

      <h2>Today</h2>
      <div className="grid">
        <Stat label="Checklists complete" value={`${checklistsDone} / ${d.templates.length}`} tone={checklistsDone < d.templates.length ? 'pink' : 'gold'} />
        <Stat label="Reports filed" value={todayReports.length} />
        <Stat label="Sessions coached" value={sum('session', 'sessions').toString()} />
        <Stat label="Walk-ins" value={sum('shift', 'walkins').toString()} />
        <Stat label="Concession ($)" value={'$' + sum('shift', 'concession_sales').toLocaleString()} />
        <Stat label="In onboarding" value={d.hires.length} />
      </div>

      {incidents.length > 0 && (
        <div className="card" style={{ borderColor: 'var(--pink)' }}>
          <h2 style={{ color: 'var(--pink)' }}>Incidents · 7 days</h2>
          <ul className="list">{incidents.map(r => <li key={r.id}><span className="grow"><div>{r.data.what}</div><div className="small muted">{r.profiles?.full_name} · {r.report_date}{r.data.followup && <span className="flag"> · follow-up: {r.data.followup}</span>}</div></span></li>)}</ul>
        </div>
      )}

      <div className="card">
        <h2>Onboarding</h2>
        {d.hires.length === 0 ? <p className="muted">Nobody in onboarding.</p> : (
          <ul className="list">{d.hires.map(h => { const t = h.onboarding_tasks.length, n = h.onboarding_tasks.filter(x => x.done).length; return <li key={h.id}><span className="grow"><div>{h.full_name} <span className="small muted">· {h.role} · {h.status}</span></div><div className="progress" style={{ marginTop: 4 }}><div style={{ width: (t ? n / t * 100 : 0) + '%' }} /></div></span><span className="pill gold">{t ? Math.round(n / t * 100) : 0}%</span></li> })}</ul>
        )}
      </div>

      <div className="card">
        <h2>Latest reports</h2>
        <ul className="list">
          {d.reports.slice(0, 12).map(r => (
            <li key={r.id}><span className="grow">
              <div><span className="pill gold">{REPORT_TYPES[r.kind]?.label || r.kind}</span> <span className="small muted">{r.profiles?.full_name} · {new Date(r.created_at).toLocaleString()}</span></div>
              <div className="small" style={{ marginTop: 4 }}>{Object.entries(r.data).filter(([, v]) => v !== '' && v != null).map(([k, v]) => <span key={k} style={{ marginRight: 10 }}><span className="muted">{k.replace(/_/g, ' ')}:</span> {String(v)}</span>)}</div>
            </span></li>
          ))}
          {d.reports.length === 0 && <li className="muted">No reports in the last 7 days.</li>}
        </ul>
      </div>
    </>
  )
}

function Stat({ label, value, tone }) {
  return <div className="stat"><div className="label">{label}</div><div className={`value ${tone || ''}`}>{value}</div></div>
}
