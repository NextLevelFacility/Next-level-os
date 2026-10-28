import { useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useAuth } from '../lib/auth.jsx'
import { supabase, isDirector, isCoach, isManager, ROLES } from '../lib/supabase'

export const AUDIENCES = [['coach', 'Coaches · The Method'], ['sales', 'Sales'], ['frontdesk', 'Concession / front desk'], ['newhire', 'New hires']]

export default function Method() {
  const { user, roles } = useAuth()
  const nav = useNavigate()
  const [mods, setMods] = useState([])
  const [done, setDone] = useState(new Set())
  const canEdit = isDirector(roles)
  const coach = isCoach(roles)

  async function load() {
    const { data } = await supabase.from('modules').select('*').order('sort').order('created_at')
    setMods(data || [])
    const { data: p } = await supabase.from('module_progress').select('module_id').eq('user_id', user.id)
    setDone(new Set((p || []).map(x => x.module_id)))
  }
  useEffect(() => { load() }, [])

  async function create(audience) {
    const { data, error } = await supabase.from('modules').insert({ title: 'New module', sort: (mods.filter(m => (m.audience || []).includes(audience)).at(-1)?.sort ?? 0) + 1, author_id: user.id, audience: [audience], published: false, sections: {} }).select().single()
    if (error) return alert(error.message)
    nav(`/method/${data.id}?edit=1`)
  }

  // Which audiences this person sees: their roles; managers/directors see everything, grouped.
  const visible = AUDIENCES.filter(([a]) => isManager(roles) || canEdit || roles.includes(a) || (a === 'coach' && coach))
  const forMe = mods.filter(m => m.published && (m.audience || []).some(a => roles.includes(a) || (a === 'coach' && coach)))
  const pct = forMe.length ? Math.round(forMe.filter(m => done.has(m.id)).length / forMe.length * 100) : 0

  return (
    <>
      <h1>{coach && !isManager(roles) ? 'The Method' : 'Training'}</h1>
      <p className="muted">Short modules with a video and the written method. Watch, read, mark it complete. Your manager sees your progress.</p>
      {forMe.length > 0 && <div className="card"><div className="row between"><span>Your progress</span><span className={`pill ${pct === 100 ? 'good' : 'gold'}`}>{pct}%</span></div><div className="progress" style={{ marginTop: 8 }}><div style={{ width: pct + '%' }} /></div></div>}

      {visible.map(([aud, label]) => {
        const list = mods.filter(m => (m.audience || []).includes(aud))
        return (
          <div className="card" key={aud}>
            <div className="row between"><h2 style={{ margin: 0 }}>{label}</h2>{canEdit && <button className="btn small" onClick={() => create(aud)}>+ Module</button>}</div>
            {list.length === 0 && <p className="muted small" style={{ marginTop: 8 }}>No modules yet{canEdit ? '. Add the first one.' : '.'}</p>}
            <ul className="list">
              {list.map((m, i) => (
                <li key={m.id}>
                  <span className={`check ${done.has(m.id) ? 'on' : ''}`} style={done.has(m.id) ? { background: 'var(--good)', borderColor: 'var(--good)', color: '#0A0A0A' } : {}}>{done.has(m.id) ? '✓' : i + 1}</span>
                  <span className="grow"><Link to={`/method/${m.id}`} style={{ color: 'var(--text)', fontWeight: 600 }}>{m.title}</Link>{!m.published && <span className="pill" style={{ marginLeft: 6 }}>draft</span>}{m.video_url && <span className="pill pink" style={{ marginLeft: 6 }}>video</span>}<div className="small muted">{m.summary}</div></span>
                  <Link className="btn ghost small" to={`/method/${m.id}`}>Open</Link>
                </li>
              ))}
            </ul>
          </div>
        )
      })}
    </>
  )
}
