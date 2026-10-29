import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { useAuth } from '../lib/auth.jsx'
import { supabase, today, ROLES, hours, fmtDate } from '../lib/supabase'
import { callFn, money } from '../lib/api'
import { REPORT_TYPES } from './Reports.jsx'
import ClinicBoard from '../components/ClinicBoard.jsx'
import { loadComp, loadRetention, pct } from '../lib/comp'

const daysAgo = n => new Date(Date.now() - n * 864e5).toISOString().slice(0, 10)
const weekStart = () => { const d = new Date(); d.setHours(0, 0, 0, 0); d.setDate(d.getDate() - ((d.getDay() + 6) % 7)); return d.toISOString() }

export default function Dashboard() {
  const { role, locationId, locations } = useAuth()
  const [loc, setLoc] = useState(role === 'owner' ? 'all' : locationId)
  const [d, setD] = useState(null)
  const [sq, setSq] = useState(null)
  const [pp, setPp] = useState(null)
  const [ret, setRet] = useState(null)
  const [comp, setComp] = useState(null)

  useEffect(() => { callFn('square-summary').then(setSq); callFn('pushpress-summary').then(setPp); loadComp().then(async c => { setComp(c); setRet(await loadRetention(c, { allLocations: true })) }) }, [])
  useEffect(() => {
    (async () => {
      const scope = q => loc === 'all' ? q : q.eq('location_id', loc)
      const [{ data: reports }, { data: runs }, { data: templates }, { data: hires }, { data: people }, { data: goals }, { data: kpis }, { data: time }, { data: sessions }, { data: questions }, { data: salesLog }] = await Promise.all([
        scope(supabase.from('reports').select('*, profiles(full_name)')).gte('report_date', daysAgo(7)).order('created_at', { ascending: false }),
        scope(supabase.from('checklist_runs').select('*')).eq('run_date', today()),
        supabase.from('checklist_templates').select('id, name, slot, role').eq('active', true),
        scope(supabase.from('hires').select('*, onboarding_tasks(done)')).neq('status', 'complete'),
        scope(supabase.from('profiles').select('id, full_name, role, roles, location_id')),
        supabase.from('kpi_goals').select('*').eq('active', true).order('sort'),
        scope(supabase.from('kpi_days').select('*')).eq('kpi_date', today()),
        scope(supabase.from('time_entries').select('*, profiles(full_name)')).gte('clock_in', weekStart()),
        scope(supabase.from('sessions').select('id, coach_id, session_date, session_athletes(count)')).gte('session_date', daysAgo(7)),
        supabase.from('ai_questions').select('question, created_at, profiles(full_name)').order('created_at', { ascending: false }).limit(8),
        scope(supabase.from('sales_log').select('*, profiles(full_name)')).gte('log_date', daysAgo(7)).order('created_at', { ascending: false }),
      ])
      setD({ reports: reports || [], runs: runs || [], templates: templates || [], hires: hires || [], people: people || [], goals: goals || [], kpis: kpis || [], time: time || [], sessions: sessions || [], questions: questions || [], salesLog: salesLog || [] })
    })()
  }, [loc])

  if (!d) return <p className="muted">Loading…</p>
  const sum = (kind, key, days = 0) => d.reports.filter(r => r.kind === kind && (!days || r.report_date >= daysAgo(days))).reduce((a, r) => a + (Number(r.data?.[key]) || 0), 0)
  const checklistsDone = d.runs.filter(r => r.done).length
  const incidents = d.reports.filter(r => r.kind === 'incident')
  const onClock = d.time.filter(t => !t.clock_out)
  const kpiOf = uid => d.kpis.find(k => k.user_id === uid)?.data || {}
  const goalRows = d.people.map(p => {
    const rs = [p.role, ...(p.roles || [])].filter(r => ['sales', 'frontdesk', 'coach', 'director'].includes(r))
    const seen = {}; for (const g of d.goals.filter(g => rs.includes(g.role))) { if (!seen[g.metric] || Number(g.goal) > Number(seen[g.metric].goal)) seen[g.metric] = g }
    const gs = Object.values(seen); const data = kpiOf(p.id)
    return { p, rs, gs, data, hit: gs.filter(g => (Number(data[g.metric]) || 0) >= Number(g.goal)).length }
  }).filter(r => r.gs.length)
  const sessions7 = d.sessions.length, athletes7 = d.sessions.reduce((a, s) => a + (s.session_athletes?.[0]?.count || 0), 0)

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
      <p className="muted small">Open this once a day. Everything below updates on its own.</p>

      <h2>Sales · Square</h2>
      {!sq ? <p className="muted">Loading Square…</p> : !sq.connected ? (
        <div className="card"><p className="muted">Square isn't connected yet. Add <code>SQUARE_ACCESS_TOKEN</code> in Netlify → Environment variables and this fills in live: sales today, this week, this month, membership sales, and clinic sign-ups.</p></div>
      ) : sq.error ? <div className="card"><p className="flag">Square: {sq.error}</p></div> : (
        <>
          <div className="grid">
            <Stat label="Today" value={money(sq.today.sales)} tone="pink" sub={`${sq.today.count} payments`} />
            <Stat label="Last 7 days" value={money(sq.week.sales)} sub={`${sq.week.count} payments`} />
            <Stat label="Month to date" value={money(sq.month.sales)} tone="gold" sub={`${sq.month.count} payments`} />
            <Stat label="Memberships · MTD" value={money(sq.month.memberships)} sub="items with member/program in the name" />
            <Stat label="Active subscriptions" value={sq.subscriptions?.active ?? '—'} sub="Square subscriptions" />
          </div>
          {sq.items?.length > 0 && <div className="card"><h3>What sold this month</h3><ul className="list">{sq.items.map(([n, v]) => <li key={n}><span className="grow">{n}</span><b>{money(v)}</b></li>)}</ul></div>}
        </>
      )}

      <h2>Members</h2>
      {!pp ? <p className="muted">Loading PushPress…</p> : !pp.connected ? (
        <div className="card"><p className="muted">PushPress isn't connected yet. Add <code>PUSHPRESS_API_KEY</code> in Netlify → Environment variables to see active members and plans here.</p></div>
      ) : pp.error ? <div className="card"><p className="flag">PushPress: {pp.error}</p></div> : (
        <>
          <div className="grid">
            <Stat label="Active members" value={pp.active ?? pp.total ?? '—'} tone="gold" sub={pp.active == null ? `${pp.total} people in PushPress` : 'from PushPress'} />
            {pp.leads != null && <Stat label="Leads" value={pp.leads} />}
            {pp.cancellations_month != null && <Stat label="Cancelled this month" value={pp.cancellations_month} tone={pp.cancellations_month ? 'pink' : ''} />}
            {pp.plans?.slice(0, 4).map(([n, c]) => <Stat key={n} label={n} value={c} />)}
          </div>
          {pp.cancelled?.length > 0 && <div className="card"><h3>Cancelled in PushPress this month</h3><ul className="list">{pp.cancelled.slice(0, 10).map((c, i) => <li key={i}><span className="grow">{c.name}{c.plan ? <span className="muted"> · {c.plan}</span> : null}</span><span className="small muted">{c.at ? new Date(c.at).toLocaleDateString() : ''}</span></li>)}</ul></div>}
        </>
      )}

      <h2>Retention · this month</h2>
      {ret && (
        <div className={`card ${ret.onTrack === false ? '' : ''}`} style={ret.onTrack === false ? { borderColor: 'var(--pink)' } : {}}>
          <div className="grid">
            <Stat label="Churn" value={pct(ret.churn)} tone={ret.onTrack == null ? '' : ret.onTrack ? 'gold' : 'pink'} sub={`target under ${ret.target}%`} />
            <Stat label="Cancellations" value={ret.cancelCount} sub={ret.lostMrr ? `-${money(ret.lostMrr)}/mo lost` : ''} />
            <Stat label="Active members" value={ret.active || '—'} sub={ret.activeSource === 'PushPress' ? 'from PushPress' : 'set on Team → Hours & pay'} />
            <Stat label="Churn bonus" value={ret.onTrack == null ? '—' : ret.onTrack ? 'ON TRACK' : 'MISSED'} tone={ret.onTrack ? 'gold' : 'pink'} sub={(comp?.bonus_people || []).join(' · ')} />
          </div>
          {ret.cancels.length > 0 && <ul className="list" style={{ marginTop: 8 }}>{ret.cancels.slice(0, 8).map(c => <li key={c.id}><span className="grow small"><div>{c.name} <span className="muted">· {c.program || ''}</span></div><div className="muted">{c.note} · {c.log_date}</div></span>{c.amount ? <span className="pill pink">-{money(c.amount)}/mo</span> : null}</li>)}</ul>}
        </div>
      )}

      <ClinicBoard />

      <h2>Goals today · by person</h2>
      <div className="card">
        {goalRows.length === 0 ? <p className="muted">No one with daily goals yet. Set roles on the Team page.</p> : (
          <ul className="list">
            {goalRows.map(({ p, rs, gs, data, hit }) => (
              <li key={p.id} style={{ alignItems: 'flex-start' }}>
                <span className={`pill ${hit === gs.length && gs.length ? 'good' : hit > 0 ? 'gold' : ''}`}>{hit}/{gs.length}</span>
                <span className="grow"><div style={{ fontWeight: 600 }}>{p.full_name} <span className="muted small">· {rs.map(r => ROLES[r]).join(' + ')}</span></div>
                  <div className="row wrap small" style={{ gap: 8, marginTop: 2 }}>{gs.map(g => { const v = Number(data[g.metric]) || 0, ok = v >= Number(g.goal); return <span key={g.id} style={{ color: ok ? 'var(--good)' : 'var(--muted)' }}>{ok ? '✓' : '○'} {g.label}: {g.kind === 'check' ? (ok ? 'done' : 'not yet') : `${v}/${g.goal}`}</span> })}</div>
                </span>
              </li>
            ))}
          </ul>
        )}
        <Link to="/team" className="small">Edit goals on the Team page →</Link>
      </div>

      <h2>Today on the floor</h2>
      <div className="grid">
        <Stat label="On the clock now" value={onClock.length} tone="gold" sub={onClock.map(t => t.profiles?.full_name?.split(' ')[0]).filter(Boolean).join(', ') || 'nobody'} />
        <Stat label="Checklists complete" value={`${checklistsDone} / ${d.templates.length}`} tone={checklistsDone < d.templates.length ? 'pink' : 'gold'} />
        <Stat label="Reports filed" value={d.reports.filter(r => r.report_date === today()).length} />
        <Stat label="Sessions · 7 days" value={sessions7} sub={`${athletes7} athlete-sessions`} />
        <Stat label="Hours · this week" value={hours(d.time.reduce((a, t) => a + ((t.clock_out ? new Date(t.clock_out) : new Date()) - new Date(t.clock_in)), 0))} />
        <Stat label="In onboarding" value={d.hires.length} />
      </div>

      <h2>Sales team · 7 days</h2>
      <div className="grid">
        <Stat label="Calls" value={d.salesLog.filter(x => x.kind === 'call').reduce((a, x) => a + (Number(x.amount) || 1), 0)} />
        <Stat label="Meetings booked" value={d.salesLog.filter(x => x.kind === 'meeting').length} />
        <Stat label="Evals showed" value={d.salesLog.filter(x => x.kind === 'eval').length} />
        <Stat label="Closes" value={d.salesLog.filter(x => x.kind === 'close').length} tone="gold" />
        <Stat label="Signed" value={money(d.salesLog.filter(x => x.kind === 'close').reduce((a, x) => a + (Number(x.amount) || 0), 0))} tone="pink" />
      </div>
      {d.salesLog.some(x => x.kind === 'close') && (
        <div className="card"><h3>Closes</h3><ul className="list">{d.salesLog.filter(x => x.kind === 'close').slice(0, 10).map(x => <li key={x.id}><span className="grow"><div>{x.name} <span className="muted small">· {x.program || ''}</span></div><div className="small muted">{x.profiles?.full_name} · {x.log_date}</div></span><b>{money(x.amount)}</b></li>)}</ul></div>
      )}

      <h2>End-of-day sales reports · 7 days</h2>
      <div className="grid">
        <Stat label="Calls" value={sum('sales', 'calls', 7)} />
        <Stat label="Meetings booked" value={sum('sales', 'meetings_booked', 7)} />
        <Stat label="Evals showed" value={sum('sales', 'evals_showed', 7)} />
        <Stat label="Closes" value={sum('sales', 'closed', 7)} tone="gold" />
        <Stat label="New revenue signed" value={money(sum('sales', 'revenue', 7))} tone="pink" />
      </div>

      {incidents.length > 0 && (
        <div className="card" style={{ borderColor: 'var(--pink)' }}>
          <h2 style={{ color: 'var(--pink)', marginTop: 0 }}>Incidents · 7 days</h2>
          <ul className="list">{incidents.map(r => <li key={r.id}><span className="grow"><div>{r.data.what}</div><div className="small muted">{r.profiles?.full_name} · {r.report_date}{r.data.followup && <span className="flag"> · follow-up: {r.data.followup}</span>}</div></span></li>)}</ul>
        </div>
      )}

      <div className="card">
        <h2 style={{ marginTop: 0 }}>Latest staff reports</h2>
        <ul className="list">
          {d.reports.slice(0, 10).map(r => (
            <li key={r.id}><span className="grow">
              <div><span className="pill gold">{REPORT_TYPES[r.kind]?.label || r.kind}</span> <span className="small muted">{r.profiles?.full_name} · {new Date(r.created_at).toLocaleString()}</span></div>
              <div className="small" style={{ marginTop: 4 }}>{Object.entries(r.data).filter(([, v]) => v !== '' && v != null).map(([k, v]) => <span key={k} style={{ marginRight: 10 }}><span className="muted">{k.replace(/_/g, ' ')}:</span> {String(v)}</span>)}</div>
            </span></li>
          ))}
          {d.reports.length === 0 && <li className="muted">No reports in the last 7 days.</li>}
        </ul>
      </div>

      {d.questions.length > 0 && (
        <div className="card">
          <h2 style={{ marginTop: 0 }}>What the team asked the assistant</h2>
          <p className="small muted">Repeated questions = an SOP that's missing or unclear.</p>
          <ul className="list">{d.questions.map((q, i) => <li key={i}><span className="grow"><div>{q.question}</div><div className="small muted">{q.profiles?.full_name} · {new Date(q.created_at).toLocaleDateString()}</div></span></li>)}</ul>
        </div>
      )}
    </>
  )
}

function Stat({ label, value, tone, sub }) {
  return <div className="stat"><div className="label">{label}</div><div className={`value ${tone || ''}`}>{value}</div>{sub && <div className="small muted">{sub}</div>}</div>
}
