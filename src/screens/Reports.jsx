import { useEffect, useState } from 'react'
import { useAuth } from '../lib/auth.jsx'
import { supabase, isManager } from '../lib/supabase'

export const REPORT_TYPES = {
  shift: { label: 'Shift report', roles: ['frontdesk', 'operator', 'owner'], fields: [
    ['walkins', 'Walk-ins today', 'number'], ['rentals', 'Field rentals / parties hosted', 'number'], ['concession_sales', 'Concession sales ($)', 'number'],
    ['issues', 'Anything broken, missing or unsafe?', 'text'], ['wins', 'One thing that went great', 'text'] ] },
  session: { label: 'Session report', roles: ['coach', 'operator', 'owner'], fields: [
    ['sessions', 'Sessions coached', 'number'], ['athletes', 'Athletes trained', 'number'], ['evals', 'Evaluations run', 'number'],
    ['standouts', 'Athletes who stood out (and why)', 'text'], ['concerns', 'Athletes to watch (effort, attitude, injury)', 'text'] ] },
  sales: { label: 'Daily sales report', roles: ['sales', 'operator', 'owner'], fields: [
    ['leads', 'New leads', 'number'], ['contacted', 'Leads contacted', 'number'], ['evals_booked', 'Evals booked', 'number'], ['evals_showed', 'Evals showed', 'number'],
    ['closed', 'Members closed', 'number'], ['revenue', 'New revenue signed ($)', 'number'], ['objections', 'Objections heard today', 'text'] ] },
  incident: { label: 'Incident report', roles: ['*'], fields: [
    ['what', 'What happened', 'text'], ['who', 'Who was involved', 'text'], ['action', 'What was done', 'text'], ['followup', 'Needs follow-up from the Operator?', 'text'] ] },
}

export default function Reports() {
  const { user, role, locationId } = useAuth()
  const [kind, setKind] = useState(null)
  const [data, setData] = useState({})
  const [mine, setMine] = useState([])
  const [msg, setMsg] = useState('')

  const available = Object.entries(REPORT_TYPES).filter(([, t]) => t.roles.includes('*') || t.roles.includes(role) || isManager(role))
  async function load() {
    const { data } = await supabase.from('reports').select('*').eq('user_id', user.id).order('created_at', { ascending: false }).limit(10)
    setMine(data || [])
  }
  useEffect(() => { load() }, [])

  async function submit(e) {
    e.preventDefault()
    const { error } = await supabase.from('reports').insert({ location_id: locationId, user_id: user.id, kind, data })
    if (error) return setMsg(error.message)
    setMsg('Filed. It\'s on the dashboard now.'); setKind(null); setData({}); load()
  }

  return (
    <>
      <h1>Reports</h1>
      <p className="muted">Two minutes, from your phone. It lands on the CEO dashboard the moment you hit file.</p>
      {msg && <div className="card accent">{msg}</div>}
      {!kind ? (
        <div className="grid">
          {available.map(([k, t]) => <button key={k} className="stat" style={{ textAlign: 'left', cursor: 'pointer', color: 'inherit' }} onClick={() => { setKind(k); setMsg('') }}><div className="label">File</div><div className="display" style={{ fontSize: '1.4rem' }}>{t.label}</div></button>)}
        </div>
      ) : (
        <form className="card" onSubmit={submit}>
          <div className="row between"><h2>{REPORT_TYPES[kind].label}</h2><button type="button" className="btn ghost small" onClick={() => setKind(null)}>Cancel</button></div>
          {REPORT_TYPES[kind].fields.map(([key, label, type]) => (
            <label className="field" key={key}><span>{label}</span>
              {type === 'text'
                ? <textarea className="input" value={data[key] || ''} onChange={e => setData({ ...data, [key]: e.target.value })} />
                : <input className="input" type="number" inputMode="decimal" value={data[key] ?? ''} onChange={e => setData({ ...data, [key]: e.target.value === '' ? '' : Number(e.target.value) })} />}
            </label>
          ))}
          <button className="btn block">File report</button>
        </form>
      )}
      {mine.length > 0 && (
        <div className="card">
          <h2>Your recent reports</h2>
          <ul className="list">{mine.map(r => <li key={r.id}><span className="pill gold">{REPORT_TYPES[r.kind]?.label || r.kind}</span><span className="grow small muted">{new Date(r.created_at).toLocaleString()}</span></li>)}</ul>
        </div>
      )}
    </>
  )
}
