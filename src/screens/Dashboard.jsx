import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { useAuth } from '../lib/auth.jsx'
import { supabase } from '../lib/supabase'
import { callFn, money } from '../lib/api'
import SheetsKpis from '../components/SheetsKpis.jsx'
import PayCard from '../components/PayCard.jsx'
import ClinicsCard from '../components/ClinicsCard.jsx'
import { loadComp, loadRetention, pct } from '../lib/comp'

const daysAgo = n => new Date(Date.now() - n * 864e5).toISOString().slice(0, 10)

export default function Dashboard() {
  const { role, locationId, locations } = useAuth()
  const [loc, setLoc] = useState(role === 'owner' ? 'all' : locationId)
  const [d, setD] = useState(null)
  const [sq, setSq] = useState(null)
  const [pp, setPp] = useState(null)
  const [ghl, setGhl] = useState(null)
  const [sheets, setSheets] = useState(null)
  const [ret, setRet] = useState(null)
  const [comp, setComp] = useState(null)

  useEffect(() => { callFn('square-summary').then(setSq); callFn('pushpress-summary').then(setPp); callFn('ghl-summary').then(setGhl); callFn('sheets-summary').then(setSheets).catch(() => setSheets({ error: 'unavailable' })); loadComp().then(async c => { setComp(c); setRet(await loadRetention(c, { allLocations: true })) }) }, [])
  useEffect(() => {
    (async () => {
      const scope = q => loc === 'all' ? q : q.eq('location_id', loc)
      const [{ data: reports }, { data: questions }, { data: people }, { data: invites }] = await Promise.all([
        scope(supabase.from('reports').select('*, profiles(full_name)')).gte('report_date', daysAgo(30)).order('created_at', { ascending: false }),
        supabase.from('ai_questions').select('question, created_at, profiles(full_name)').order('created_at', { ascending: false }).limit(8),
        supabase.from('profiles').select('id, full_name, role, roles, title, pay_hourly, pay_per_session, pay_commission_pct').neq('role', 'owner'),
        supabase.from('team_invites').select('*').is('claimed_by', null),
      ])
      setD({ reports: reports || [], questions: questions || [], people: people || [], invites: invites || [] })
    })()
  }, [loc])

  if (!d) return <p className="muted">Loading…</p>
  const injuries = d.reports.filter(r => r.kind === 'injury' || r.kind === 'incident')
  // One roster: signed-up profiles + pre-registered teammates
  const roster = [...d.people.map(p => ({ ...p, source: 'profile' })), ...d.invites.map(i => ({ ...i, source: 'invite' }))].sort((a, b) => (a.full_name || '').localeCompare(b.full_name || ''))

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

      <SheetsKpis sheets={sheets} />

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
          {pp.revenue && (
            <div className="card">
              <div className="row between wrap"><h3 style={{ marginTop: 0 }}>Membership revenue · PushPress</h3><span className="small muted">active plans × monthly price</span></div>
              <div className="grid">
                <Stat label="Monthly recurring" value={money(pp.revenue.mrr)} tone="gold" sub={`${pp.revenue.pricedPlans} priced plans${pp.revenue.unpricedPlans ? ` · ${pp.revenue.unpricedPlans} without a price` : ''}`} />
                <Stat label="Billed so far this month" value={money(pp.revenue.chargedMonth)} sub="plans charged since the 1st" />
                <Stat label="Still due this month" value={money(pp.revenue.dueRest)} sub="next charge dates ahead" />
              </div>
              {role === 'owner' && <PlanPrices plans={pp.revenue.plansList} onSaved={() => callFn('pushpress-summary', { force: true }).then(setPp)} />}
            </div>
          )}
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
            <Stat label="Won this month" value={ghl.pipeline.wonMonth} sub={ghl.pipeline.wonValue ? money(ghl.pipeline.wonValue) : 'marked won in GHL'} tone="gold" />
            <Stat label="Evals today" value={ghl.appointments.today} sub={`${ghl.appointments.upcoming7} booked next 7 days`} />
            <Stat label="Showed · month" value={ghl.appointments.month?.showed ?? ghl.appointments.showed7} sub={`${ghl.appointments.month?.noshow ?? ghl.appointments.noshow7} no-shows${ghl.appointments.month?.showRate != null ? ` · ${ghl.appointments.month.showRate}% show rate` : ''}`} />
          </div>
          <div className="grid" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))' }}>
            {ghl.pipeline.byPipeline?.length > 0 && <div className="card" style={{ margin: 0 }}><h3 style={{ marginTop: 0 }}>Open by pipeline</h3><ul className="list">{ghl.pipeline.byPipeline.filter(([, c]) => c > 0).map(([n, c]) => <li key={n}><span className="grow small">{n}</span><b>{c}</b></li>)}</ul></div>}
            {ghl.pipeline.byStage?.length > 0 && <div className="card" style={{ margin: 0 }}><h3 style={{ marginTop: 0 }}>Sales pipeline by stage</h3><ul className="list">{ghl.pipeline.byStage.map(([n, c]) => <li key={n}><span className="grow small">{n.split(' · ').slice(1).join(' · ')}</span><b>{c}</b></li>)}</ul></div>}
            {ghl.leads.sources?.length > 0 && <div className="card" style={{ margin: 0 }}><h3 style={{ marginTop: 0 }}>Lead sources · month</h3><ul className="list">{ghl.leads.sources.map(([n, c]) => <li key={n}><span className="grow small">{n}</span><b>{c}</b></li>)}</ul></div>}
          </div>
          <div className="card" style={{ marginTop: 8 }}>
            <div className="row between"><h3 style={{ marginTop: 0 }}>Today's appointments</h3><Link to="/appointments" className="small">All appointments</Link></div>
            {ghl.appointments.todayList?.length ? <ul className="list">{ghl.appointments.todayList.map((a, i) => <li key={i}><span className="pill">{new Date(a.at).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}</span><span className="grow small">{a.title}{a.calendar ? <span className="muted"> · {a.calendar}</span> : null}{a.with ? <span className="muted"> · {a.with}</span> : null}</span>{a.status && <span className={`pill ${a.status === 'showed' ? 'good' : /no-show/.test(a.status) ? 'bad' : a.status === 'cancelled' ? '' : 'gold'}`}>{a.status}</span>}</li>)}</ul> : <p className="muted small" style={{ margin: 0 }}>Nothing booked today.</p>}
            {ghl.appointments.byCalendar?.length > 0 && <div className="small muted" style={{ marginTop: 8 }}>{ghl.appointments.byCalendar.map(([n, v]) => `${n}: ${v.booked} booked, ${v.showed} showed, ${v.noshow} no-show`).join(' · ')}</div>}
          </div>
        </>
      )}

      <h2>Retention · this month</h2>
      {ret && (
        <div className="card" style={ret.onTrack === false ? { borderColor: 'rgba(229,72,77,0.5)' } : {}}>
          <div className="grid">
            <Stat label="Churn" value={pct(ret.churn)} tone={ret.onTrack == null ? '' : ret.onTrack ? 'gold' : 'pink'} sub={`target under ${ret.target}%`} />
            <Stat label="Cancellations" value={ret.cancelCount} sub="plans ended this month · PushPress" />
            <Stat label="Active members" value={ret.active || '—'} sub="paying, not paused" />
            <Stat label="Churn bonus" value={ret.onTrack == null ? '—' : ret.onTrack ? 'On track' : 'Missed'} tone={ret.onTrack ? 'gold' : ''} sub={`${(comp?.bonus_people || []).join(' · ')}${Number(comp?.churn_bonus) ? ' · ' + money(comp.churn_bonus) + ' each' : ' · amount not set'}`} />
          </div>
        </div>
      )}

      <ClinicsCard pp={pp} />

      <h2>Pay & commission · {new Date().toLocaleDateString(undefined, { month: 'long' })}</h2>
      <PayCard pp={pp} sheets={sheets} ret={ret} comp={comp} roster={roster} onCompSaved={async () => { const c = await loadComp(); setComp(c); setRet(await loadRetention(c, { allLocations: true })) }} onRosterSaved={() => setD(null)} />

      <div className="card" style={injuries.length ? { borderColor: 'rgba(229,72,77,0.5)' } : {}}>
        <h2 style={{ marginTop: 0 }}>Injury reports · 30 days</h2>
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

