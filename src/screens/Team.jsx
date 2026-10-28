import { useEffect, useState } from 'react'
import { useAuth } from '../lib/auth.jsx'
import { supabase, ROLES, isManager } from '../lib/supabase'
import { sops } from '../lib/vault'
import { roleMatches } from './Today.jsx'

export default function Team() {
  const { role, locations, refresh, user } = useAuth()
  const [people, setPeople] = useState([])
  const [reads, setReads] = useState([])
  const manager = isManager(role)

  async function load() {
    const { data } = await supabase.from('profiles').select('*').order('full_name')
    setPeople(data || [])
    if (manager) { const { data: r } = await supabase.from('sop_reads').select('user_id, sop_path'); setReads(r || []) }
  }
  useEffect(() => { load() }, [role])

  async function update(id, patch) {
    const { error } = await supabase.from('profiles').update(patch).eq('id', id)
    if (error) alert(error.message); else { load(); if (id === user.id) refresh() }
  }

  const locName = id => locations.find(l => l.id === id)?.name || '—'
  return (
    <>
      <h1>Team</h1>
      <p className="muted">Every seat, who sits in it, and where. {manager && 'Tap a role or location to change it.'}</p>
      {people.map(p => {
        const need = sops().filter(n => roleMatches(n, p.role)).length
        const have = reads.filter(r => r.user_id === p.id).length
        return (
          <div className="card" key={p.id}>
            <div className="row between wrap">
              <div><div style={{ fontWeight: 600 }}>{p.full_name || p.email}</div><div className="small muted">{p.email}{p.phone && ` · ${p.phone}`}</div></div>
              {manager ? (
                <div className="row wrap" style={{ gap: 6 }}>
                  <select className="input" style={{ width: 'auto', minHeight: 36, padding: '6px 10px' }} value={p.role} onChange={e => update(p.id, { role: e.target.value })}>
                    {Object.entries(ROLES).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                  </select>
                  <select className="input" style={{ width: 'auto', minHeight: 36, padding: '6px 10px' }} value={p.location_id || ''} onChange={e => update(p.id, { location_id: e.target.value })}>
                    {locations.map(l => <option key={l.id} value={l.id}>{l.name}</option>)}
                  </select>
                </div>
              ) : <div className="row" style={{ gap: 6 }}><span className="pill pink">{ROLES[p.role]}</span><span className="pill">{locName(p.location_id)}</span></div>}
            </div>
            {manager && need > 0 && <div className="small muted" style={{ marginTop: 8 }}>SOPs read: {Math.min(have, need)} of {need}<div className="progress" style={{ marginTop: 4 }}><div style={{ width: Math.min(100, Math.round(have / need * 100)) + '%' }} /></div></div>}
          </div>
        )
      })}
    </>
  )
}
