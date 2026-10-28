import { useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useAuth } from '../lib/auth.jsx'
import { supabase, isDirector } from '../lib/supabase'

export default function Method() {
  const { user, role } = useAuth()
  const nav = useNavigate()
  const [mods, setMods] = useState([])
  const [done, setDone] = useState(new Set())
  const director = isDirector(role)

  async function load() {
    const { data } = await supabase.from('modules').select('*').order('sort').order('created_at')
    setMods(data || [])
    const { data: p } = await supabase.from('module_progress').select('module_id').eq('user_id', user.id)
    setDone(new Set((p || []).map(x => x.module_id)))
  }
  useEffect(() => { load() }, [])

  async function create() {
    const { data, error } = await supabase.from('modules').insert({ title: 'New module', sort: (mods.at(-1)?.sort ?? 0) + 1, author_id: user.id, body: '## Objective\n\n## Key points\n\n- \n\n## Drills\n\n1. \n\n## Coaching cues\n\n- ', published: false }).select().single()
    if (error) return alert(error.message)
    nav(`/method/${data.id}?edit=1`)
  }

  const published = mods.filter(m => m.published)
  const pct = published.length ? Math.round(published.filter(m => done.has(m.id)).length / published.length * 100) : 0

  return (
    <>
      <div className="row between"><h1>The Method</h1>{director && <button className="btn small" onClick={create}>+ New module</button>}</div>
      <p className="muted">The Next Level Coaching Methodology, module by module. Written by Simon; every coach completes them in order.</p>
      {published.length > 0 && <div className="card"><div className="row between"><span>Your progress</span><span className="pill gold">{pct}%</span></div><div className="progress" style={{ marginTop: 8 }}><div style={{ width: pct + '%' }} /></div></div>}
      <div className="card">
        {mods.length === 0 && <div className="empty">No modules yet.</div>}
        <ul className="list">
          {mods.map((m, i) => (
            <li key={m.id}>
              <span className={`check ${done.has(m.id) ? 'on' : ''}`} style={done.has(m.id) ? { background: 'var(--good)', borderColor: 'var(--good)', color: '#0A0A0A' } : {}}>{done.has(m.id) ? '✓' : i + 1}</span>
              <span className="grow"><Link to={`/method/${m.id}`} style={{ color: 'var(--text)', fontWeight: 600 }}>{m.title}</Link>{!m.published && <span className="pill" style={{ marginLeft: 6 }}>draft</span>}<div className="small muted">{m.summary}</div></span>
              <Link className="btn ghost small" to={`/method/${m.id}`}>Open</Link>
            </li>
          ))}
        </ul>
      </div>
    </>
  )
}
