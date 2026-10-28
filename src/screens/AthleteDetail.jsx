import { useEffect, useState } from 'react'
import { Link, useParams, useNavigate } from 'react-router-dom'
import { useAuth } from '../lib/auth.jsx'
import { supabase, isCoach, isDirector, fmtDate, PROGRAMS } from '../lib/supabase'
import { initials } from './Athletes.jsx'

export const tenure = (joined) => {
  if (!joined) return '—'
  const months = Math.max(0, Math.round((Date.now() - new Date(joined + 'T12:00:00')) / (30.44 * 864e5)))
  return months < 1 ? 'New' : months < 12 ? `${months} mo` : `${(months / 12).toFixed(1).replace('.0', '')} yr`
}
export const avg = (rows, k) => { const v = rows.map(r => r[k]).filter(x => x != null); return v.length ? (v.reduce((a, b) => a + b, 0) / v.length).toFixed(1) : '—' }

export default function AthleteDetail() {
  const { id } = useParams()
  const nav = useNavigate()
  const { roles: role, user, locationId } = useAuth()
  const [a, setA] = useState(null)
  const [log, setLog] = useState([])
  const [reports, setReports] = useState([])
  const [edit, setEdit] = useState(false)
  const [form, setForm] = useState({})

  async function load() {
    const { data } = await supabase.from('athletes').select('*').eq('id', id).single()
    setA(data); setForm(data || {})
    const { data: sa } = await supabase.from('session_athletes').select('*, sessions(session_date, start_time, session_type, coaches, focus, worked_on, coach_id, profiles!coach_id(full_name))').eq('athlete_id', id)
    setLog((sa || []).filter(x => x.sessions).sort((x, y) => (y.sessions.session_date + (y.sessions.start_time || '')).localeCompare(x.sessions.session_date + (x.sessions.start_time || ''))))
    const { data: r } = await supabase.from('player_reports').select('id, report_date, status, confidence, technical, effort, profiles!author_id(full_name)').eq('athlete_id', id).order('report_date', { ascending: false })
    setReports(r || [])
  }
  useEffect(() => { load() }, [id])

  async function save(e) {
    e.preventDefault()
    const { id: _id, created_at, created_by, ...rest } = form
    const { error } = await supabase.from('athletes').update({ ...rest, age: rest.age === '' ? null : rest.age, frequency: rest.frequency === '' ? null : rest.frequency, joined_on: rest.joined_on || null }).eq('id', id)
    if (error) return alert(error.message); setEdit(false); load()
  }
  async function newReport() {
    const last = log[0]
    const { data, error } = await supabase.from('player_reports').insert({
      athlete_id: id, location_id: a.location_id || locationId, author_id: user.id,
      confidence: last?.confidence || null, technical: last?.technical || null, effort: last?.effort || null,
      focus: last?.sessions?.focus || [], training_type: (a.program || '').toUpperCase(),
    }).select().single()
    if (error) return alert(error.message)
    nav(`/athletes/${id}/report/${data.id}`)
  }

  if (!a) return <p className="muted">Loading…</p>
  const present = log.filter(l => l.present !== false)
  const last5 = present.slice(0, 5)
  const latest = present[0]

  return (
    <>
      <Link to="/athletes" className="small">← Athletes</Link>
      <div className="row" style={{ gap: 12, margin: '8px 0' }}>
        <div className="avatar" style={{ width: 56, height: 56, fontSize: '1.5rem' }}>{initials(a.full_name)}</div>
        <div><h1 style={{ fontSize: '2rem' }}>{a.full_name}</h1><div className="small muted">{[a.age && `Age ${a.age}`, a.position, a.club].filter(Boolean).join(' · ')}</div></div>
      </div>

      <div className="snap" style={{ marginBottom: 12 }}>
        <div className="card"><div className="l">Tenure</div><div className="v">{tenure(a.joined_on)}</div><div className="s">{present.length} sessions{a.joined_on ? ` · joined ${fmtDate(a.joined_on)}` : ''}</div></div>
        <div className="card"><div className="l">Program</div><div className="v">{a.frequency ? `${a.frequency}×/wk` : '—'}</div><div className="s">{a.program || '—'}</div></div>
        <div className="card"><div className="l">Position</div><div className="v">{a.position_short || '—'}</div><div className="s">{a.position || '—'}</div></div>
      </div>

      <div className="card">
        <div className="row between"><h2>Latest scores</h2>{latest && <span className="small muted">{fmtDate(latest.sessions.session_date)}</span>}</div>
        <div className="scores3">
          {[['Confidence', 'confidence'], ['Technical', 'technical'], ['Effort', 'effort']].map(([l, k]) => (
            <div className="scorebox" key={k}><div className="l">{l}</div><div className="v">{latest?.[k] ?? '_'}<small>/10</small></div><div className="small muted trend">avg {avg(last5, k)} (last 5)</div></div>
          ))}
        </div>
        {latest && (latest.improvements || latest.weaknesses) && (
          <div className="dual" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginTop: 10 }}>
            <div><div className="small" style={{ color: 'var(--good)' }}>IMPROVED</div><div className="small">{latest.improvements || '—'}</div></div>
            <div><div className="small" style={{ color: 'var(--pink)' }}>WORK ON</div><div className="small">{latest.weaknesses || '—'}</div></div>
          </div>
        )}
      </div>

      {isCoach(role) && (
        <div className="row" style={{ gap: 8, marginBottom: 12 }}>
          <Link to={`/sessions/new?athlete=${id}`} className="btn small">+ Log session</Link>
          <button className="btn gold small" onClick={newReport}>+ Player report</button>
          <button className="btn ghost small" onClick={() => setEdit(!edit)}>Edit profile</button>
        </div>
      )}

      {edit && (
        <form className="card accent" onSubmit={save}>
          <h2>Edit profile</h2>
          {[['full_name', 'Full name'], ['age', 'Age'], ['position', 'Position'], ['position_short', 'Short position'], ['frequency', '× / week'], ['joined_on', 'Joined (date)'], ['club', 'Club'], ['dominant_foot', 'Dominant foot'], ['parent_name', 'Parent name'], ['parent_phone', 'Parent phone'], ['parent_email', 'Parent email'], ['notes', 'Notes']].map(([k, l]) => (
            <label className="field" key={k}><span>{l}</span>
              {k === 'notes' ? <textarea className="input" value={form[k] || ''} onChange={e => setForm({ ...form, [k]: e.target.value })} />
                : <input className="input" type={k === 'joined_on' ? 'date' : (k === 'age' || k === 'frequency') ? 'number' : 'text'} value={form[k] ?? ''} onChange={e => setForm({ ...form, [k]: e.target.value })} />}
            </label>
          ))}
          <label className="field"><span>Program</span><select className="input" value={form.program || ''} onChange={e => setForm({ ...form, program: e.target.value })}>{PROGRAMS.map(p => <option key={p}>{p}</option>)}</select></label>
          <div className="row" style={{ gap: 8 }}><button className="btn">Save</button><button type="button" className="btn ghost" onClick={() => setEdit(false)}>Cancel</button>
            {isDirector(role) && <button type="button" className="btn danger small" onClick={async () => { if (confirm('Archive this athlete?')) { await supabase.from('athletes').update({ active: false }).eq('id', id); nav('/athletes') } }}>Archive</button>}</div>
        </form>
      )}

      <div className="card">
        <h2>Player reports</h2>
        {reports.length === 0 ? <p className="muted">No reports yet.</p> : (
          <ul className="list">{reports.map(r => <li key={r.id}><span className={`pill ${r.status === 'approved' ? 'good' : r.status === 'submitted' ? 'gold' : ''}`}>{r.status}</span><span className="grow"><div>{fmtDate(r.report_date)} <span className="muted small">· {r.profiles?.full_name}</span></div><div className="small muted">CONF {r.confidence ?? '_'} · TECH {r.technical ?? '_'} · EFF {r.effort ?? '_'}</div></span><Link className="btn ghost small" to={`/athletes/${id}/report/${r.id}`}>Open</Link></li>)}</ul>
        )}
      </div>

      <div className="card">
        <h2>Session log</h2>
        {log.length === 0 ? <p className="muted">No sessions logged yet.</p> : (
          <ul className="list">
            {log.map(l => (
              <li key={l.id}><span className="grow">
                <div className="row between"><span style={{ fontWeight: 500 }}>{fmtDate(l.sessions.session_date)} {l.sessions.start_time ? '· ' + l.sessions.start_time.slice(0, 5) : ''} {l.present === false && <span className="pill">absent</span>}</span><span className="pill pink">{l.confidence ?? '_'} · {l.technical ?? '_'} · {l.effort ?? '_'}</span></div>
                <div className="small muted">{l.sessions.coaches || l.sessions.profiles?.full_name} · {l.sessions.session_type}{l.sessions.focus?.length ? ' · ' + l.sessions.focus.join(', ') : ''}</div>
                {l.improvements && <div className="small"><span style={{ color: 'var(--good)' }}>↑</span> {l.improvements}</div>}
                {l.weaknesses && <div className="small"><span style={{ color: 'var(--pink)' }}>→</span> {l.weaknesses}</div>}
              </span></li>
            ))}
          </ul>
        )}
      </div>

      {(a.parent_name || a.parent_phone) && <div className="card"><h3>Parent</h3><p className="small">{a.parent_name} {a.parent_phone && <>· <a href={`tel:${a.parent_phone}`}>{a.parent_phone}</a></>} {a.parent_email && <>· {a.parent_email}</>}</p></div>}
      {a.notes && <div className="card"><h3>Notes</h3><p className="small" style={{ whiteSpace: 'pre-wrap' }}>{a.notes}</p></div>}
    </>
  )
}
