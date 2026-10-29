import { useState } from 'react'
import { useAuth } from '../lib/auth.jsx'
import { supabase, ROLES } from '../lib/supabase'

export default function Settings() {
  const { profile, user, locations, refresh } = useAuth()
  const [name, setName] = useState(profile.full_name || '')
  const [phone, setPhone] = useState(profile.phone || '')
  const [msg, setMsg] = useState('')
  async function save(e) {
    e.preventDefault()
    const { error } = await supabase.from('profiles').update({ full_name: name, phone }).eq('id', user.id)
    setMsg(error ? error.message : 'Saved'); refresh()
  }
  return (
    <>
      <h1>You</h1>
      <p className="muted">{ROLES[profile.role]} · {locations.find(l => l.id === profile.location_id)?.name || 'No location'} · {user.email}</p>
      <form className="card" onSubmit={save}>
        <label className="field"><span>Name</span><input className="input" value={name} onChange={e => setName(e.target.value)} /></label>
        <label className="field"><span>Phone (so your manager can reach you)</span><input className="input" value={phone} onChange={e => setPhone(e.target.value)} /></label>
        <button className="btn">Save</button> {msg && <span className="small" style={{ marginLeft: 10, color: 'var(--gold)' }}>{msg}</span>}
      </form>
      <p className="small muted">Your role is set by the Owner.</p>
    </>
  )
}
