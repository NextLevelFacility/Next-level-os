import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { useAuth } from '../lib/auth.jsx'
import { supabase, isCoach, PROGRAMS } from '../lib/supabase'

export const initials = (n = '') => n.split(' ').filter(Boolean).slice(0, 2).map(s => s[0]).join('').toUpperCase()

export default function Athletes() {
  const { user, roles: role, locationId, locations } = useAuth()
  const [list, setList] = useState([])
  const [q, setQ] = useState('')
  const [adding, setAdding] = useState(false)
  const blank = { full_name: '', age: '', position: '', position_short: '', program: PROGRAMS[0], frequency: 2, joined_on: '', club: '', parent_name: '', parent_phone: '', location_id: locationId || '' }
  const [form, setForm] = useState(blank)

  async function load() {
    const { data } = await supabase.from('athletes').select('*, session_athletes(count)').eq('active', true).order('full_name')
    setList(data || [])
  }
  useEffect(() => { load() }, [])

  async function add(e) {
    e.preventDefault()
    const payload = { ...form, age: form.age === '' ? null : Number(form.age), frequency: Number(form.frequency) || null, joined_on: form.joined_on || null, created_by: user.id, location_id: form.location_id || locationId }
    const { error } = await supabase.from('athletes').insert(payload)
    if (error) return alert(error.message)
    setForm(blank); setAdding(false); load()
  }

  const ql = q.toLowerCase()
  const shown = list.filter(a => !ql || a.full_name.toLowerCase().includes(ql) || (a.program || '').toLowerCase().includes(ql) || (a.position || '').toLowerCase().includes(ql))

  return (
    <>
      <div className="row between"><h1>Athletes</h1>{isCoach(role) && <button className="btn small" onClick={() => setAdding(!adding)}>+ Add athlete</button>}</div>
      <p className="muted">{list.length} active · tap a player for their profile, sessions and reports.</p>
      {isCoach(role) && <Link to="/sessions/new" className="btn gold block" style={{ marginBottom: 12 }}>+ Log a session</Link>}

      {adding && (
        <form className="card accent" onSubmit={add}>
          <h2>New athlete</h2>
          <label className="field"><span>Full name</span><input className="input" value={form.full_name} onChange={e => setForm({ ...form, full_name: e.target.value })} required /></label>
          <div className="row" style={{ gap: 8 }}>
            <label className="field" style={{ flex: 1 }}><span>Age</span><input className="input" type="number" inputMode="numeric" value={form.age} onChange={e => setForm({ ...form, age: e.target.value })} /></label>
            <label className="field" style={{ flex: 2 }}><span>Position</span><input className="input" placeholder="Defensive Midfielder" value={form.position} onChange={e => setForm({ ...form, position: e.target.value })} /></label>
            <label className="field" style={{ flex: 1 }}><span>Short</span><input className="input" placeholder="CDM" value={form.position_short} onChange={e => setForm({ ...form, position_short: e.target.value })} /></label>
          </div>
          <div className="row" style={{ gap: 8 }}>
            <label className="field" style={{ flex: 2 }}><span>Program</span><select className="input" value={form.program} onChange={e => setForm({ ...form, program: e.target.value })}>{PROGRAMS.map(p => <option key={p}>{p}</option>)}</select></label>
            <label className="field" style={{ flex: 1 }}><span>× / week</span><input className="input" type="number" inputMode="numeric" value={form.frequency} onChange={e => setForm({ ...form, frequency: e.target.value })} /></label>
          </div>
          <div className="row" style={{ gap: 8 }}>
            <label className="field" style={{ flex: 1 }}><span>Joined</span><input className="input" type="date" value={form.joined_on} onChange={e => setForm({ ...form, joined_on: e.target.value })} /></label>
            <label className="field" style={{ flex: 1 }}><span>Club / team</span><input className="input" value={form.club} onChange={e => setForm({ ...form, club: e.target.value })} /></label>
          </div>
          <div className="row" style={{ gap: 8 }}>
            <label className="field" style={{ flex: 1 }}><span>Parent name</span><input className="input" value={form.parent_name} onChange={e => setForm({ ...form, parent_name: e.target.value })} /></label>
            <label className="field" style={{ flex: 1 }}><span>Parent phone</span><input className="input" inputMode="tel" value={form.parent_phone} onChange={e => setForm({ ...form, parent_phone: e.target.value })} /></label>
          </div>
          {locations.length > 1 && <label className="field"><span>Location</span><select className="input" value={form.location_id} onChange={e => setForm({ ...form, location_id: e.target.value })}>{locations.map(l => <option key={l.id} value={l.id}>{l.name}</option>)}</select></label>}
          <button className="btn block">Save athlete</button>
        </form>
      )}

      <input className="input" placeholder="Search by name, program or position…" value={q} onChange={e => setQ(e.target.value)} style={{ marginBottom: 10 }} />
      <div className="card">
        {shown.length === 0 && <div className="empty">No athletes yet. Add your first one above.</div>}
        {shown.map(a => (
          <Link key={a.id} to={`/athletes/${a.id}`} className="athlete-row">
            <div className="avatar">{initials(a.full_name)}</div>
            <div className="grow" style={{ minWidth: 0 }}>
              <div style={{ fontWeight: 600 }}>{a.full_name}</div>
              <div className="small muted">{[a.age && `Age ${a.age}`, a.position_short || a.position, a.program && `${a.program}${a.frequency ? ` · ${a.frequency}×/wk` : ''}`].filter(Boolean).join(' · ')}</div>
            </div>
            <span className="pill">{a.session_athletes?.[0]?.count ?? 0} sessions</span>
          </Link>
        ))}
      </div>
    </>
  )
}
