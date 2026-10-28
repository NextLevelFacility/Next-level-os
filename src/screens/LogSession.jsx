import { useEffect, useState } from 'react'
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { useAuth } from '../lib/auth.jsx'
import { supabase, isCoach, isDirector, FOCUS_AREAS, SESSION_TYPES, today } from '../lib/supabase'
import { initials } from './Athletes.jsx'

const nowTime = () => { const d = new Date(); return `${String(d.getHours()).padStart(2, '0')}:${String(Math.floor(d.getMinutes() / 15) * 15).padStart(2, '0')}` }

export default function LogSession() {
  const { id } = useParams()
  const [params] = useSearchParams()
  const nav = useNavigate()
  const { user, roles: role, locationId, profile } = useAuth()
  const editing = Boolean(id)
  const [roster, setRoster] = useState([])
  const [coaches, setCoaches] = useState([])
  const [q, setQ] = useState('')
  const [s, setS] = useState({ session_date: today(), start_time: nowTime(), duration_min: 60, session_type: SESSION_TYPES[0], coaches: '', focus: [], worked_on: '', notes: '' })
  const [players, setPlayers] = useState({})   // athlete_id -> {present, confidence, technical, effort, improvements, weaknesses}
  const [step, setStep] = useState(1)
  const [saving, setSaving] = useState(false)
  const [quickAdd, setQuickAdd] = useState('')
  const [locked, setLocked] = useState(false)

  useEffect(() => {
    (async () => {
      const { data: a } = await supabase.from('athletes').select('id, full_name, position_short, program').eq('active', true).order('full_name')
      setRoster(a || [])
      const { data: c } = await supabase.from('profiles').select('id, full_name, role').in('role', ['coach', 'director', 'owner', 'operator']).order('full_name')
      setCoaches(c || [])
      if (editing) {
        const { data: ses } = await supabase.from('sessions').select('*').eq('id', id).single()
        if (ses) {
          setS({ ...ses, start_time: ses.start_time ? ses.start_time.slice(0, 5) : '', focus: ses.focus || [] })
          setLocked(!(ses.coach_id === user.id || isDirector(role)))
          const { data: sa } = await supabase.from('session_athletes').select('*').eq('session_id', id)
          setPlayers(Object.fromEntries((sa || []).map(x => [x.athlete_id, x])))
          setStep(3)
        }
      } else {
        setS(v => ({ ...v, coaches: profile.full_name || '' }))
        const pre = params.get('athlete')
        if (pre) setPlayers({ [pre]: { present: true } })
      }
    })()
  }, [id])

  const toggleFocus = f => setS({ ...s, focus: s.focus.includes(f) ? s.focus.filter(x => x !== f) : [...s.focus, f] })
  const togglePlayer = aid => setPlayers(p => { const n = { ...p }; if (n[aid]) delete n[aid]; else n[aid] = { present: true }; return n })
  const setP = (aid, patch) => setPlayers(p => ({ ...p, [aid]: { ...p[aid], ...patch } }))
  const selected = roster.filter(a => players[a.id])

  async function addAthleteInline() {
    const name = quickAdd.trim(); if (!name) return
    const { data, error } = await supabase.from('athletes').insert({ full_name: name, location_id: locationId, created_by: user.id }).select().single()
    if (error) return alert(error.message)
    setRoster([...roster, data].sort((a, b) => a.full_name.localeCompare(b.full_name))); togglePlayer(data.id); setQuickAdd('')
  }

  async function save() {
    if (selected.length === 0) return alert('Pick at least one player.')
    setSaving(true)
    const payload = { location_id: locationId, coach_id: editing ? s.coach_id || user.id : user.id, coaches: s.coaches, session_date: s.session_date, start_time: s.start_time || null, duration_min: Number(s.duration_min) || null, session_type: s.session_type, focus: s.focus, worked_on: s.worked_on, notes: s.notes }
    let sid = id
    if (editing) { const { error } = await supabase.from('sessions').update(payload).eq('id', id); if (error) { setSaving(false); return alert(error.message) } }
    else { const { data, error } = await supabase.from('sessions').insert(payload).select().single(); if (error) { setSaving(false); return alert(error.message) }; sid = data.id }
    const rows = selected.map(a => { const p = players[a.id]; return { session_id: sid, athlete_id: a.id, present: p.present !== false, confidence: p.confidence || null, technical: p.technical || null, effort: p.effort || null, improvements: p.improvements || null, weaknesses: p.weaknesses || null } })
    if (editing) await supabase.from('session_athletes').delete().eq('session_id', sid)
    const { error: e2 } = await supabase.from('session_athletes').insert(rows)
    setSaving(false)
    if (e2) return alert(e2.message)
    // bump the coach's "sessions logged" goal for the day
    if (!editing) {
      const { data: k } = await supabase.from('kpi_days').select('data').eq('user_id', user.id).eq('kpi_date', today()).maybeSingle()
      const d = { ...(k?.data || {}) }; d.sessions = (Number(d.sessions) || 0) + 1
      await supabase.from('kpi_days').upsert({ user_id: user.id, location_id: locationId, kpi_date: today(), data: d }, { onConflict: 'user_id,kpi_date' })
    }
    nav(selected.length === 1 ? `/athletes/${selected[0].id}` : '/athletes')
  }

  if (!isCoach(role)) return <p className="muted">Coaches only.</p>
  const ql = q.toLowerCase()

  return (
    <>
      <Link to="/athletes" className="small">← Athletes</Link>
      <h1>{editing ? 'Session' : 'Log a session'}</h1>
      <div className="row" style={{ gap: 6, marginBottom: 12 }}>
        {[['1', 'When & what'], ['2', 'Players'], ['3', 'Each player']].map(([n, l]) => <button key={n} className={`btn small ${step === Number(n) ? '' : 'ghost'}`} onClick={() => setStep(Number(n))}>{n}. {l}</button>)}
      </div>

      {step === 1 && (
        <div className="card">
          <div className="row" style={{ gap: 8 }}>
            <label className="field" style={{ flex: 1 }}><span>Date</span><input className="input" type="date" value={s.session_date} onChange={e => setS({ ...s, session_date: e.target.value })} disabled={locked} /></label>
            <label className="field" style={{ flex: 1 }}><span>Start</span><input className="input" type="time" value={s.start_time} onChange={e => setS({ ...s, start_time: e.target.value })} disabled={locked} /></label>
            <label className="field" style={{ flex: 1 }}><span>Minutes</span><input className="input" type="number" inputMode="numeric" value={s.duration_min} onChange={e => setS({ ...s, duration_min: e.target.value })} disabled={locked} /></label>
          </div>
          <label className="field"><span>Session type</span><select className="input" value={s.session_type || ''} onChange={e => setS({ ...s, session_type: e.target.value })} disabled={locked}>{SESSION_TYPES.map(t => <option key={t}>{t}</option>)}</select></label>
          <label className="field"><span>Coaches on this session</span>
            <div className="chips" style={{ marginBottom: 6 }}>{coaches.map(c => { const on = (s.coaches || '').split(' · ').includes(c.full_name); return <button key={c.id} type="button" className={`chip gold ${on ? 'on' : ''}`} onClick={() => { const list = (s.coaches || '').split(' · ').filter(Boolean); setS({ ...s, coaches: (on ? list.filter(x => x !== c.full_name) : [...list, c.full_name]).join(' · ') }) }} disabled={locked}>{c.full_name}</button> })}</div>
            <input className="input" value={s.coaches || ''} onChange={e => setS({ ...s, coaches: e.target.value })} placeholder="Lucas · Simon · Felipe" disabled={locked} /></label>
          <label className="field"><span>Focus areas worked</span><div className="chips">{FOCUS_AREAS.map(f => <button key={f} type="button" className={`chip ${s.focus.includes(f) ? 'on' : ''}`} onClick={() => toggleFocus(f)} disabled={locked}>{f}</button>)}</div></label>
          <label className="field"><span>What we worked on</span><textarea className="input" value={s.worked_on || ''} onChange={e => setS({ ...s, worked_on: e.target.value })} placeholder="Drills, constraints, the theme of the session…" disabled={locked} /></label>
          <button className="btn block" onClick={() => setStep(2)}>Next: players →</button>
        </div>
      )}

      {step === 2 && (
        <div className="card">
          <p className="muted small">{selected.length} selected. Tap to add or remove.</p>
          <input className="input" placeholder="Search players…" value={q} onChange={e => setQ(e.target.value)} style={{ marginBottom: 8 }} />
          <div className="chips" style={{ marginBottom: 12 }}>
            {roster.filter(a => !ql || a.full_name.toLowerCase().includes(ql)).map(a => <button key={a.id} type="button" className={`chip ${players[a.id] ? 'on' : ''}`} onClick={() => togglePlayer(a.id)} disabled={locked}>{a.full_name}</button>)}
          </div>
          {!locked && <div className="row" style={{ gap: 8 }}><input className="input" placeholder="New player not on the list? Type the name" value={quickAdd} onChange={e => setQuickAdd(e.target.value)} onKeyDown={e => e.key === 'Enter' && (e.preventDefault(), addAthleteInline())} /><button className="btn ghost small" onClick={addAthleteInline}>Add</button></div>}
          <div className="row" style={{ gap: 8, marginTop: 12 }}><button className="btn ghost" onClick={() => setStep(1)}>← Back</button><button className="btn" style={{ flex: 1 }} onClick={() => setStep(3)} disabled={selected.length === 0}>Next: each player ({selected.length}) →</button></div>
        </div>
      )}

      {step === 3 && (
        <>
          <p className="muted small">{s.session_date} · {s.start_time} · {s.session_type} · {selected.length} players{s.focus.length ? ' · ' + s.focus.join(', ') : ''}</p>
          {selected.map(a => { const p = players[a.id]; return (
            <div className="card" key={a.id} style={p.present === false ? { opacity: 0.6 } : {}}>
              <div className="row between">
                <div className="row" style={{ gap: 10 }}><div className="avatar">{initials(a.full_name)}</div><div><div style={{ fontWeight: 600 }}>{a.full_name}</div><div className="small muted">{a.position_short || a.program || ''}</div></div></div>
                <button className={`btn small ${p.present === false ? 'danger' : 'ghost'}`} onClick={() => setP(a.id, { present: p.present === false })} disabled={locked}>{p.present === false ? 'Absent' : 'Present'}</button>
              </div>
              {p.present !== false && (
                <>
                  {[['Confidence', 'confidence'], ['Technical', 'technical'], ['Effort', 'effort']].map(([l, k]) => (
                    <div key={k} style={{ marginTop: 10 }}>
                      <div className="row between"><span className="small" style={{ color: 'var(--gold)', textTransform: 'uppercase', letterSpacing: '0.08em' }}>{l}</span><span className="display" style={{ color: 'var(--pink)', fontSize: '1.3rem' }}>{p[k] || '_'}/10</span></div>
                      <div className="scorepick">{[1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map(n => <button key={n} type="button" className={p[k] === n ? 'on' : ''} onClick={() => !locked && setP(a.id, { [k]: n })}>{n}</button>)}</div>
                    </div>
                  ))}
                  <label className="field" style={{ marginTop: 10 }}><span style={{ color: 'var(--good)' }}>Improvements today</span><textarea className="input" style={{ minHeight: 64 }} value={p.improvements || ''} onChange={e => setP(a.id, { improvements: e.target.value })} placeholder="What got better…" disabled={locked} /></label>
                  <label className="field"><span style={{ color: 'var(--pink)' }}>Weaknesses / work on</span><textarea className="input" style={{ minHeight: 64 }} value={p.weaknesses || ''} onChange={e => setP(a.id, { weaknesses: e.target.value })} placeholder="What to fix next…" disabled={locked} /></label>
                </>
              )}
            </div>
          ) })}
          <div className="card">
            <label className="field"><span>Session notes (optional)</span><textarea className="input" value={s.notes || ''} onChange={e => setS({ ...s, notes: e.target.value })} disabled={locked} /></label>
            <div className="row" style={{ gap: 8 }}><button className="btn ghost" onClick={() => setStep(2)}>← Players</button>{!locked && <button className="btn" style={{ flex: 1 }} onClick={save} disabled={saving}>{saving ? 'Saving…' : editing ? 'Save changes' : 'Save session'}</button>}</div>
            {editing && isDirector(role) && <button className="btn danger small" style={{ marginTop: 10 }} onClick={async () => { if (confirm('Delete this session?')) { await supabase.from('sessions').delete().eq('id', id); nav('/athletes') } }}>Delete session</button>}
          </div>
        </>
      )}
    </>
  )
}
