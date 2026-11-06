import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { useAuth } from '../lib/auth.jsx'
import { supabase } from '../lib/supabase'
import { callFn, money } from '../lib/api'
import SheetsKpis from '../components/SheetsKpis.jsx'
import PayCard from '../components/PayCard.jsx'
import TodayPanel from '../components/TodayPanel.jsx'
import RevenuePie from '../components/RevenuePie.jsx'
import ClinicsCard from '../components/ClinicsCard.jsx'
import { loadComp, loadRetention, pct } from '../lib/comp'

const daysAgo = n => new Date(Date.now() - n * 864e5).toISOString().slice(0, 10)
const greeting = () => { const h = new Date().getHours(); return h < 12 ? 'Good morning' : h < 17 ? 'Good afternoon' : 'Good evening' }

// Sections remember whether you left them open or closed (per browser).
const secKey = id => 'ceo.sec.' + id
const readOpen = (id, def) => { try { const v = localStorage.getItem(secKey(id)); return v == null ? def : v === '1' } catch { return def } }
export function openSection(id) {
  try { localStorage.setItem(secKey(id), '1') } catch { /* private mode */ }
  window.dispatchEvent(new CustomEvent('ceo:open', { detail: id }))
  setTimeout(() => document.getElementById('sec-' + id)?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 30)
}

function Section({ id, title, summary, action, defaultOpen = true, tone, children }) {
  const [open, setOpen] = useState(() => readOpen(id, defaultOpen))
  useEffect(() => { const h = e => { if (e.detail === id) setOpen(true) }; window.addEventListener('ceo:open', h); return () => window.removeEventListener('ceo:open', h) }, [id])
  const toggle = () => { setOpen(o => { try { localStorage.setItem(secKey(id), o ? '0' : '1') } catch { /* ignore */ } return !o }) }
  return (
    <section id={'sec-' + id} className={`sec ${open ? 'open' : ''} ${tone || ''}`}>
      <div className="sec-head" onClick={toggle} role="button" aria-expanded={open}>
        <span className="sec-chev">{open ? '▾' : '▸'}</span>
        <span className="sec-title">{title}</span>
        {summary && <span className="sec-sum">{summary}</span>}
        {action && <span className="sec-act" onClick={e => e.stopPropagation()}>{action}</span>}
      </div>
      {open && <div className="sec-body">{children}</div>}
    </section>
  )
}

// The six numbers worth knowing before anything else. Tap one to jump to its section.
function Glance({ sq, pp, ghl, sheets, cal }) {
  const people = sheets?.people || []
  const filled = people.filter(p => !p.error && p.filledToday)
  const notYet = people.filter(p => !p.error && !p.filledToday).map(p => p.name)
  const now = Date.now()
  const nextEv = cal?.connected && !cal.error ? (cal.todayEvents || []).find(e => !e.allDay && e.end && new Date(e.end).getTime() > now) : null
  const liveEv = nextEv && new Date(nextEv.start).getTime() <= now ? nextEv : null
  const monthTotal = sq?.connected && !sq.error ? (sq.month.sales || 0) + (pp?.revenue?.chargedMonth || 0) : null
  const tiles = [
    { id: 'sales', label: 'Sales today', value: sq ? (sq.connected && !sq.error ? money(sq.today.sales) : '—') : '…', sub: sq?.today ? `${sq.today.count} payments` : 'Square', tone: sq?.today?.sales > 0 ? 'good' : '' },
    { id: 'revenue', label: 'Month to date', value: monthTotal == null ? (sq ? '—' : '…') : money(monthTotal), sub: 'Square + memberships billed (est.)', tone: 'gold' },
    { id: 'members', label: 'Active members', value: pp ? (pp.connected && !pp.error ? (pp.active ?? pp.total ?? '—') : '—') : '…', sub: pp?.pending_cancel ? `${pp.pending_cancel} leaving · save them` : pp?.alerts ? `${pp.alerts} payment alerts` : pp?.pushpress_members ? `paying · ${pp.pushpress_members} in PushPress incl. ${pp.paused || 0} paused` : 'paying, not paused', tone: pp?.pending_cancel || pp?.alerts ? 'bad' : '' },
    { id: 'leads', label: 'New leads today', value: ghl ? (ghl.connected && !ghl.error ? ghl.leads.today : '—') : '…', sub: ghl?.leads ? `${ghl.leads.week} this week · ${ghl.appointments?.today || 0} evals today` : 'GoHighLevel' },
    { id: 'team', label: 'Team KPIs today', value: sheets ? (people.length ? `${filled.length}/${people.length}` : '—') : '…', sub: !people.length ? 'filled in' : notYet.length ? `not yet: ${notYet.join(', ')}` : 'everyone filled in', tone: people.length && !notYet.length ? 'good' : notYet.length && new Date().getHours() >= 20 ? 'bad' : '' },
    { id: 'today', label: liveEv ? 'Happening now' : 'Next up', value: nextEv ? nextEv.title : cal ? (cal.connected ? 'Calendar clear' : '—') : '…', sub: nextEv ? nextEv.time : 'nothing else on the calendar today', tone: liveEv ? 'gold' : '', text: true },
  ]
  return (
    <div className="glance">
      {tiles.map(t => (
        <a key={t.id} className={`gtile ${t.tone || ''}`} onClick={() => openSection(t.id)}>
          <div className="label">{t.label}</div>
          <div className={`value ${t.text ? 'text' : ''}`}>{t.value}</div>
          <div className="sub">{t.sub}</div>
        </a>
      ))}
    </div>
  )
}