// Owner sets what each PushPress plan bills per month. Guessed from the plan name where it says 1x/2x/3x per week.
function PlanPrices({ plans, onSaved }) {
  const [open, setOpen] = useState(false)
  const [vals, setVals] = useState({})
  const [saving, setSaving] = useState(false)
  if (!plans?.length) return null
  const missing = plans.filter(p => p.price == null && p.active > 0).length
  async function save() {
    setSaving(true)
    const rows = Object.entries(vals).map(([plan_id, v]) => ({ plan_id, monthly_price: v === '' ? null : Number(v), updated_at: new Date().toISOString() }))
    for (const r of rows) await supabase.from('plan_prices').update({ monthly_price: r.monthly_price, updated_at: r.updated_at }).eq('plan_id', r.plan_id)
    setSaving(false); setVals({}); setOpen(false); onSaved?.()
  }
  return (
    <div style={{ marginTop: 10 }}>
      <button className="btn ghost small" onClick={() => setOpen(!open)}>{open ? 'Close' : `Plan prices${missing ? ` · ${missing} to fill in` : ''}`}</button>
      {open && (
        <div style={{ marginTop: 10 }}>
          <ul className="list">
            {plans.map(p => (
              <li key={p.id}>
                <span className="grow"><div className="small" style={{ fontWeight: 500 }}>{p.name}</div><div className="small muted">{p.active} active{p.category ? ` · ${p.category}` : ''}</div></span>
                <span className="small muted">$</span>
                <input className="input" type="number" inputMode="decimal" placeholder="/ month" style={{ width: 110, minHeight: 34, padding: '5px 8px' }} value={vals[p.id] ?? (p.price ?? '')} onChange={e => setVals({ ...vals, [p.id]: e.target.value })} />
              </li>
            ))}
          </ul>
          <button className="btn small" disabled={saving || !Object.keys(vals).length} onClick={save}>{saving ? 'Saving…' : 'Save prices'}</button>
        </div>
      )}
    </div>
  )
}
