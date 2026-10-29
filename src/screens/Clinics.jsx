import { useEffect, useState } from 'react'
import { supabase, fmtDate } from '../lib/supabase'
import { callFn } from '../lib/api'
import ClinicsCard from '../components/ClinicsCard.jsx'

// Clinics: sign-ups come straight from PushPress event reservations. Here the Owner sets the goal, capacity and push window per clinic.
export default function Clinics() {
  const [pp, setPp] = useState(null)
  const [goals, setGoals] = useState([])
  const [edit, setEdit] = useState(null)
  const load = async () => { const { data } = await supabase.from('events').select('*').eq('active', true).order('starts_on'); setGoals(data || []) }
  useEffect(() => { callFn('pushpress-summary').then(setPp); load() }, [])

  async function saveGoal(e) {
    e.preventDefault()
    const { id, event_registrations, signups, revenue, created_at, ...rest } = edit
    const { error } = id ? await supabase.from('events').update(rest).eq('id', id) : await supabase.from('events').insert(rest)
    if (error) return alert(error.message); setEdit(null); load()
  }
  const blank = { name: '', kind: 'clinic', starts_on: '', ends_on: '', capacity: 60, price: '', push_from: '', push_until: '', keyword: '', goal_signups: 50, active: true, sort: goals.length + 1 }

  return (
    <>
      <div className="row between"><h1>Clinics & camps</h1><div className="row" style={{ gap: 6 }}><button className="btn ghost small" onClick={() => callFn('pushpress-summary', { force: true }).then(setPp)}>Refresh</button><button className="btn small" onClick={() => setEdit(blank)}>+ Goal</button></div></div>
      <p className="muted">Sign-ups are counted from PushPress event reservations (create the event in PushPress → Calendar → Events; parents reserve, it lands here). Goals and push windows below match a PushPress event by keyword.</p>

      <ClinicsCard pp={pp} full />

      {edit && (
        <form className="card accent" onSubmit={saveGoal}>
          <h2>{edit.id ? 'Edit goal' : 'New goal'}</h2>
          <label className="field"><span>Name</span><input className="input" value={edit.name} onChange={e => setEdit({ ...edit, name: e.target.value })} required /></label>
          <label className="field"><span>Keyword — matches the PushPress event title (e.g. "Thanksgiving")</span><input className="input" value={edit.keyword || ''} onChange={e => setEdit({ ...edit, keyword: e.target.value })} placeholder="Thanksgiving" /></label>
          <div className="row" style={{ gap: 8 }}>
            <label className="field" style={{ flex: 1 }}><span>Starts</span><input className="input" type="date" value={edit.starts_on || ''} onChange={e => setEdit({ ...edit, starts_on: e.target.value })} /></label>
            <label className="field" style={{ flex: 1 }}><span>Ends</span><input className="input" type="date" value={edit.ends_on || ''} onChange={e => setEdit({ ...edit, ends_on: e.target.value })} /></label>
          </div>
          <div className="row" style={{ gap: 8 }}>
            <label className="field" style={{ flex: 1 }}><span>Push from</span><input className="input" type="date" value={edit.push_from || ''} onChange={e => setEdit({ ...edit, push_from: e.target.value })} /></label>
            <label className="field" style={{ flex: 1 }}><span>Push until</span><input className="input" type="date" value={edit.push_until || ''} onChange={e => setEdit({ ...edit, push_until: e.target.value })} /></label>
          </div>
          <div className="row" style={{ gap: 8 }}>
            <label className="field" style={{ flex: 1 }}><span>Capacity</span><input className="input" type="number" value={edit.capacity ?? ''} onChange={e => setEdit({ ...edit, capacity: Number(e.target.value) || null })} /></label>
            <label className="field" style={{ flex: 1 }}><span>Goal sign-ups</span><input className="input" type="number" value={edit.goal_signups ?? ''} onChange={e => setEdit({ ...edit, goal_signups: Number(e.target.value) || null })} /></label>
            <label className="field" style={{ flex: 1 }}><span>Price $</span><input className="input" type="number" value={edit.price ?? ''} onChange={e => setEdit({ ...edit, price: e.target.value === '' ? null : Number(e.target.value) })} /></label>
          </div>
          <div className="row" style={{ gap: 8 }}><button className="btn">Save</button><button type="button" className="btn ghost" onClick={() => setEdit(null)}>Cancel</button>{edit.id && <button type="button" className="btn danger small" onClick={async () => { await supabase.from('events').update({ active: false }).eq('id', edit.id); setEdit(null); load() }}>Archive</button>}</div>
        </form>
      )}

      <div className="card">
        <h2 style={{ marginTop: 0 }}>Goals & push calendar</h2>
        <p className="small muted">The team pushes one at a time: Thanksgiving → Winter → Spring (push from Feb) → Summer (push from April).</p>
        <ul className="list">
          {goals.map(g => <li key={g.id}><span className="grow"><div style={{ fontWeight: 500 }}>{g.name} <span className="muted small">· keyword "{g.keyword || '—'}"</span></div><div className="small muted">{fmtDate(g.starts_on)} – {fmtDate(g.ends_on)} · push {fmtDate(g.push_from)} → {fmtDate(g.push_until)} · goal {g.goal_signups ?? '—'} / cap {g.capacity ?? '—'}</div></span><button className="btn ghost small" onClick={() => setEdit(g)}>Edit</button></li>)}
          {goals.length === 0 && <li className="muted small">No goals yet.</li>}
        </ul>
      </div>
    </>
  )
}
