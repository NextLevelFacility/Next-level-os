import { useEffect, useMemo, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { noteBySlug, render, backlinksOf } from '../lib/vault'
import { supabase, isManager, isDirector, ROLES } from '../lib/supabase'
import { useAuth } from '../lib/auth.jsx'
import { useSops, STATUS } from '../lib/sops'

export default function Note() {
  const { slug } = useParams()
  const { user, roles: role } = useAuth()
  const note = noteBySlug(slug)
  const [readAt, setReadAt] = useState(null)
  const [readers, setReaders] = useState([])
  const { sops } = useSops()
  const mine = note ? sops.filter(x => x.dept === note.title) : []

  useEffect(() => {
    if (!note) return
    window.scrollTo(0, 0)
    supabase.from('sop_reads').select('read_at').eq('user_id', user.id).eq('sop_path', note.path).maybeSingle().then(({ data }) => setReadAt(data?.read_at || null))
    if (isManager(role)) supabase.from('sop_reads').select('read_at, profiles(full_name)').eq('sop_path', note.path).then(({ data }) => setReaders(data || []))
  }, [slug, user.id, role])

  const html = useMemo(() => note ? render(note) : '', [note])
  if (!note) return <div className="empty">That page isn't in the playbook. <Link to="/playbook">Back to the Playbook</Link></div>

  async function markRead() {
    await supabase.from('sop_reads').upsert({ user_id: user.id, sop_path: note.path }, { onConflict: 'user_id,sop_path' })
    setReadAt(new Date().toISOString())
  }

  const back = backlinksOf(note)
  return (
    <>
      <Link to="/playbook" className="small">← Playbook</Link>
      <div className="row wrap" style={{ gap: 6, margin: '8px 0' }}>
        {note.tags.map(t => <span key={t} className="pill pink">#{t}</span>)}
        {note.meta.status && <span className={`pill ${note.meta.status === 'approved' ? 'good' : 'gold'}`}>{note.meta.status}</span>}
        {note.meta.owner && <span className="pill">owner · {note.meta.owner}</span>}
      </div>
      {mine.length > 0 && (
        <div className="card accent">
          <div className="row between"><h2 style={{ margin: 0 }}>The SOPs in this area</h2>{isDirector(role) && <Link to="/sops" className="small">SOP Studio</Link>}</div>
          <p className="small muted">{mine.filter(x => x.status === 'published').length} live · {mine.filter(x => x.body && x.status !== 'published').length} in draft · {mine.filter(x => !x.body).length} still outlines</p>
          <ul className="list">
            {mine.filter(x => x.status === 'published' || isDirector(role)).map(x => { const [label, tone] = STATUS[x.status] || STATUS.outline; return (
              <li key={x.key}><span className="pill" style={{ minWidth: 28, justifyContent: 'center' }}>{x.n < 99 ? x.n : '+'}</span><span className="grow"><div className="title">{x.title}</div><div className="row wrap small" style={{ gap: 6 }}><span className={`pill ${tone}`}>{label}</span>{x.video_url && <span className="pill pink">▶ video</span>}<span className="muted">{x.roles.map(r => ROLES[r]).join(' · ')}</span></div></span><Link className="btn ghost small" to={`/sop/${encodeURIComponent(x.key)}`}>Open</Link></li>
            ) })}
          </ul>
        </div>
      )}
      <article className="md"><h1>{note.title}</h1><div dangerouslySetInnerHTML={{ __html: html }} /></article>
      <hr className="hr" />
      {readAt
        ? <p className="muted">You marked this read on {new Date(readAt).toLocaleDateString()}.</p>
        : <button className="btn block" onClick={markRead}>I've read this and I'll follow it</button>}
      {isManager(role) && readers.length > 0 && (
        <p className="small muted">Read by: {readers.map(r => r.profiles?.full_name).filter(Boolean).join(', ')}</p>
      )}
      {back.length > 0 && (
        <div className="card" style={{ marginTop: 16 }}>
          <h3>Linked from</h3>
          <div className="row wrap" style={{ gap: 8 }}>{back.map(b => <Link key={b.path} to={`/playbook/${b.slug}`} className="pill gold">{b.title}</Link>)}</div>
        </div>
      )}
    </>
  )
}
