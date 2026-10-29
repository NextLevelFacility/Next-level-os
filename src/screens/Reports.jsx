import { useEffect, useState } from 'react'
import { useAuth } from '../lib/auth.jsx'
import { supabase, isManager, today } from '../lib/supabase'

// The only report staff file: an injury report. Everything else (sales, sessions, shifts) is logged where it happens.
export const REPORT_TYPES = {
  injury: { label: 'Injury report', roles: ['*'] },
}
export const SEVERITY = ['Minor — treated on site, kept training', 'Moderate — stopped training, parent collected', 'Serious — medical attention / 911']
const FIELDS = [
  ['athlete', 'Athlete / person injured', 'text'],
  ['when', 'Date and time', 'datetime'],
  ['where', 'Where in the facility', 'short'],
  ['activity', 'What they were doing (session, rental, party, open play)', 'short'],
  ['what', 'What happened', 'text'],
  ['injury', 'Injury (body part, what you saw)', 'short'],
  ['severity', 'Severity', 'select'],
  ['action', 'First aid / action taken', 'text'],
  ['notified', 'Parent or guardian notified? (who, when, how)', 'short'],
  ['witnesses', 'Witnesses / staff present', 'short'],
  ['followup', 'Follow-up needed (call, incident form, equipment fix)', 'short'],
]

export default function Reports() {
  const { user, roles, locationId, profile } = useAuth()
  const [open, setOpen] = useState(false)
  const [data, setData] = useState({})
  const [mine, setMine] = useState([])
  const [msg, setMsg] = useState('')

  async function load() {
    const q = supabase.from('reports').select('*, profiles(full_name)').eq('kind', 'injury').order('created_at', { ascending: false }).limit(20)
    const { data } = isManager(roles) ? await q : await q.eq('user_id', user.id)
    setMine(data || [])
  }
  useEffect(() => { load() }, [])

  async function submit(e) {
    e.preventDefault()
    const { error } = await supabase.from('reports').insert({ location_id: locationId, user_id: user.id, kind: 'injury', data: { ...data, filed_by: profile.full_name } })
    if (error) return setMsg(error.message)
    setMsg('Filed. The Owner and Operator can see it now.'); setOpen(false); setData({}); load()
  }

  return (
    <>
      <h1>Injury report</h1>
      <p className="muted">File one for any injury, however small, before the end of your shift. Facts only — what you saw and what you did.</p>
      {msg && <div className="card accent">{msg}</div>}
      {!open ? (
        <button className="btn" onClick={() => { setOpen(true); setMsg(''); setData({ when: new Date(Date.now() - new Date().getTimezoneOffset() * 60000).toISOString().slice(0, 16) }) }}>File an injury report</button>
      ) : (
        <form className="card" onSubmit={submit}>
          <div className="row between"><h2 style={{ margin: 0 }}>New injury report</h2><button type="button" className="btn ghost small" onClick={() => setOpen(false)}>Cancel</button></div>
          <div style={{ height: 10 }} />
          {FIELDS.map(([key, label, type]) => (
            <label className="field" key={key}><span>{label}</span>
              {type === 'text' ? <textarea className="input" value={data[key] || ''} onChange={e => setData({ ...data, [key]: e.target.value })} required={key === 'what'} />
                : type === 'select' ? <select className="input" value={data[key] || ''} onChange={e => setData({ ...data, [key]: e.target.value })} required><option value="">Choose…</option>{SEVERITY.map(s => <option key={s}>{s}</option>)}</select>
                : type === 'datetime' ? <input className="input" type="datetime-local" value={data[key] || ''} onChange={e => setData({ ...data, [key]: e.target.value })} required />
                : <input className="input" value={data[key] || ''} onChange={e => setData({ ...data, [key]: e.target.value })} required={key === 'athlete'} />}
            </label>
          ))}
          <button className="btn block">File report</button>
        </form>
      )}
      {mine.length > 0 && (
        <div className="card">
          <h2>{isManager(roles) ? 'Injury reports' : 'Your reports'}</h2>
          <ul className="list">
            {mine.map(r => (
              <li key={r.id} style={{ alignItems: 'flex-start' }}>
                <span className={`pill ${/Serious/.test(r.data?.severity || '') ? 'bad' : /Moderate/.test(r.data?.severity || '') ? 'gold' : ''}`}>{(r.data?.severity || 'Injury').split(' ')[0]}</span>
                <span className="grow">
                  <div style={{ fontWeight: 500 }}>{r.data?.athlete || 'Unnamed'} <span className="muted small">· {r.data?.injury || ''}</span></div>
                  <div className="small muted">{r.data?.what}</div>
                  <div className="small muted">{r.profiles?.full_name || r.data?.filed_by} · {r.data?.when ? new Date(r.data.when).toLocaleString() : new Date(r.created_at).toLocaleString()}{r.data?.followup ? ` · follow-up: ${r.data.followup}` : ''}</div>
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </>
  )
}
