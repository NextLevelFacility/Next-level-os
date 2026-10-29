import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useAuth } from '../lib/auth.jsx'
import { supabase, ROLES, isDirector, isManager } from '../lib/supabase'
import { useSops, departments, STATUS } from '../lib/sops'
import { slugify } from '../lib/vault'

// SOP Studio: the whole list of SOPs in one place. Open one → rewrite it, drop in a video, publish. Plug and play.
export default function SopStudio() {
  const { roles, user } = useAuth()
  const { sops, loading, reload } = useSops()
  const nav = useNavigate()
  const [filter, setFilter] = useState('all')
  const [adding, setAdding] = useState(null)   // { dept, title }
  if (!isDirector(roles)) return <div className="empty">SOP Studio is for the Owner, Operator and Directors.</div>

  const depts = departments().filter(d => isManager(roles) || !d.tags.some(t => /finance|admin/.test(t))).map(d => d.title)
  const extraDepts = [...new Set(sops.map(s => s.dept).filter(d => !depts.includes(d)))]
  const written = sops.filter(s => s.body).length, live = sops.filter(s => s.status === 'published').length, withVideo = sops.filter(s => s.video_url).length
  const shown = sops.filter(s => depts.includes(s.dept) || extraDepts.includes(s.dept)).filter(s => filter === 'all' || (filter === 'todo' && !s.body) || (filter === 'video' && !s.video_url) || (filter === 'live' && s.status === 'published'))

  async function addSop(e) {
    e.preventDefault()
    const key = `${slugify(adding.dept)}#${slugify(adding.title)}-${Date.now().toString(36).slice(-4)}`
    const { error } = await supabase.from('sop_docs').insert({ key, dept: adding.dept, title: adding.title.trim(), roles: [], status: 'draft', sort: 50, updated_by: user.id })
    if (error) return alert(error.message)
    setAdding(null); await reload(); nav(`/sop/${encodeURIComponent(key)}`)
  }

  return (
    <>
      <div className="row between wrap"><h1>SOP Studio</h1><button className="btn small" onClick={() => setAdding({ dept: depts[0], title: '' })}>+ New SOP</button></div>
      <p className="muted">Every SOP Next Level runs on. Open one, rewrite it in your words, paste a video, hit Publish — the team sees it on their Playbook the same minute. The vault outline stays as your starting point.</p>

      <div className="grid" style={{ marginBottom: 12 }}>
        <div className="stat"><div className="label">SOPs</div><div className="value">{sops.length}</div></div>
        <div className="stat"><div className="label">Written</div><div className="value gold">{written}</div></div>
        <div className="stat"><div className="label">With video</div><div className="value pink">{withVideo}</div></div>
        <div className="stat"><div className="label">Live for the team</div><div className="value">{live}</div></div>
      </div>

      {adding && (
        <form className="card accent" onSubmit={addSop}>
          <h3>New SOP</h3>
          <div className="row wrap" style={{ gap: 8 }}>
            <label className="field" style={{ flex: 1, minWidth: 180 }}><span>Department</span><select className="input" value={adding.dept} onChange={e => setAdding({ ...adding, dept: e.target.value })}>{[...depts, ...extraDepts].map(d => <option key={d}>{d}</option>)}</select></label>
            <label className="field" style={{ flex: 2, minWidth: 200 }}><span>SOP name</span><input className="input" value={adding.title} onChange={e => setAdding({ ...adding, title: e.target.value })} placeholder="e.g. Birthday party setup" required autoFocus /></label>
          </div>
          <div className="row" style={{ gap: 8 }}><button className="btn small">Create</button><button type="button" className="btn ghost small" onClick={() => setAdding(null)}>Cancel</button></div>
        </form>
      )}

      <div className="row wrap" style={{ gap: 6, marginBottom: 12 }}>
        {[['all', 'All'], ['todo', 'Not written yet'], ['video', 'No video yet'], ['live', 'Live']].map(([k, l]) => <button key={k} className={`chip ${filter === k ? 'on' : ''}`} onClick={() => setFilter(k)}>{l}</button>)}
      </div>

      {loading ? <p className="muted">Loading…</p> : [...depts, ...extraDepts].map(dept => {
        const list = shown.filter(s => s.dept === dept)
        if (!list.length) return null
        const deptNote = departments().find(d => d.title === dept)
        return (
          <div className="card" key={dept}>
            <div className="row between"><h2 style={{ margin: 0 }}>{dept}</h2>{deptNote && <Link to={`/playbook/${deptNote.slug}`} className="small">Vault page</Link>}</div>
            <ul className="list" style={{ marginTop: 8 }}>
              {list.map(s => {
                const [label, tone] = STATUS[s.status] || STATUS.outline
                return (
                  <li key={s.key}>
                    <span className="pill" style={{ minWidth: 28, justifyContent: 'center' }}>{s.n < 99 ? s.n : '+'}</span>
                    <span className="grow">
                      <div style={{ fontWeight: 600 }}>{s.title}</div>
                      <div className="row wrap small" style={{ gap: 6, marginTop: 2 }}>
                        <span className={`pill ${tone}`}>{label}</span>
                        {s.video_url && <span className="pill pink">▶ video</span>}
                        <span className="muted">{s.roles.map(r => ROLES[r]).join(' · ') || 'no one assigned'}</span>
                      </div>
                    </span>
                    <Link className={`btn small ${s.body ? 'ghost' : ''}`} to={`/sop/${encodeURIComponent(s.key)}`}>{s.body ? 'Open' : 'Write it'}</Link>
                  </li>
                )
              })}
            </ul>
          </div>
        )
      })}
    </>
  )
}
