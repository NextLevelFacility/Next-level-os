import { useEffect, useState } from 'react'
import { useAuth } from '../lib/auth.jsx'
import { supabase, ROLES, isManager, hours, fmtTime } from '../lib/supabase'
import { money } from '../lib/api'
import { sops } from '../lib/vault'
import { roleMatches } from './Today.jsx'

const periods = {
  week: () => { const d = new Date(); d.setHours(0, 0, 0, 0); d.setDate(d.getDate() - ((d.getDay() + 6) % 7)); return [d, new Date()] },
  lastweek: () => { const [s] = periods.week(); const e = new Date(s); const b = new Date(s); b.setDate(b.getDate() - 7); return [b, e] },
  month: () => { const d = new Date(); return [new Date(d.getFullYear(), d.getMonth(), 1), new Date()] },
  lastmonth: () => { const d = new Date(); return [new Date(d.getFullYear(), d.getMonth() - 1, 1), new Date(d.getFullYear(), d.getMonth(), 1)] },
}

export default function Team() {
  const { role, locations, refresh, user } = useAuth()
  const manager = isManager(role)
  const [people, setPeople] = useState([])
  const [reads, setReads] = useState([])
  const [time, setTime] = useState([])
  const [sessions, setSessions] = useState([])
  const [goals, setGoals] = useState([])
  const [period, setPeriod] = useState('week')
  const [open, setOpen] = useState(null)
  const [tab, setTab] = useState('people')
  const [goalForm, setGoalForm] = useState(null)
  const [modsDone, setModsDone] = useState([])
  const [modsTotal, setModsTotal] = useState(0)

  async function load() {
    const { data } = await supabase.from('profiles').select('*').order('full_name'); setPeople(data || [])
    if (manager) {
      const [from, to] = periods[period]()
      const [{ data: r }, { data: t }, { data: s }, { data: g }, { data: mp }, { data: ms }] = await Promise.all([
        supabase.from('sop_reads').select('user_id, sop_path'),
        supabase.from('time_entries').select('*').gte('clock_in', from.toISOString()).lt('clock_in', to.toISOString()).order('clock_in', { ascending: false }),
        supabase.from('sessions').select('id, coach_id, session_date, duration_min, session_athletes(count)').gte('session_date', from.toISOString().slice(0, 10)).lt('session_date', to.toISOString().slice(0, 10)),
        supabase.from('kpi_goals').select('*').order('role').order('sort'),
        supabase.from('module_progress').select('user_id, module_id'),
        supabase.from('modules').select('id').eq('published', true),
      ])
      setReads(r || []); setTime(t || []); setSessions(s || []); setGoals(g || []); setModsDone(mp || []); setModsTotal((ms || []).length)
    }
  }
  useEffect(() => { load() }, [role, period])

  async function update(id, patch) {
    const { error } = await supabase.from('profiles').update(patch).eq('id', id)
    if (error) alert(error.message); else { load(); if (id === user.id) refresh() }
  }
  const locName = id => locations.find(l => l.id === id)?.name || '—'
  const hoursOf = uid => time.filter(t => t.user_id === uid).reduce((a, t) => a + ((t.clock_out ? new Date(t.clock_out) : new Date()) - new Date(t.clock_in)), 0) / 36e5
  const sessionsOf = uid => sessions.filter(s => s.coach_id === uid)
  const payOf = p => { const h = hoursOf(p.id), n = sessionsOf(p.id).length; return (Number(p.pay_hourly) || 0) * h + (Number(p.pay_per_session) || 0) * n }
  const totalPay = people.reduce((a, p) => a + payOf(p), 0)

  function exportCsv() {
    const rows = [['Name', 'Role', 'Hours', 'Sessions', 'Hourly rate', 'Per-session rate', 'Pay'], ...people.map(p => [p.full_name, p.role, hoursOf(p.id).toFixed(2), sessionsOf(p.id).length, p.pay_hourly || '', p.pay_per_session || '', payOf(p).toFixed(2)])]
    const blob = new Blob([rows.map(r => r.map(v => `"${String(v).replace(/"/g, '""')}"`).join(',')).join('\n')], { type: 'text/csv' })
    const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = `next-level-pay-${period}.csv`; a.click()
  }
  async function saveGoal(e) {
    e.preventDefault()
    const { id, ...rest } = goalForm
    const { error } = id ? await supabase.from('kpi_goals').update(rest).eq('id', id) : await supabase.from('kpi_goals').insert(rest)
    if (error) return alert(error.message); setGoalForm(null); load()
  }

  return (
    <>
      <h1>Team</h1>
      {manager && <div className="row" style={{ gap: 6, marginBottom: 12 }}>{[['people', 'People'], ['pay', 'Hours & pay'], ['goals', 'Daily goals']].map(([k, l]) => <button key={k} className={`btn small ${tab === k ? '' : 'ghost'}`} onClick={() => setTab(k)}>{l}</button>)}</div>}

      {tab === 'people' && <>
        <p className="muted">Every seat, who sits in it, and where. {manager && 'Tap a role or location to change it.'}</p>
        {people.map(p => {
          const need = sops().filter(n => roleMatches(n, p.role)).length, have = reads.filter(r => r.user_id === p.id).length
          const md = modsDone.filter(m => m.user_id === p.id).length
          return (
            <div className="card" key={p.id}>
              <div className="row between wrap">
                <div><div style={{ fontWeight: 600 }}>{p.full_name || p.email}</div><div className="small muted">{p.title ? p.title + ' · ' : ''}{p.email}{p.phone && ` · ${p.phone}`}</div></div>
                {manager ? (
                  <div className="row wrap" style={{ gap: 6 }}>
                    <select className="input" style={{ width: 'auto', minHeight: 36, padding: '6px 10px' }} value={p.role} onChange={e => update(p.id, { role: e.target.value })}>{Object.entries(ROLES).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select>
                    <select className="input" style={{ width: 'auto', minHeight: 36, padding: '6px 10px' }} value={p.location_id || ''} onChange={e => update(p.id, { location_id: e.target.value })}>{locations.map(l => <option key={l.id} value={l.id}>{l.name}</option>)}</select>
                  </div>
                ) : <div className="row" style={{ gap: 6 }}><span className="pill pink">{ROLES[p.role]}</span><span className="pill">{locName(p.location_id)}</span></div>}
              </div>
              {manager && (
                <div className="row wrap small muted" style={{ gap: 14, marginTop: 8 }}>
                  {need > 0 && <span>SOPs read {Math.min(have, need)}/{need}</span>}
                  {['coach', 'director'].includes(p.role) && modsTotal > 0 && <span>Method {md}/{modsTotal}</span>}
                  <span>{hoursOf(p.id).toFixed(1)} h this {period === 'week' ? 'week' : 'period'}</span>
                  {['coach', 'director'].includes(p.role) && <span>{sessionsOf(p.id).length} sessions</span>}
                </div>
              )}
            </div>
          )
        })}
      </>}

      {tab === 'pay' && manager && <>
        <div className="row between wrap" style={{ marginBottom: 8 }}>
          <div className="row" style={{ gap: 6 }}>{[['week', 'This week'], ['lastweek', 'Last week'], ['month', 'This month'], ['lastmonth', 'Last month']].map(([k, l]) => <button key={k} className={`btn small ${period === k ? '' : 'ghost'}`} onClick={() => setPeriod(k)}>{l}</button>)}</div>
          <button className="btn gold small" onClick={exportCsv}>Export CSV</button>
        </div>
        <div className="card accent"><div className="row between"><span>Total pay this period</span><span className="display" style={{ fontSize: '1.8rem', color: 'var(--gold)' }}>{money(totalPay)}</span></div><p className="small muted">Hours from the clock × hourly rate, plus sessions logged × per-session rate. Set rates per person below.</p></div>
        {people.map(p => {
          const h = hoursOf(p.id), ss = sessionsOf(p.id), entries = time.filter(t => t.user_id === p.id)
          return (
            <div className="card" key={p.id}>
              <div className="row between wrap">
                <div><div style={{ fontWeight: 600 }}>{p.full_name}</div><div className="small muted">{ROLES[p.role]} · {h.toFixed(1)} h · {ss.length} sessions{entries.some(t => !t.clock_out) && <span className="pill good" style={{ marginLeft: 6 }}>on the clock</span>}</div></div>
                <div className="display" style={{ fontSize: '1.5rem', color: 'var(--pink)' }}>{money(payOf(p))}</div>
              </div>
              <div className="row wrap" style={{ gap: 8, marginTop: 8 }}>
                <label className="field" style={{ margin: 0 }}><span>$ / hour</span><input className="input" type="number" style={{ width: 110, minHeight: 36, padding: '6px 10px' }} defaultValue={p.pay_hourly ?? ''} onBlur={e => e.target.value !== String(p.pay_hourly ?? '') && update(p.id, { pay_hourly: e.target.value === '' ? null : Number(e.target.value) })} /></label>
                <label className="field" style={{ margin: 0 }}><span>$ / session</span><input className="input" type="number" style={{ width: 110, minHeight: 36, padding: '6px 10px' }} defaultValue={p.pay_per_session ?? ''} onBlur={e => e.target.value !== String(p.pay_per_session ?? '') && update(p.id, { pay_per_session: e.target.value === '' ? null : Number(e.target.value) })} /></label>
                <button className="btn ghost small" style={{ alignSelf: 'flex-end' }} onClick={() => setOpen(open === p.id ? null : p.id)}>{open === p.id ? 'Hide' : 'Clock-ins'}</button>
              </div>
              {open === p.id && (
                <ul className="list" style={{ marginTop: 8 }}>
                  {entries.map(t => <li key={t.id}><span className="grow small">{new Date(t.clock_in).toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' })} · {fmtTime(t.clock_in)} → {t.clock_out ? fmtTime(t.clock_out) : <span style={{ color: 'var(--good)' }}>now</span>}</span><span className="pill">{hours((t.clock_out ? new Date(t.clock_out) : new Date()) - new Date(t.clock_in))} h</span>{manager && t.clock_out == null && <button className="btn ghost small" onClick={async () => { await supabase.from('time_entries').update({ clock_out: new Date().toISOString() }).eq('id', t.id); load() }}>Clock out</button>}</li>)}
                  {entries.length === 0 && <li className="muted small">No clock-ins this period.</li>}
                  {ss.length > 0 && <li className="small muted">Sessions: {ss.map(s => s.session_date).join(', ')}</li>}
                </ul>
              )}
            </div>
          )
        })}
      </>}

      {tab === 'goals' && manager && <>
        <p className="muted">The daily goals each role sees at the top of Today. Hit = green check.</p>
        <button className="btn small" style={{ marginBottom: 10 }} onClick={() => setGoalForm({ role: 'sales', metric: '', label: '', kind: 'count', goal: 1, stretch: null, step: 1, sort: 10, active: true })}>+ Add goal</button>
        {goalForm && (
          <form className="card accent" onSubmit={saveGoal}>
            <div className="row wrap" style={{ gap: 8 }}>
              <label className="field"><span>Role</span><select className="input" value={goalForm.role} onChange={e => setGoalForm({ ...goalForm, role: e.target.value })}>{Object.keys(ROLES).map(k => <option key={k} value={k}>{ROLES[k]}</option>)}</select></label>
              <label className="field" style={{ flex: 1 }}><span>Label</span><input className="input" value={goalForm.label} onChange={e => setGoalForm({ ...goalForm, label: e.target.value, metric: goalForm.id ? goalForm.metric : e.target.value.toLowerCase().replace(/[^a-z0-9]+/g, '_') })} required /></label>
            </div>
            <div className="row wrap" style={{ gap: 8 }}>
              <label className="field"><span>Type</span><select className="input" value={goalForm.kind} onChange={e => setGoalForm({ ...goalForm, kind: e.target.value })}><option value="count">Number</option><option value="check">Yes / no</option></select></label>
              <label className="field"><span>Goal</span><input className="input" type="number" value={goalForm.goal} onChange={e => setGoalForm({ ...goalForm, goal: Number(e.target.value) })} /></label>
              <label className="field"><span>Stretch</span><input className="input" type="number" value={goalForm.stretch ?? ''} onChange={e => setGoalForm({ ...goalForm, stretch: e.target.value === '' ? null : Number(e.target.value) })} /></label>
              <label className="field"><span>+ button</span><input className="input" type="number" value={goalForm.step} onChange={e => setGoalForm({ ...goalForm, step: Number(e.target.value) || 1 })} /></label>
            </div>
            <div className="row" style={{ gap: 8 }}><button className="btn">Save</button><button type="button" className="btn ghost" onClick={() => setGoalForm(null)}>Cancel</button>{goalForm.id && <button type="button" className="btn danger small" onClick={async () => { await supabase.from('kpi_goals').delete().eq('id', goalForm.id); setGoalForm(null); load() }}>Delete</button>}</div>
          </form>
        )}
        {Object.keys(ROLES).map(r => { const gs = goals.filter(g => g.role === r); if (!gs.length) return null; return (
          <div className="card" key={r}><h3>{ROLES[r]}</h3><ul className="list">{gs.map(g => <li key={g.id}><span className="grow">{g.label} <span className="muted small">· {g.kind === 'check' ? 'yes/no' : `goal ${g.goal}${g.stretch ? ` (stretch ${g.stretch})` : ''}`}{!g.active && ' · off'}</span></span><button className="btn ghost small" onClick={() => setGoalForm(g)}>Edit</button></li>)}</ul></div>
        ) })}
      </>}
    </>
  )
}
