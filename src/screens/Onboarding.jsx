import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { useAuth } from '../lib/auth.jsx'
import { supabase, ROLES, isManager } from '../lib/supabase'
import { DEFAULT_PLAN } from '../lib/onboardingPlan'

export default function Onboarding() {
  const { user, role, locationId, locations } = useAuth()
  const [hires, setHires] = useState([])
  const [people, setPeople] = useState([])
  const [showForm, setShowForm] = useState(false)
  const [form, setForm] = useState({ full_name: '', role: 'coach', start_date: '', buddy_id: '', manager_id: user.id, location_id: locationId || '' })
  const manager = isManager(role)

  async function load() {
    const { data } = await supabase.from('hires').select('*, onboarding_tasks(done)').order('created_at', { ascending: false })
    setHires(data || [])
    const { data: p } = await supabase.from('profiles').select('id, full_name, role').order('full_name')
    setPeople(p || [])
  }
  useEffect(() => { load() }, [])

  async function addHire(e) {
    e.preventDefault()
    const { data: h, error } = await supabase.from('hires').insert({
      full_name: form.full_name, role: form.role, start_date: form.start_date || null,
      buddy_id: form.buddy_id || null, manager_id: form.manager_id || null, location_id: form.location_id || null,
    }).select().single()
    if (error) return alert(error.message)
    await supabase.from('onboarding_tasks').insert(DEFAULT_PLAN.map(t => ({ ...t, hire_id: h.id })))
    setShowForm(false); setForm({ ...form, full_name: '', start_date: '' }); load()
  }

  return (
    <>
      <div className="row between"><h1>Onboarding</h1>{manager && <button className="btn small" onClick={() => setShowForm(!showForm)}>+ Add hire</button>}</div>
      <p className="muted">The 5 C's: Compliance, Clarity, Culture, Connection, Check-back. Every hire, every location, the same path.</p>

      {showForm && (
        <form className="card accent" onSubmit={addHire}>
          <h2>New hire</h2>
          <label className="field"><span>Full name</span><input className="input" value={form.full_name} onChange={e => setForm({ ...form, full_name: e.target.value })} required /></label>
          <label className="field"><span>Role</span>
            <select className="input" value={form.role} onChange={e => setForm({ ...form, role: e.target.value })}>
              {Object.entries(ROLES).filter(([k]) => k !== 'owner' && k !== 'newhire').map(([k, v]) => <option key={k} value={k}>{v}</option>)}
            </select></label>
          <label className="field"><span>Start date</span><input className="input" type="date" value={form.start_date} onChange={e => setForm({ ...form, start_date: e.target.value })} /></label>
          <label className="field"><span>Location</span>
            <select className="input" value={form.location_id} onChange={e => setForm({ ...form, location_id: e.target.value })}>
              {locations.map(l => <option key={l.id} value={l.id}>{l.name}</option>)}
            </select></label>
          <label className="field"><span>Buddy (not their manager)</span>
            <select className="input" value={form.buddy_id} onChange={e => setForm({ ...form, buddy_id: e.target.value })}>
              <option value="">Pick later</option>{people.map(p => <option key={p.id} value={p.id}>{p.full_name}</option>)}
            </select></label>
          <label className="field"><span>Manager</span>
            <select className="input" value={form.manager_id} onChange={e => setForm({ ...form, manager_id: e.target.value })}>
              {people.map(p => <option key={p.id} value={p.id}>{p.full_name}</option>)}
            </select></label>
          <button className="btn block">Create the 30/60/90 plan</button>
        </form>
      )}

      {hires.length === 0 && <div className="empty">No one in onboarding right now.</div>}
      {hires.map(h => {
        const total = h.onboarding_tasks.length, done = h.onboarding_tasks.filter(t => t.done).length
        const pct = total ? Math.round(done / total * 100) : 0
        return (
          <Link to={`/onboarding/${h.id}`} key={h.id} className="card" style={{ display: 'block', color: 'inherit' }}>
            <div className="row between">
              <div><div className="title" style={{ fontWeight: 600 }}>{h.full_name}</div><div className="small muted">{ROLES[h.role]} · starts {h.start_date || 'TBD'} · {h.status}</div></div>
              <span className={`pill ${pct === 100 ? 'good' : 'gold'}`}>{pct}%</span>
            </div>
            <div className="progress" style={{ marginTop: 10 }}><div style={{ width: pct + '%' }} /></div>
          </Link>
        )
      })}
    </>
  )
}
