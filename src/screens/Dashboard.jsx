import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { useAuth } from '../lib/auth.jsx'
import { supabase, today, ROLES, hours, fmtDate } from '../lib/supabase'
import { callFn, money } from '../lib/api'
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
  const [ghl, setGhl] = useState(null)
  const [ret, setRet] = useState(null)
  const [comp, setComp] = useState(null)

  useEffect(() => { callFn('square-summary').then(setSq); callFn('pushpress-summary').then(setPp); callFn('ghl-summary').then(setGhl); loadComp().then(async c => { setComp(c); setRet(await loadRetention(c, { allLocations: true })) }) }, [])
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
  const checklistsDone = d.runs.filter(r => r.done).length
  const injuries = d.reports.filter(r => r.kind === 'injury' || r.kind === 'incident')
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
            {sq.subscriptions?.total > 0 && <Stat label="Square subscriptions" value={sq.subscriptions.active} sub={`active · ${sq.subscriptions.paused || 0} paused`} />}
          </div>
          {sq.month.cats && (
            <div className="card">
              <div className="row between"><h3>This month · where the money came from</h3><span className="small muted">last 7 days in grey</span></div>
              <div className="grid">
                {Object.entries(sq.month.cats).filter(([, v]) => v.amount > 0 || v.count > 0).sort((a, b) => b[1].amount - a[1].amount).map(([n, v]) => (
                  <Stat key={n} label={n} value={money(v.amount)} tone={/rental|party/i.test(n) ? 'gold' : ''} sub={`${v.count} ${/concession/i.test(n) ? 'items' : /party/i.test(n) ? 'parties' : /rental/i.test(n) ? 'rentals' : 'sold'} · 7d ${money(sq.week.cats?.[n]?.amount || 0)}`} />
                ))}
              </div>
            </div>
          )}
          {sq.items?.length > 0 && <div className="card"><h3>Top items this month</h3><ul className="list">{sq.items.slice(0, 10).map(([n, v]) => <li key={n}><span className="grow">{n}</span><b>{money(v)}</b></li>)}</ul></div>}
        </>
      )}

      <h2>Members</h2>
      {!pp ? <p className="muted">Loading PushPress…</p> : !pp.connected ? (
        <div className="card"><p className="muted">PushPress isn't connected yet. Add <code>PUSHPRESS_API_KEY</code> in Netlify → Environment variables to see active members and plans here.</p></div>
      ) : pp.error ? <div className="card"><p className="flag">PushPress: {pp.error}</p></div> : (
        <>
          <div className="grid">
            <Stat label="Active members" value={pp.active ?? pp.total ?? '—'} tone="gold" sub={pp.active_enrollments ? `paying, not paused · ${pp.active_enrollments} plans` : 'from PushPress'} />
            {pp.leads != null && <Stat label="Leads" value={pp.leads} sub="in PushPress · call list" />}
            {pp.cancellations_month != null && <Stat label="Cancelled this month" value={pp.cancellations_month} tone={pp.cancellations_month ? 'pink' : ''} sub="plans that ended" />}
            {pp.pending_cancel != null && <Stat label="Leaving" value={pp.pending_cancel} tone={pp.pending_cancel ? 'pink' : ''} sub="cancelled, still active · save them" />}
            {pp.alerts != null && <Stat label="Payment alerts" value={pp.alerts} tone={pp.alerts ? 'pink' : ''} sub="card failed · fix today" />}
            {pp.paused != null && <Stat label="Paused" value={pp.paused} sub="members on hold · not counted as active" />}
            {pp.ex_members != null && <Stat label="Ex-members" value={pp.ex_members} sub="win-back list" />}
          </div>
          {pp.plans?.length > 0 && <div className="card"><h3>Active plans · by name</h3><ul className="list">{pp.plans.map(([n, c]) => <li key={n}><span className="grow">{n}</span><b>{c}</b></li>)}</ul></div>}
          {(pp.alert_list?.length > 0 || pp.leaving?.length > 0 || pp.cancelled?.length > 0) && (
            <div className="card">
              {pp.alert_list?.length > 0 && <><h3>Payment failed · call today</h3><ul className="list">{pp.alert_list.map((c, i) => <li key={'a' + i}><span className="grow">{c.name}{c.plan ? <span className="muted"> · {c.plan}</span> : null}</span><span className="pill bad">Payment failed</span></li>)}</ul></>}
              {pp.leaving?.length > 0 && <><h3 style={{ marginTop: pp.alert_list?.length ? 12 : 0 }}>Leaving · save them this week</h3><ul className="list">{pp.leaving.slice(0, 10).map((c, i) => <li key={'l' + i}><span className="grow">{c.name}{c.plan ? <span className="muted"> · {c.plan}</span> : null}</span><span className="pill bad">{c.at ? 'Ends ' + new Date(c.at).toLocaleDateString() : 'Ending'}</span></li>)}</ul></>}
              {pp.cancelled?.length > 0 && <><h3 style={{ marginTop: 12 }}>Cancelled this month</h3><ul className="list">{pp.cancelled.slice(0, 10).map((c, i) => <li key={'c' + i}><span className="grow">{c.name}{c.plan ? <span className="muted"> · {c.plan}</span> : null}</span><span className="small muted">{c.at ? new Date(c.at).toLocaleDateString() : ''}</span></li>)}</ul></>}
            </div>
          )}
        </>
      )}

      <h2>Leads · GoHighLevel</h2>
      {!ghl ? <p className="muted">Loading GoHighLevel…</p> : !ghl.connected ? (
        <div className="card"><p className="muted" style={{ margin: 0 }}>GoHighLevel isn't connected yet. Add <code>GHL_API_KEY</code> and <code>GHL_LOCATION_ID</code> in Netlify → Environment variables to see new leads, the pipeline and booked evaluations here.</p></div>
      ) : ghl.error ? <div className="card"><p className="flag" style={{ margin: 0 }}>GoHighLevel: {ghl.error}</p></div> : (
        <>
          <div className="grid">
            <Stat label="New leads today" value={ghl.leads.today} tone="gold" />
            <Stat label="New leads · 7 days" value={ghl.leads.week} />
            <Stat label="New leads · month" value={ghl.leads.month} />
            <Stat label="Open opportunities" value={ghl.pipeline.open} />
            <Stat label="Won this month" value={ghl.pipeline.wonMonth} sub={ghl.pipeline.wonValue ? money(ghl.pipeline.wonValue) : ''} tone="gold" />
            <Stat label="Evals today" value={ghl.appointments.today} sub={`${ghl.appointments.upcoming7} booked next 7 days`} />
            <Stat label="Showed · 7 days" value={ghl.appointments.showed7} sub={`${ghl.appointments.noshow7} no-shows`} />
          </div>
          <div className="grid" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))' }}>
            {ghl.pipeline.byStage?.length > 0 && <div className="card" style={{ margin: 0 }}><h3 style={{ marginTop: 0 }}>Pipeline by stage</h3><ul className="list">{ghl.pipeline.byStage.map(([n, c]) => <li key={n}><span className="grow small">{n}</span><b>{c}</b></li>)}</ul></div>}
            {ghl.leads.sources?.length > 0 && <div className="card" style={{ margin: 0 }}><h3 style={{ marginTop: 0 }}>Lead sources · month</h3><ul className="list">{ghl.leads.sources.map(([n, c]) => <li key={n}><span className="grow small">{n}</span><b>{c}</b></li>)}</ul></div>}
          </div>
          {ghl.appointments.todayList?.length > 0 && <div className="card" style={{ marginTop: 8 }}><h3 style={{ marginTop: 0 }}>Today's appointments</h3><ul className="list">{ghl.appointments.todayList.map((a, i) => <li key={i}><span className="pill">{new Date(a.at).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}</span><span className="grow small">{a.title}{a.calendar ? <span className="muted"> · {a.calendar}</span> : null}</span>{a.status && <span className={`pill ${a.status === 'showed' ? 'good' : /no/.test(a.status) ? 'bad' : ''}`}>{a.status}</span>}</li>)}</ul></div>}
        </>
      )}

      <h2>Retention · this month</h2>
      {ret && (
        <div className="card" style={ret.onTrack === false ? { borderColor: 'rgba(229,72,77,0.5)' } : {}}>
          <div className="grid">
            <Stat label="Churn" value={pct(ret.churn)} tone={ret.onTrack == null ? '' : ret.onTrack ? 'gold' : 'pink'} sub={`target under ${ret.target}%`} />
            <Stat label="Cancellations" value={ret.cancelCount} sub={ret.lostMrr ? `-${money(ret.lostMrr)}/mo lost` : ''} />
            <Stat label="Active members" value={ret.active || '—'} sub={ret.activeSource === 'PushPress' ? 'from PushPress' : 'set on Team → Hours & pay'} />
            <Stat label="Churn bonus" value={ret.onTrack == null ? '—' : ret.onTrack ? 'On track' : 'Missed'} tone={ret.onTrack ? 'gold' : ''} sub={(comp?.bonus_people || []).join(' · ')} />
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
        <Stat label="Checklists complete" value={`${checklistsDone} / ${d.templates.length}`} tone={checklistsDone < d.templates.length ? '' : 'gold'} />
        <Stat label="Injury reports · 7 days" value={injuries.length} tone={injuries.length ? 'pink' : ''} />
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
        <Stat label="Signed" value={money(d.salesLog.filter(x => x.kind === 'close').reduce((a, x) => a + (Number(x.amount) || 0), 0))} tone="gold" />
      </div>
      {d.salesLog.some(x => x.kind === 'close') && (
        <div className="card"><h3>Closes</h3><ul className="list">{d.salesLog.filter(x => x.kind === 'close').slice(0, 10).map(x => <li key={x.id}><span className="grow"><div>{x.name} <span className="muted small">· {x.program || ''}</span></div><div className="small muted">{x.profiles?.full_name} · {x.log_date}</div></span><b>{money(x.amount)}</b></li>)}</ul></div>
      )}

      <div className="card" style={injuries.length ? { borderColor: 'rgba(229,72,77,0.5)' } : {}}>
        <h2 style={{ marginTop: 0 }}>Injury reports · 7 days</h2>
        {injuries.length === 0 ? <p className="muted small" style={{ margin: 0 }}>None filed.</p> : (
          <ul className="list">{injuries.map(r => <li key={r.id} style={{ alignItems: 'flex-start' }}><span className={`pill ${/Serious/.test(r.data?.severity || '') ? 'bad' : /Moderate/.test(r.data?.severity || '') ? 'gold' : ''}`}>{(r.data?.severity || 'Injury').split(' ')[0]}</span><span className="grow"><div style={{ fontWeight: 500 }}>{r.data?.athlete} <span className="muted small">· {r.data?.injury}</span></div><div className="small muted">{r.data?.what}</div><div className="small muted">{r.profiles?.full_name} · {r.data?.when ? new Date(r.data.when).toLocaleString() : r.report_date}{r.data?.followup && <span className="flag"> · follow-up: {r.data.followup}</span>}</div></span></li>)}</ul>
        )}
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
