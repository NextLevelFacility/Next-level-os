import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { useAuth } from '../lib/auth.jsx'
import { supabase, today, PROGRAMS, fmtTime } from '../lib/supabase'
import { money } from '../lib/api'
import Goals from '../components/Goals.jsx'
import LiveNumbers from '../components/LiveNumbers.jsx'
import { loadComp, loadRetention, commissionFor, isBonusPerson, monthStart, pct } from '../lib/comp'

// The sales board: goals on top, then one-tap logging. Every log bumps the matching goal.
const weekStart = () => { const d = new Date(); d.setDate(d.getDate() - ((d.getDay() + 6) % 7)); return d.toISOString().slice(0, 10) }

export default function Sales() {
  const { user, locationId, profile } = useAuth()
  const [log, setLog] = useState([])
  const [week, setWeek] = useState([])
  const [form, setForm] = useState(null)   // { kind, name, program, amount, when_at, note }
  const [goalsKey, setGoalsKey] = useState(0)
  const [month, setMonth] = useState([])
  const [comp, setComp] = useState(null)
  const [ret, setRet] = useState(null)

  async function load() {
    const { data } = await supabase.from('sales_log').select('*').eq('user_id', user.id).eq('log_date', today()).order('created_at', { ascending: false })
    setLog(data || [])
    const { data: w } = await supabase.from('sales_log').select('kind, amount, log_date').eq('user_id', user.id).gte('log_date', weekStart())
    setWeek(w || [])
    const { data: mo } = await supabase.from('sales_log').select('kind, amount').eq('user_id', user.id).gte('log_date', monthStart())
    setMonth(mo || [])
    const c = await loadComp(); setComp(c)
    setRet(await loadRetention(c, { locationId }))
  }
  useEffect(() => { load() }, [user.id])

  async function bump(metric, by = 1) {
    const { data: k } = await supabase.from('kpi_days').select('data').eq('user_id', user.id).eq('kpi_date', today()).maybeSingle()
    const d = { ...(k?.data || {}) }; d[metric] = Math.max(0, (Number(d[metric]) || 0) + by)
    await supabase.from('kpi_days').upsert({ user_id: user.id, location_id: locationId, kpi_date: today(), data: d, updated_at: new Date().toISOString() }, { onConflict: 'user_id,kpi_date' })
    setGoalsKey(x => x + 1)
  }
  async function logCalls(n) {
    await supabase.from('sales_log').insert({ user_id: user.id, location_id: locationId, kind: 'call', note: `${n} call${n > 1 ? 's' : ''}`, amount: n })
    await bump('calls', n); load()
  }
  async function submit(e) {
    e.preventDefault()
    const { error } = await supabase.from('sales_log').insert({ user_id: user.id, location_id: locationId, kind: form.kind, name: form.name, program: form.program || null, amount: form.amount === '' || form.amount == null ? null : Number(form.amount), when_at: form.when_at ? new Date(form.when_at).toISOString() : null, note: form.note || null })
    if (error) return alert(error.message)
    if (form.kind === 'meeting') await bump('meetings')
    if (form.kind === 'close') await bump('closes')
    setForm(null); load()
  }
  async function remove(entry) {
    if (!confirm('Remove this entry?')) return
    await supabase.from('sales_log').delete().eq('id', entry.id)
    if (entry.kind === 'call') await bump('calls', -(Number(entry.amount) || 1))
    if (entry.kind === 'meeting') await bump('meetings', -1)
    if (entry.kind === 'close') await bump('closes', -1)
    load()
  }

  const wk = k => week.filter(x => x.kind === k)
  const wkCalls = wk('call').reduce((a, x) => a + (Number(x.amount) || 1), 0)
  const wkRev = wk('close').reduce((a, x) => a + (Number(x.amount) || 0), 0)
  const todayRev = log.filter(x => x.kind === 'close').reduce((a, x) => a + (Number(x.amount) || 0), 0)
  const monthRev = month.filter(x => x.kind === 'close').reduce((a, x) => a + (Number(x.amount) || 0), 0)
  const monthCloses = month.filter(x => x.kind === 'close').length

  return (
    <>
      <h1>Sales</h1>
      <p className="muted">Log every call, meeting, close and cancellation here. Targets update as you go.</p>

      <Goals roles={['sales']} refresh={goalsKey} title="Today's targets" />
      <LiveNumbers />

      <div className="card">
        <h2>Log activity</h2>
        <div className="row wrap" style={{ gap: 8 }}>
          <button className="btn ghost" onClick={() => logCalls(1)}>+1 call</button>
          <button className="btn ghost" onClick={() => logCalls(10)}>+10 calls</button>
          <button className="btn" onClick={() => setForm({ kind: 'meeting', name: '', program: '', when_at: '', note: '' })}>Meeting booked</button>
          <button className="btn" onClick={() => setForm({ kind: 'close', name: '', program: PROGRAMS[0], amount: '', note: '' })}>Close</button>
          <button className="btn ghost" onClick={() => setForm({ kind: 'eval', name: '', program: '', when_at: '', note: '' })}>Eval showed</button>
          <button className="btn danger" onClick={() => setForm({ kind: 'cancel', name: '', program: PROGRAMS[0], amount: '', note: '' })}>Cancellation</button>
        </div>
        {form && (
          <form onSubmit={submit} className="card accent" style={{ marginTop: 12, marginBottom: 0 }}>
            <h3>{form.kind === 'meeting' ? 'Meeting booked' : form.kind === 'close' ? 'New close' : form.kind === 'cancel' ? 'Cancellation' : 'Eval showed'}</h3>
            <label className="field"><span>{form.kind === 'close' || form.kind === 'cancel' ? 'Athlete / family' : 'Lead name'}</span><input className="input" value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} required autoFocus /></label>
            {form.kind !== 'eval' && <label className="field"><span>Program</span><select className="input" value={form.program || ''} onChange={e => setForm({ ...form, program: e.target.value })}><option value="">—</option>{PROGRAMS.map(p => <option key={p}>{p}</option>)}<option>Thanksgiving Clinic</option><option>Winter Clinic</option><option>Spring Clinic</option><option>Summer Camp</option></select></label>}
            {form.kind === 'close' && <label className="field"><span>Amount signed ($)</span><input className="input" type="number" inputMode="decimal" value={form.amount} onChange={e => setForm({ ...form, amount: e.target.value })} /></label>}
            {form.kind === 'cancel' && <label className="field"><span>Monthly value lost ($)</span><input className="input" type="number" inputMode="decimal" value={form.amount} onChange={e => setForm({ ...form, amount: e.target.value })} /></label>}
            {(form.kind === 'meeting' || form.kind === 'eval') && <label className="field"><span>When</span><input className="input" type="datetime-local" value={form.when_at} onChange={e => setForm({ ...form, when_at: e.target.value })} /></label>}
            <label className="field"><span>{form.kind === 'cancel' ? 'Reason (required)' : 'Note'}</span><input className="input" value={form.note} onChange={e => setForm({ ...form, note: e.target.value })} placeholder={form.kind === 'cancel' ? 'Moving, price, schedule, coach, lost interest…' : 'Objection, source, next step…'} required={form.kind === 'cancel'} /></label>
            <div className="row" style={{ gap: 8 }}><button className="btn">Save</button><button type="button" className="btn ghost" onClick={() => setForm(null)}>Cancel</button></div>
          </form>
        )}
      </div>

      {comp && (
        <div className="card">
          <div className="row between wrap">
            <div><h2 style={{ margin: 0 }}>Earnings · {new Date().toLocaleDateString(undefined, { month: 'long' })}</h2><div className="small muted">{profile.pay_commission_pct ?? comp.commission_pct}% commission on everything you sign</div></div>
            <div style={{ textAlign: 'right' }}><div className="small muted">Commission so far</div><div className="display" style={{ fontSize: '1.6rem', color: 'var(--gold)' }}>{money(commissionFor(monthRev, profile, comp))}</div><div className="small muted">on {money(monthRev)} signed · {monthCloses} closes</div></div>
          </div>
          {isBonusPerson(profile, comp) && ret && (
            <div className="row between wrap" style={{ marginTop: 12, paddingTop: 12, borderTop: '1px solid var(--line)' }}>
              <div><div style={{ fontWeight: 600 }}>Churn bonus · keep churn under {ret.target}%</div><div className="small muted">{ret.cancelCount} cancellation{ret.cancelCount === 1 ? '' : 's'} this month · {ret.active} active members{ret.activeSource === 'manual' ? ' (set by Owner)' : ' (PushPress)'}</div></div>
              <div style={{ textAlign: 'right' }}>
                <div className="display" style={{ fontSize: '1.4rem', color: ret.onTrack == null ? 'var(--muted)' : ret.onTrack ? 'var(--good)' : 'var(--bad)' }}>{pct(ret.churn)}</div>
                <span className={`pill ${ret.onTrack == null ? '' : ret.onTrack ? 'good' : 'bad'}`}>{ret.onTrack == null ? 'Needs member count' : ret.onTrack ? `On track${Number(comp.churn_bonus) ? ' · ' + money(comp.churn_bonus) : ''}` : 'Over target'}</span>
              </div>
            </div>
          )}
        </div>
      )}

      <div className="grid" style={{ marginBottom: 12 }}>
        <div className="stat"><div className="label">Signed today</div><div className="value">{money(todayRev)}</div></div>
        <div className="stat"><div className="label">Calls this week</div><div className="value">{wkCalls}</div></div>
        <div className="stat"><div className="label">Meetings this week</div><div className="value">{wk('meeting').length}</div></div>
        <div className="stat"><div className="label">Closes this week</div><div className="value gold">{wk('close').length}</div></div>
        <div className="stat"><div className="label">Signed this week</div><div className="value gold">{money(wkRev)}</div></div>
      </div>

      <div className="card">
        <h2>Today's log</h2>
        {log.length === 0 ? <p className="muted">No activity logged today.</p> : (
          <ul className="list">
            {log.map(e => (
              <li key={e.id}>
                <span className={`pill ${e.kind === 'close' ? 'good' : e.kind === 'meeting' ? 'gold' : e.kind === 'cancel' ? 'bad' : ''}`}>{e.kind === 'cancel' ? 'Cancellation' : e.kind === 'eval' ? 'Eval showed' : e.kind === 'meeting' ? 'Meeting' : e.kind === 'close' ? 'Close' : 'Calls'}</span>
                <span className="grow"><div>{e.name || e.note}</div><div className="small muted">{[e.program, e.amount && (e.kind === 'close' || e.kind === 'cancel') ? (e.kind === 'cancel' ? '-' : '') + money(e.amount) : null, e.when_at ? fmtTime(e.when_at) : null, e.name ? e.note : null].filter(Boolean).join(' · ')} · {fmtTime(e.created_at)}</div></span>
                <button className="btn ghost small" onClick={() => remove(e)}>×</button>
              </li>
            ))}
          </ul>
        )}
      </div>

      <div className="card">
        <h2>Sales SOPs</h2>
        <p className="small muted">Scripts, objections and the evaluation close.</p>
        <Link to="/playbook" className="btn ghost small">Open the Playbook</Link>
      </div>
    </>
  )
}
