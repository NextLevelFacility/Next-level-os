import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { useAuth } from '../lib/auth.jsx'
import { supabase, today, PROGRAMS, fmtTime } from '../lib/supabase'
import { money } from '../lib/api'
import Goals from '../components/Goals.jsx'

// The sales board: goals on top, then one-tap logging. Every log bumps the matching goal.
const weekStart = () => { const d = new Date(); d.setDate(d.getDate() - ((d.getDay() + 6) % 7)); return d.toISOString().slice(0, 10) }

export default function Sales() {
  const { user, locationId, profile } = useAuth()
  const [log, setLog] = useState([])
  const [week, setWeek] = useState([])
  const [form, setForm] = useState(null)   // { kind, name, program, amount, when_at, note }
  const [goalsKey, setGoalsKey] = useState(0)

  async function load() {
    const { data } = await supabase.from('sales_log').select('*').eq('user_id', user.id).eq('log_date', today()).order('created_at', { ascending: false })
    setLog(data || [])
    const { data: w } = await supabase.from('sales_log').select('kind, amount, log_date').eq('user_id', user.id).gte('log_date', weekStart())
    setWeek(w || [])
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

  return (
    <>
      <h1>Sales</h1>
      <p className="muted">{profile.full_name?.split(' ')[0]}, this is your board. Log every call, meeting and close here. The goals update as you go.</p>

      <Goals roles={['sales']} refresh={goalsKey} />

      <div className="card">
        <h2>Log it</h2>
        <div className="row wrap" style={{ gap: 8 }}>
          <button className="btn" onClick={() => logCalls(1)}>+1 call</button>
          <button className="btn" onClick={() => logCalls(10)}>+10 calls</button>
          <button className="btn gold" onClick={() => setForm({ kind: 'meeting', name: '', program: '', when_at: '', note: '' })}>Meeting booked</button>
          <button className="btn good" onClick={() => setForm({ kind: 'close', name: '', program: PROGRAMS[0], amount: '', note: '' })}>Close</button>
          <button className="btn ghost" onClick={() => setForm({ kind: 'eval', name: '', program: '', when_at: '', note: '' })}>Eval showed</button>
        </div>
        {form && (
          <form onSubmit={submit} className="card accent" style={{ marginTop: 12 }}>
            <h3>{form.kind === 'meeting' ? 'Meeting booked' : form.kind === 'close' ? 'New close' : 'Eval showed'}</h3>
            <label className="field"><span>{form.kind === 'close' ? 'Athlete / family' : 'Lead name'}</span><input className="input" value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} required autoFocus /></label>
            {form.kind !== 'eval' && <label className="field"><span>Program</span><select className="input" value={form.program || ''} onChange={e => setForm({ ...form, program: e.target.value })}><option value="">—</option>{PROGRAMS.map(p => <option key={p}>{p}</option>)}<option>Thanksgiving Clinic</option><option>Winter Clinic</option><option>Spring Clinic</option><option>Summer Camp</option></select></label>}
            {form.kind === 'close' && <label className="field"><span>Amount signed ($)</span><input className="input" type="number" inputMode="decimal" value={form.amount} onChange={e => setForm({ ...form, amount: e.target.value })} /></label>}
            {form.kind !== 'close' && <label className="field"><span>When</span><input className="input" type="datetime-local" value={form.when_at} onChange={e => setForm({ ...form, when_at: e.target.value })} /></label>}
            <label className="field"><span>Note</span><input className="input" value={form.note} onChange={e => setForm({ ...form, note: e.target.value })} placeholder="Objection, source, next step…" /></label>
            <div className="row" style={{ gap: 8 }}><button className="btn">Save</button><button type="button" className="btn ghost" onClick={() => setForm(null)}>Cancel</button></div>
          </form>
        )}
      </div>

      <div className="grid" style={{ marginBottom: 12 }}>
        <div className="stat"><div className="label">Signed today</div><div className="value pink">{money(todayRev)}</div></div>
        <div className="stat"><div className="label">Calls this week</div><div className="value">{wkCalls}</div></div>
        <div className="stat"><div className="label">Meetings this week</div><div className="value">{wk('meeting').length}</div></div>
        <div className="stat"><div className="label">Closes this week</div><div className="value gold">{wk('close').length}</div></div>
        <div className="stat"><div className="label">Signed this week</div><div className="value gold">{money(wkRev)}</div></div>
      </div>

      <div className="card">
        <h2>Today's log</h2>
        {log.length === 0 ? <p className="muted">Nothing logged yet. First call of the day?</p> : (
          <ul className="list">
            {log.map(e => (
              <li key={e.id}>
                <span className={`pill ${e.kind === 'close' ? 'good' : e.kind === 'meeting' ? 'gold' : e.kind === 'eval' ? 'pink' : ''}`}>{e.kind}</span>
                <span className="grow"><div>{e.name || e.note}</div><div className="small muted">{[e.program, e.amount && e.kind === 'close' ? money(e.amount) : null, e.when_at ? fmtTime(e.when_at) : null, e.name ? e.note : null].filter(Boolean).join(' · ')} · {fmtTime(e.created_at)}</div></span>
                <button className="btn ghost small" onClick={() => remove(e)}>×</button>
              </li>
            ))}
          </ul>
        )}
      </div>

      <div className="card">
        <h2>Your playbook</h2>
        <p className="small muted">Scripts, objections, the evaluation close. Read them, then run them.</p>
        <Link to="/playbook" className="btn ghost small">Open sales SOPs</Link>
        <Link to="/reports" className="btn ghost small" style={{ marginLeft: 8 }}>End-of-day report</Link>
      </div>
    </>
  )
}
