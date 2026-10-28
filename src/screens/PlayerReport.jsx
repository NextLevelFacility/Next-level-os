import { useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { useAuth } from '../lib/auth.jsx'
import { supabase, isCoach, isDirector, FOCUS_AREAS, fmtDate } from '../lib/supabase'
import { tenure } from './AthleteDetail.jsx'

// The Player Development Report — the exact format Simon uses (Jair Gonzalez format):
// header + meta strip, Athlete Snapshot, Latest Evaluation (CONF/TECH/EFF, focus pills, Strengths / Areas to Develop),
// Reading the Numbers, Projected Development Arc, Session Log, Recommended Next Steps.
const STEPS = [['sc', 'Strength & conditioning'], ['programming', 'Programming'], ['position', 'Position-specific module'], ['reeval', 'Re-evaluation'], ['mentality', 'Mentality / Confidence']]
const ARC = [['m3', '3 MO'], ['m6', '6 MO'], ['y1', '1 YR']]

export default function PlayerReport() {
  const { id, reportId } = useParams()
  const { user, role } = useAuth()
  const [a, setA] = useState(null)
  const [r, setR] = useState(null)
  const [log, setLog] = useState([])
  const [mode, setMode] = useState('edit')
  const [saving, setSaving] = useState(false)
  const [people, setPeople] = useState({})

  async function load() {
    const { data: ath } = await supabase.from('athletes').select('*').eq('id', id).single(); setA(ath)
    const { data: rep } = await supabase.from('player_reports').select('*').eq('id', reportId).single(); setR(rep)
    const { data: sa } = await supabase.from('session_athletes').select('confidence, technical, effort, sessions(session_date, coaches, focus, session_type, profiles!coach_id(full_name))').eq('athlete_id', id)
    setLog((sa || []).filter(x => x.sessions).sort((x, y) => y.sessions.session_date.localeCompare(x.sessions.session_date)))
    const { data: p } = await supabase.from('profiles').select('id, full_name'); setPeople(Object.fromEntries((p || []).map(x => [x.id, x.full_name])))
    if (rep && (rep.status === 'approved' || !isCoach(role))) setMode('view')
  }
  useEffect(() => { load() }, [id, reportId])

  const canEdit = r && isCoach(role) && (r.author_id === user.id || isDirector(role)) && r.status !== 'approved'
  const set = patch => setR({ ...r, ...patch })
  async function save(extra = {}) {
    setSaving(true)
    const { id: _i, created_at, ...rest } = { ...r, ...extra, updated_at: new Date().toISOString() }
    const { error } = await supabase.from('player_reports').update(rest).eq('id', reportId)
    setSaving(false)
    if (error) return alert(error.message)
    setR({ ...r, ...extra })
  }
  const toggleFocus = f => set({ focus: (r.focus || []).includes(f) ? r.focus.filter(x => x !== f) : [...(r.focus || []), f] })

  if (!a || !r) return <p className="muted">Loading…</p>
  const sessionsCount = log.length
  const joined = a.joined_on ? new Date(a.joined_on + 'T12:00:00') : null
  const joinedLabel = joined ? joined.toLocaleDateString(undefined, { month: 'short', year: 'numeric' }).toUpperCase().replace(' ', ' · ') : '___ · ____'
  const statusPill = <span className={`pill ${r.status === 'approved' ? 'good' : r.status === 'submitted' ? 'gold' : r.status === 'flagged' ? 'pink' : ''}`}>{r.status}</span>

  return (
    <>
      <div className="row between no-print" style={{ marginBottom: 8 }}>
        <Link to={`/athletes/${id}`} className="small">← {a.full_name}</Link>
        <div className="row" style={{ gap: 6 }}>
          {statusPill}
          {canEdit && <button className={`btn small ${mode === 'edit' ? '' : 'ghost'}`} onClick={() => setMode('edit')}>Edit</button>}
          <button className={`btn small ${mode === 'view' ? '' : 'ghost'}`} onClick={() => setMode('view')}>Preview</button>
          <button className="btn gold small" onClick={() => { setMode('view'); setTimeout(() => window.print(), 300) }}>Print / PDF</button>
        </div>
      </div>

      {mode === 'edit' && canEdit ? (
        <>
          <div className="card">
            <h2>Latest evaluation</h2>
            <div className="row" style={{ gap: 8 }}>
              <label className="field" style={{ flex: 1 }}><span>Report date</span><input className="input" type="date" value={r.report_date || ''} onChange={e => set({ report_date: e.target.value })} /></label>
              <label className="field" style={{ flex: 2 }}><span>Training type</span><input className="input" value={r.training_type || ''} onChange={e => set({ training_type: e.target.value.toUpperCase() })} placeholder="SUMMER BLUEPRINT X TRAINING" /></label>
            </div>
            <label className="field"><span>Coaches</span><input className="input" value={r.coaches_line || ''} onChange={e => set({ coaches_line: e.target.value.toUpperCase() })} placeholder="LUCAS · SIMON · FELIPE · JOHN" /></label>
            {[['Confidence', 'confidence'], ['Technical', 'technical'], ['Effort', 'effort']].map(([l, k]) => (
              <div key={k} style={{ marginTop: 8 }}>
                <div className="row between"><span className="small" style={{ color: 'var(--gold)', textTransform: 'uppercase', letterSpacing: '0.08em' }}>{l}</span><span className="display" style={{ color: 'var(--pink)', fontSize: '1.3rem' }}>{r[k] || '_'}/10</span></div>
                <div className="scorepick">{[1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map(n => <button key={n} type="button" className={r[k] === n ? 'on' : ''} onClick={() => set({ [k]: n })}>{n}</button>)}</div>
              </div>
            ))}
            <label className="field" style={{ marginTop: 12 }}><span>Focus areas worked</span><div className="chips">{FOCUS_AREAS.map(f => <button key={f} type="button" className={`chip ${(r.focus || []).includes(f) ? 'on' : ''}`} onClick={() => toggleFocus(f)}>{f}</button>)}</div></label>
            <label className="field"><span style={{ color: 'var(--good)' }}>Strengths</span><textarea className="input" value={r.strengths || ''} onChange={e => set({ strengths: e.target.value })} placeholder="What's working — technical traits, mentality, growth markers…" /></label>
            <label className="field"><span style={{ color: 'var(--pink)' }}>Areas to develop</span><textarea className="input" value={r.develop || ''} onChange={e => set({ develop: e.target.value })} placeholder="Priority gaps — physical, technical, cognitive, character…" /></label>
          </div>

          <div className="card">
            <h2>Reading the numbers</h2>
            <textarea className="input" value={r.reading || ''} onChange={e => set({ reading: e.target.value })} placeholder="What the CONF / TECH / EFF split is telling us, the priority gap, and what to close first." />
          </div>

          <div className="card">
            <h2>Projected development arc</h2>
            <p className="small muted">Based on current training cadence.</p>
            {ARC.map(([k, l]) => (
              <div key={k} className="row" style={{ gap: 8, alignItems: 'flex-start', marginBottom: 8 }}>
                <span className="display" style={{ color: 'var(--pink)', width: 48, paddingTop: 10 }}>{l}</span>
                <input className="input" style={{ width: 130 }} value={r.arc?.[k]?.date || ''} onChange={e => set({ arc: { ...r.arc, [k]: { ...(r.arc?.[k] || {}), date: e.target.value } } })} placeholder="JAN · 2027" />
                <textarea className="input" style={{ minHeight: 60, flex: 1 }} value={r.arc?.[k]?.desc || ''} onChange={e => set({ arc: { ...r.arc, [k]: { ...(r.arc?.[k] || {}), desc: e.target.value } } })} placeholder={k === 'm3' ? 'Technical / physical / cognitive marker we expect to hit.' : k === 'm6' ? 'Deeper integration, game-realistic demands.' : 'Long-horizon placement or competitive level.'} />
              </div>
            ))}
          </div>

          <div className="card">
            <h2>Recommended next steps</h2>
            {STEPS.map(([k, l]) => <label className="field" key={k}><span>{l}</span><textarea className="input" style={{ minHeight: 56 }} value={r.next_steps?.[k] || ''} onChange={e => set({ next_steps: { ...r.next_steps, [k]: e.target.value } })} /></label>)}
          </div>

          <div className="card accent no-print">
            <div className="row" style={{ gap: 8, flexWrap: 'wrap' }}>
              <button className="btn" onClick={() => save()} disabled={saving}>{saving ? 'Saving…' : 'Save draft'}</button>
              {r.status !== 'submitted' && <button className="btn gold" onClick={() => save({ status: 'submitted' })}>Submit to Director</button>}
              {isDirector(role) && <button className="btn good" onClick={() => save({ status: 'approved', approved_by: user.id, approved_at: new Date().toISOString() })}>Approve & lock</button>}
              {isDirector(role) && r.status === 'submitted' && <button className="btn danger" onClick={() => { const n = prompt('What needs to change?'); if (n != null) save({ status: 'flagged', director_notes: n }) }}>Send back</button>}
            </div>
            {r.director_notes && <p className="small flag" style={{ marginTop: 8 }}>Director: {r.director_notes}</p>}
          </div>
        </>
      ) : (
        <div className="pdr">
          <div className="head">
            <div className="top">NEXT LEVEL · <b>PERFORMANCE FACILITY</b> &nbsp;—&nbsp; PLAYER DEVELOPMENT REPORT</div>
            <div className="name">{a.full_name.toUpperCase()}</div>
            <div className="meta">AGE {a.age ?? '__'}<span className="sep">/</span>{(a.position || 'POSITION').toUpperCase()}<span className="sep">/</span>{(a.program || 'PROGRAM').toUpperCase()}{a.frequency ? ` — ${a.frequency}× / WEEK` : ''}<span className="sep">/</span>JOINED {joinedLabel}</div>
            <div className="tag">DISCIPLINE OVER EVERYTHING.</div>
          </div>
          <section>
            <h2>ATHLETE SNAPSHOT</h2>
            <div className="snap">
              <div className="card"><div className="l">Tenure</div><div className="v">{tenure(a.joined_on)}</div><div className="s">{sessionsCount} sessions logged</div></div>
              <div className="card"><div className="l">Program</div><div className="v">{a.frequency ? `${a.frequency}×/wk` : '—'}</div><div className="s">{a.program || '—'}</div></div>
              <div className="card"><div className="l">Position</div><div className="v">{a.position_short || '—'}</div><div className="s">{a.position || '—'}</div></div>
            </div>
          </section>
          <section>
            <h2>LATEST EVALUATION</h2>
            <div className="coaches">COACHES {r.coaches_line || '___ · ___ · ___'} — {r.training_type || 'TRAINING TYPE'} · {fmtDate(r.report_date).toUpperCase()}</div>
            <div className="scores3">
              {[['CONFIDENCE', 'confidence'], ['TECHNICAL', 'technical'], ['EFFORT', 'effort']].map(([l, k]) => <div className="scorebox" key={k}><div className="l">{l}</div><div className="v">{r[k] ?? '_'}<small>/10</small></div></div>)}
            </div>
            <div className="small" style={{ fontFamily: 'var(--display)', letterSpacing: '0.1em', color: '#555', marginTop: 12 }}>FOCUS AREAS WORKED</div>
            <div className="pills">{FOCUS_AREAS.map(f => <span key={f} className={(r.focus || []).includes(f) ? 'on' : ''}>{f}</span>)}</div>
            <div className="dual">
              <div className="box"><div className="bl">STRENGTHS</div>{r.strengths || ' '}</div>
              <div className="box dev"><div className="bl">AREAS TO DEVELOP</div>{r.develop || ' '}</div>
            </div>
          </section>
          <section>
            <h2>READING THE NUMBERS</h2>
            <div className="reading">{r.reading || '—'}</div>
            <div className="sig">— NEXT LEVEL COACHING STAFF</div>
          </section>
          <section>
            <h2>PROJECTED DEVELOPMENT ARC</h2>
            <div className="small" style={{ fontFamily: 'var(--display)', letterSpacing: '0.1em', color: '#777', marginBottom: 6 }}>BASED ON CURRENT TRAINING CADENCE</div>
            {ARC.map(([k, l]) => <div className="arc" key={k}><div className="st">{l}</div><div className="dt">{r.arc?.[k]?.date || '__ · ____'}</div><div>{r.arc?.[k]?.desc || ''}</div></div>)}
          </section>
          <section>
            <h2>SESSION LOG</h2>
            <table><thead><tr><th>DATE</th><th>COACH</th><th>FOCUS</th><th>CONF · TECH · EFF</th></tr></thead>
              <tbody>{log.slice(0, 8).map((l, i) => <tr key={i}><td>{fmtDate(l.sessions.session_date)}</td><td>{l.sessions.coaches || l.sessions.profiles?.full_name || ''}</td><td>{(l.sessions.focus || []).slice(0, 3).join(', ') || l.sessions.session_type || ''}</td><td>{l.confidence ?? '_'} · {l.technical ?? '_'} · {l.effort ?? '_'}</td></tr>)}
                {log.length === 0 && <tr><td colSpan="4" style={{ color: '#888' }}>No sessions logged yet.</td></tr>}</tbody></table>
          </section>
          <section>
            <h2>RECOMMENDED NEXT STEPS</h2>
            {STEPS.map(([k, l]) => <p className="step" key={k}><b>{l.toUpperCase()}:</b> {r.next_steps?.[k] || ''}</p>)}
            {r.status === 'approved' && <p className="small" style={{ color: '#777', marginTop: 10 }}>Approved by {people[r.approved_by] || 'Director'} · {fmtDate(r.approved_at?.slice(0, 10))}</p>}
          </section>
          <div className="foot">NEXT LEVEL PERFORMANCE FACILITY · 13450 SW 129TH ST, MIAMI FL 33186 · @NEXTLEVELFACILITY</div>
        </div>
      )}
    </>
  )
}