export default function Dashboard() {
  const { role, locationId, locations, session, profile } = useAuth()
  const [loc, setLoc] = useState(role === 'owner' ? 'all' : locationId)
  const [d, setD] = useState(null)
  const [sq, setSq] = useState(null)
  const [pp, setPp] = useState(null)
  const [ghl, setGhl] = useState(null)
  const [sheets, setSheets] = useState(null)
  const [cal, setCal] = useState(null)
  const [ret, setRet] = useState(null)
  const [comp, setComp] = useState(null)
  const [asOf, setAsOf] = useState(null)

  const loadCal = (force) => callFn('calendar-summary', force ? { force: true } : undefined).then(setCal).catch(() => setCal({ connected: true, error: 'unavailable' }))
  const loadAll = (force) => {
    const opt = force ? { force: true } : undefined
    callFn('square-summary', opt).then(setSq); callFn('pushpress-summary', opt).then(setPp); callFn('ghl-summary', opt).then(setGhl)
    callFn('sheets-summary', opt).then(setSheets).catch(() => setSheets({ error: 'unavailable' })); loadCal(force)
    setAsOf(new Date())
  }
  useEffect(() => { loadAll(false); loadComp().then(async c => { setComp(c); setRet(await loadRetention(c, { allLocations: true })) }) }, [])
  useEffect(() => {
    (async () => {
      const scope = q => loc === 'all' ? q : q.eq('location_id', loc)
      const [{ data: reports }, { data: people }, { data: invites }] = await Promise.all([
        scope(supabase.from('reports').select('*, profiles(full_name)')).gte('report_date', daysAgo(30)).order('created_at', { ascending: false }),
        supabase.from('profiles').select('id, full_name, role, roles, title, pay_hourly, pay_per_session, pay_commission_pct').neq('role', 'owner'),
        supabase.from('team_invites').select('*').is('claimed_by', null),
      ])
      setD({ reports: reports || [], people: people || [], invites: invites || [] })
    })()
  }, [loc])

  if (!d) return <p className="muted">Loading…</p>
  const injuries = d.reports.filter(r => r.kind === 'injury' || r.kind === 'incident')
  // One roster: signed-up profiles + pre-registered teammates
  const roster = [...d.people.map(p => ({ ...p, source: 'profile' })), ...d.invites.map(i => ({ ...i, source: 'invite' }))].sort((a, b) => (a.full_name || '').localeCompare(b.full_name || ''))
  const first = (profile?.full_name || '').split(' ')[0]
  const today = new Date().toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric' })
  const people = sheets?.people || []
  const filledCount = people.filter(p => !p.error && p.filledToday).length
  const monthTotal = sq?.connected && !sq.error ? (sq.month.sales || 0) + (pp?.revenue?.chargedMonth || 0) : null

  return (
    <>
      <div className="row between wrap" style={{ alignItems: 'flex-end' }}>
        <div>
          <h1>{greeting()}{first ? `, ${first}` : ''}</h1>
          <p className="muted small" style={{ margin: 0 }}>{today} · everything below updates on its own{asOf ? ` · loaded ${asOf.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}` : ''}</p>
        </div>
        <div className="row" style={{ gap: 6 }}>
          {role === 'owner' && locations.length > 1 && (
            <select className="input" style={{ width: 'auto', minHeight: 36, padding: '6px 10px' }} value={loc} onChange={e => setLoc(e.target.value)}>
              <option value="all">All locations</option>{locations.map(l => <option key={l.id} value={l.id}>{l.name}</option>)}
            </select>
          )}
          <button className="btn ghost small" onClick={() => loadAll(true)}>Refresh all</button>
        </div>
      </div>

      <Glance sq={sq} pp={pp} ghl={ghl} sheets={sheets} cal={cal} />

      <Section id="today" title="Today" summary={cal?.connected && !cal.error ? `${cal.todayEvents?.length || 0} on the calendar` : ''}>
        <TodayPanel userId={session?.user?.id} cal={cal} onRefreshCal={() => loadCal(true)} />
      </Section>

      <Section id="revenue" title="Revenue" summary={monthTotal != null ? `${money(monthTotal)} this month` : ''}>
        <RevenuePie sq={sq} pp={pp} />
      </Section>

      <Section id="team" title="Team KPIs" summary={people.length ? `${filledCount} of ${people.length} filled in today` : ''} action={<a className="small" href="https://docs.google.com/spreadsheets" target="_blank" rel="noreferrer">Google Sheets</a>}>
        <SheetsKpis sheets={sheets} owner={role === 'owner'} embedded onRefresh={() => callFn('sheets-summary', { force: true }).then(setSheets)} />
      </Section>

      <Section id="sales" title="Sales · Square" summary={sq?.connected && !sq.error ? `${money(sq.today.sales)} today · ${money(sq.month.sales)} this month` : ''}>
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
            {sq.items?.length > 0 && <Fold label={`Top items this month (${Math.min(10, sq.items.length)})`}><ul className="list">{sq.items.slice(0, 10).map(([n, v]) => <li key={n}><span className="grow">{n}</span><b>{money(v)}</b></li>)}</ul></Fold>}
          </>
        )}
      </Section>

      <Section id="members" title="Members · PushPress" summary={pp?.connected && !pp.error ? `${pp.active ?? pp.total ?? '—'} active${pp.pending_cancel ? ` · ${pp.pending_cancel} leaving` : ''}${pp.alerts ? ` · ${pp.alerts} payment alerts` : ''}` : ''}>
        {!pp ? <p className="muted">Loading PushPress…</p> : !pp.connected ? (
          <div className="card"><p className="muted">PushPress isn't connected yet. Add <code>PUSHPRESS_API_KEY</code> in Netlify → Environment variables to see active members and plans here.</p></div>
        ) : pp.error ? <div className="card"><p className="flag">PushPress: {pp.error}</p></div> : (
          <>
            <div className="grid">
              <Stat label="Active members" value={pp.active ?? pp.total ?? '—'} tone="gold" sub={pp.active_enrollments ? `paying, not paused · ${pp.active_enrollments} plans` : 'from PushPress'} />
              {pp.pushpress_members != null && <Stat label="Members in PushPress" value={pp.pushpress_members} sub={`what PushPress calls "member" · includes ${pp.paused || 0} paused`} />}
              {pp.leads != null && <Stat label="Leads" value={pp.leads} sub="in PushPress · call list" />}
              {pp.cancellations_month != null && <Stat label="Cancelled this month" value={pp.cancellations_month} tone={pp.cancellations_month ? 'pink' : ''} sub="plans that ended" />}
              {pp.pending_cancel != null && <Stat label="Leaving" value={pp.pending_cancel} tone={pp.pending_cancel ? 'pink' : ''} sub="cancelled, still active · save them" />}
              {pp.alerts != null && <Stat label="Payment alerts" value={pp.alerts} tone={pp.alerts ? 'pink' : ''} sub="card failed · fix today" />}
              {pp.paused != null && <Stat label="Paused" value={pp.paused} sub="members on hold · not counted as active" />}
              {pp.ex_members != null && <Stat label="Ex-members" value={pp.ex_members} sub="win-back list" />}
            </div>
            {pp.revenue && (
              <div className="card">
                <div className="row between wrap"><h3 style={{ marginTop: 0 }}>Membership revenue · estimated</h3><span className="small muted">PushPress charge dates × your price list</span></div>
                <div className="grid">
                  <Stat label="Billed so far this month" value={money(pp.revenue.chargedMonth)} tone="gold" sub={`${pp.revenue.chargesSoFar} charge${pp.revenue.chargesSoFar === 1 ? '' : 's'} since the 1st`} />
                  <Stat label="Still due this month" value={money(pp.revenue.dueRest)} sub={`${pp.revenue.chargesDue} charge${pp.revenue.chargesDue === 1 ? '' : 's'} ahead`} />
                  <Stat label="Expected this month" value={money(pp.revenue.expectedMonth)} sub="billed + still due" />
                  <Stat label="Monthly recurring · regular price" value={money(pp.revenue.mrr)} sub={`${pp.revenue.billingPlans} billing plans${pp.revenue.unpricedPlans ? ` · ${pp.revenue.unpricedPlans} without a price` : ''}`} />
                </div>
                {pp.revenue.cadence && <div className="small muted" style={{ marginTop: 6 }}>How they bill: {Object.entries(pp.revenue.cadence).sort((a, b) => b[1] - a[1]).map(([k, v]) => `${v} ${k}`).join(' · ')}</div>}
                {pp.revenue.soon?.length > 0 && <Fold label={`Charging in the next 7 days (${pp.revenue.soon.length} · ${money(pp.revenue.soon.reduce((a, s) => a + (s.amount || 0), 0))})`}><ul className="list">{pp.revenue.soon.map((s, i) => <li key={i}><span className="pill">{new Date(s.at + 'T12:00:00').toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' })}</span><span className="grow small">{s.name}<span className="muted"> · {s.plan} · {s.cycle}</span></span><b>{s.amount != null ? money(s.amount) : '—'}</b></li>)}</ul></Fold>}
                <p className="small muted" style={{ margin: '10px 0 0' }}>PushPress's API shares who is on which plan and when each charge lands, not the dollar amounts. These use the plan prices below: the evaluation month at the first price, then the regular monthly price (a quarterly plan is charged three months at once).</p>
                {role === 'owner' && <PlanPrices plans={pp.revenue.plansList} onSaved={() => callFn('pushpress-summary', { force: true }).then(setPp)} />}
              </div>
            )}
            {(pp.alert_list?.length > 0 || pp.leaving?.length > 0 || pp.cancelled?.length > 0) && (
              <div className="card">
                {pp.alert_list?.length > 0 && <><h3 style={{ marginTop: 0 }}>Payment failed · call today</h3><ul className="list">{pp.alert_list.map((c, i) => <li key={'a' + i}><span className="grow">{c.name}{c.plan ? <span className="muted"> · {c.plan}</span> : null}</span><span className="pill bad">Payment failed</span></li>)}</ul></>}
                {pp.leaving?.length > 0 && <><h3 style={{ marginTop: pp.alert_list?.length ? 12 : 0 }}>Leaving · save them this week</h3><ul className="list">{pp.leaving.slice(0, 10).map((c, i) => <li key={'l' + i}><span className="grow">{c.name}{c.plan ? <span className="muted"> · {c.plan}</span> : null}</span><span className="pill bad">{c.at ? 'Ends ' + new Date(c.at).toLocaleDateString() : 'Ending'}</span></li>)}</ul></>}
                {pp.cancelled?.length > 0 && <><h3 style={{ marginTop: 12 }}>Cancelled this month</h3><ul className="list">{pp.cancelled.slice(0, 10).map((c, i) => <li key={'c' + i}><span className="grow">{c.name}{c.plan ? <span className="muted"> · {c.plan}</span> : null}</span><span className="small muted">{c.at ? new Date(c.at).toLocaleDateString() : ''}</span></li>)}</ul></>}
              </div>
            )}
            {pp.plans?.length > 0 && <Fold label={`Active plans by name (${pp.plans.length})`}><ul className="list">{pp.plans.map(([n, c]) => <li key={n}><span className="grow">{n}</span><b>{c}</b></li>)}</ul></Fold>}
          </>
        )}
      </Section>

      <Section id="leads" title="Leads · GoHighLevel" summary={ghl?.connected && !ghl.error ? `${ghl.leads.today} today · ${ghl.pipeline.open} open opportunities` : ''} action={<Link to="/appointments" className="small">Appointments</Link>}>
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
              {(ghl.pipeline.stagesByPipeline || []).map(p => (
                <div className="card" style={{ margin: 0 }} key={p.name}>
                  <div className="row between"><h3 style={{ marginTop: 0 }}>{p.name}</h3><span className="pill gold">{p.open} open</span></div>
                  <ul className="list">{p.stages.map(([n, c]) => <li key={n} style={{ padding: '7px 0' }}><span className="grow small" style={{ color: c ? 'var(--text)' : 'var(--faint)' }}>{n}</span><b style={{ color: c ? 'var(--text)' : 'var(--faint)' }}>{c}</b></li>)}</ul>
                </div>
              ))}
              {ghl.leads.sources?.length > 0 && <div className="card" style={{ margin: 0 }}><h3 style={{ marginTop: 0 }}>Lead sources · month</h3><ul className="list">{ghl.leads.sources.map(([n, c]) => <li key={n}><span className="grow small">{n}</span><b>{c}</b></li>)}</ul></div>}
            </div>
            <div className="card" style={{ marginTop: 8 }}>
              <div className="row between"><h3 style={{ marginTop: 0 }}>Today's appointments</h3><Link to="/appointments" className="small">All appointments</Link></div>
              {ghl.appointments.todayList?.length ? <ul className="list">{ghl.appointments.todayList.map((a, i) => <li key={i}><span className="pill">{new Date(a.at).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}</span><span className="grow small">{a.title}{a.calendar ? <span className="muted"> · {a.calendar}</span> : null}{a.with ? <span className="muted"> · {a.with}</span> : null}</span>{a.status && <span className={`pill ${a.status === 'showed' ? 'good' : /no-show/.test(a.status) ? 'bad' : a.status === 'cancelled' ? '' : 'gold'}`}>{a.status}</span>}</li>)}</ul> : <p className="muted small" style={{ margin: 0 }}>Nothing booked today.</p>}
              {ghl.appointments.byCalendar?.length > 0 && <div className="small muted" style={{ marginTop: 8 }}>{ghl.appointments.byCalendar.map(([n, v]) => `${n}: ${v.booked} booked, ${v.showed} showed, ${v.noshow} no-show`).join(' · ')}</div>}
            </div>
          </>
        )}
      </Section>

      <Section id="retention" title="Retention · this month" summary={ret ? `${pct(ret.churn)} churn · target under ${ret.target}%` : ''} tone={ret?.onTrack === false ? 'bad' : ''}>
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
      </Section>

      <Section id="clinics" title="Clinics & camps · PushPress" summary={pp?.clinics ? `${pp.clinics.filter(c => new Date(c.ends) >= new Date()).length} upcoming` : ''} action={<Link to="/clinics" className="small">Open</Link>}>
        <ClinicsCard pp={pp} embedded />
      </Section>

      <Section id="pay" title={`Pay & commission · ${new Date().toLocaleDateString(undefined, { month: 'long' })}`} defaultOpen={false}>
        <PayCard pp={pp} sheets={sheets} ret={ret} comp={comp} roster={roster} onCompSaved={async () => { const c = await loadComp(); setComp(c); setRet(await loadRetention(c, { allLocations: true })) }} onRosterSaved={() => setD(null)} />
      </Section>

      <Section id="injuries" title="Injury reports · 30 days" summary={injuries.length ? `${injuries.length} filed` : 'none filed'} tone={injuries.length ? 'bad' : ''} defaultOpen={injuries.length > 0}>
        <div className="card" style={injuries.length ? { borderColor: 'rgba(229,72,77,0.5)' } : {}}>
          {injuries.length === 0 ? <p className="muted small" style={{ margin: 0 }}>None filed.</p> : (
            <ul className="list">{injuries.map(r => <li key={r.id} style={{ alignItems: 'flex-start' }}><span className={`pill ${/Serious/.test(r.data?.severity || '') ? 'bad' : /Moderate/.test(r.data?.severity || '') ? 'gold' : ''}`}>{(r.data?.severity || 'Injury').split(' ')[0]}</span><span className="grow"><div style={{ fontWeight: 500 }}>{r.data?.athlete} <span className="muted small">· {r.data?.injury}</span></div><div className="small muted">{r.data?.what}</div><div className="small muted">{r.profiles?.full_name} · {r.data?.when ? new Date(r.data.when).toLocaleString() : r.report_date}{r.data?.followup && <span className="flag"> · follow-up: {r.data.followup}</span>}</div></span></li>)}</ul>
          )}
        </div>
      </Section>
    </>
  )
}

