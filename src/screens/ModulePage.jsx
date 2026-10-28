import { useEffect, useMemo, useState } from 'react'
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { marked } from 'marked'
import { useAuth } from '../lib/auth.jsx'
import { supabase, isDirector } from '../lib/supabase'

export function embedUrl(url = '') {
  const yt = url.match(/(?:youtube\.com\/(?:watch\?v=|shorts\/)|youtu\.be\/)([\w-]{6,})/); if (yt) return `https://www.youtube.com/embed/${yt[1]}`
  const vm = url.match(/vimeo\.com\/(\d+)/); if (vm) return `https://player.vimeo.com/video/${vm[1]}`
  const lo = url.match(/loom\.com\/(?:share|embed)\/([\w]+)/); if (lo) return `https://www.loom.com/embed/${lo[1]}`
  const dr = url.match(/drive\.google\.com\/file\/d\/([\w-]+)/); if (dr) return `https://drive.google.com/file/d/${dr[1]}/preview`
  return null
}

export default function ModulePage() {
  const { id } = useParams()
  const [params] = useSearchParams()
  const nav = useNavigate()
  const { user, role } = useAuth()
  const [m, setM] = useState(null)
  const [edit, setEdit] = useState(params.get('edit') === '1')
  const [done, setDone] = useState(false)
  const [progress, setProgress] = useState([])
  const director = isDirector(role)

  async function load() {
    const { data } = await supabase.from('modules').select('*').eq('id', id).single(); setM(data)
    const { data: p } = await supabase.from('module_progress').select('user_id, completed_at, profiles(full_name)').eq('module_id', id)
    setProgress(p || []); setDone((p || []).some(x => x.user_id === user.id))
  }
  useEffect(() => { load() }, [id])

  const html = useMemo(() => m?.body ? marked.parse(m.body, { gfm: true }) : '', [m?.body])
  async function save(extra = {}) {
    const { id: _i, created_at, ...rest } = { ...m, ...extra, updated_at: new Date().toISOString() }
    const { error } = await supabase.from('modules').update(rest).eq('id', id)
    if (error) return alert(error.message)
    setM({ ...m, ...extra }); setEdit(false)
  }
  async function markDone() {
    await supabase.from('module_progress').upsert({ user_id: user.id, module_id: id }, { onConflict: 'user_id,module_id' })
    setDone(true); load()
  }

  if (!m) return <p className="muted">Loading…</p>
  const video = embedUrl(m.video_url || '')

  return (
    <>
      <div className="row between"><Link to="/method" className="small">← The Method</Link>{director && <div className="row" style={{ gap: 6 }}><button className="btn ghost small" onClick={() => setEdit(!edit)}>{edit ? 'Preview' : 'Edit'}</button><button className={`btn small ${m.published ? 'ghost' : 'gold'}`} onClick={() => save({ published: !m.published })}>{m.published ? 'Unpublish' : 'Publish'}</button></div>}</div>

      {edit && director ? (
        <div className="card editor">
          <label className="field"><span>Title</span><input className="input" value={m.title} onChange={e => setM({ ...m, title: e.target.value })} /></label>
          <label className="field"><span>One-line summary</span><input className="input" value={m.summary || ''} onChange={e => setM({ ...m, summary: e.target.value })} /></label>
          <label className="field"><span>Video link (YouTube, Vimeo, Loom or Google Drive)</span><input className="input" value={m.video_url || ''} onChange={e => setM({ ...m, video_url: e.target.value })} placeholder="https://youtu.be/…" /></label>
          <div className="row" style={{ gap: 8 }}>
            <label className="field" style={{ flex: 1 }}><span>Order</span><input className="input" type="number" value={m.sort ?? 0} onChange={e => setM({ ...m, sort: Number(e.target.value) })} /></label>
          </div>
          <label className="field"><span>Content (Markdown: ## for headings, - for bullets, 1. for steps, **bold**)</span><textarea className="input" value={m.body || ''} onChange={e => setM({ ...m, body: e.target.value })} /></label>
          <div className="row" style={{ gap: 8 }}><button className="btn" onClick={() => save()}>Save</button><button className="btn ghost" onClick={() => { setEdit(false); load() }}>Cancel</button>
            <button className="btn danger small" onClick={async () => { if (confirm('Delete this module?')) { await supabase.from('modules').delete().eq('id', id); nav('/method') } }}>Delete</button></div>
        </div>
      ) : (
        <>
          <h1>{m.title}</h1>
          {m.summary && <p className="muted">{m.summary}</p>}
          {video && <iframe className="video" src={video} title={m.title} allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture" allowFullScreen style={{ marginBottom: 12 }} />}
          {!video && m.video_url && <p><a href={m.video_url} target="_blank" rel="noreferrer">Watch the video ↗</a></p>}
          <article className="md" dangerouslySetInnerHTML={{ __html: html }} />
          <hr className="hr" />
          {done ? <p className="muted">You completed this module. ✓</p> : <button className="btn block" onClick={markDone}>I've completed this module</button>}
          {director && progress.length > 0 && <p className="small muted" style={{ marginTop: 10 }}>Completed by: {progress.map(p => p.profiles?.full_name).filter(Boolean).join(', ')}</p>}
        </>
      )}
    </>
  )
}