function Stat({ label, value, tone, sub }) {
  return <div className="stat"><div className="label">{label}</div><div className={`value ${tone || ''}`}>{value}</div>{sub && <div className="small muted">{sub}</div>}</div>
}

// A long list, tucked away until you want it.
function Fold({ label, children }) {
  const [open, setOpen] = useState(false)
  return (
    <div className="fold">
      <a className="small fold-t" onClick={() => setOpen(!open)}>{open ? '▾' : '▸'} {label}</a>
      {open && <div className="card" style={{ marginTop: 8 }}>{children}</div>}
    </div>
  )
}

// Owner sets what each PushPress plan bills: the first (evaluation) charge and the regular monthly price. Seeded from the price list by plan name.
function PlanPrices({ plans, onSaved }) {
  const [open, setOpen] = useState(false)
  const [vals, setVals] = useState({})      // plan_id → { monthly_price?, first_price? }
  const [evalMonths, setEvalMonths] = useState(null)
  const [saving, setSaving] = useState(false)
  if (!plans?.length) return null
  const missing = plans.filter(p => p.price == null && p.active > 0).length
  const curEval = evalMonths ?? (plans.find(p => p.first != null)?.firstMonths ?? 1)
  const set = (id, k, v) => setVals({ ...vals, [id]: { ...(vals[id] || {}), [k]: v } })
  const num = (v) => v === '' || v == null ? null : Number(v)
  async function save() {
    setSaving(true)
    const at = new Date().toISOString()
    for (const [plan_id, v] of Object.entries(vals)) {
      const patch = { updated_at: at }
      if ('monthly_price' in v) patch.monthly_price = num(v.monthly_price)
      if ('first_price' in v) patch.first_price = num(v.first_price)
      await supabase.from('plan_prices').update(patch).eq('plan_id', plan_id)
    }
    if (evalMonths != null) await supabase.from('plan_prices').update({ first_months: Math.max(1, Number(evalMonths) || 1), updated_at: at }).not('first_price', 'is', null)
    setSaving(false); setVals({}); setEvalMonths(null); setOpen(false); onSaved?.()
  }
  const dirty = Object.keys(vals).length > 0 || evalMonths != null
  return (
    <div style={{ marginTop: 10 }}>
      <button className="btn ghost small" onClick={() => setOpen(!open)}>{open ? 'Close' : `Plan prices${missing ? ` · ${missing} to fill in` : ''}`}</button>
      {open && (
        <div style={{ marginTop: 10 }}>
          <div className="row wrap" style={{ gap: 8, alignItems: 'center', marginBottom: 6 }}>
            <span className="small muted">Evaluation period:</span>
            <input className="input" type="number" min="1" max="12" style={{ width: 70, minHeight: 34, padding: '5px 8px' }} value={curEval} onChange={e => setEvalMonths(e.target.value)} />
            <span className="small muted">month{Number(curEval) === 1 ? '' : 's'} at the first price, then the regular price. Session packs: put the pack price under "regular".</span>
          </div>
          <ul className="list">
            <li className="small muted" style={{ borderBottom: 'none', padding: '2px 0' }}><span className="grow">Plan</span><span style={{ width: 100, textAlign: 'center' }}>First charge</span><span style={{ width: 100, textAlign: 'center' }}>Then / month</span></li>
            {plans.map(p => (
              <li key={p.id}>
                <span className="grow"><div className="small" style={{ fontWeight: 500 }}>{p.name}</div><div className="small muted">{p.active} active{p.category ? ` · ${p.category}` : ''}</div></span>
                <input className="input" type="number" inputMode="decimal" placeholder="same" title="First (evaluation) charge" style={{ width: 100, minHeight: 34, padding: '5px 8px' }} value={vals[p.id]?.first_price ?? (p.first ?? '')} onChange={e => set(p.id, 'first_price', e.target.value)} />
                <input className="input" type="number" inputMode="decimal" placeholder="/ month" title="Regular monthly price" style={{ width: 100, minHeight: 34, padding: '5px 8px' }} value={vals[p.id]?.monthly_price ?? (p.price ?? '')} onChange={e => set(p.id, 'monthly_price', e.target.value)} />
              </li>
            ))}
          </ul>
          <button className="btn small" disabled={saving || !dirty} onClick={save}>{saving ? 'Saving…' : 'Save prices'}</button>
        </div>
      )}
    </div>
  )
}
