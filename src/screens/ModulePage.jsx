import { useEffect, useMemo, useState } from 'react'
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { marked } from 'marked'
import { useAuth } from '../lib/auth.jsx'
import { supabase, isDirector, ROLES } from '../lib/supabase'
import { AUDIENCES } from './Method.jsx'

export function embedUrl(url = '') {
  const yt = url.match(/(?:youtube\.com\/(?:watch\?v=|shorts\/|embed\/)|youtu\.be\/)([\w-]{6,})/); if (yt) return `https://www.youtube.com/embed/${yt[1]}`
  const vm = url.match(/vimeo\.com\/(\d+)/); if (vm) return `https://player.vimeo.com/video/${vm[1]}`
  const lo = url.match(/loom\.com\/(?:share|embed)\/([\w]+)/); if (lo) return `https://www.loom.com/embed/${lo[1]}`
  const dr = url.match(/drive\.google\.com\/file\/d\/([\w-]+)/); if (dr) return `https://drive.google.com/file/d/${dr[1]}/preview`
  return null
}

// The fillable template. Coaches' modules follow the Method structure; sales and concession use the same shape with their own words.
const TEMPLATES = {
  coach: [
    ['objective', 'Objective', 'What a coach must be able to do after this module.'],
    ['principles', 'Key principles', 'The 3–5 ideas that drive this part of the method.'],
    ['structure', 'Session structure', 'Warm-up → activation → main block → game-realistic → cool-down. Minutes per block.'],
    ['drills', 'Drills', 'Name each drill, the setup, the constraint, and what we are watching for.'],
    ['cues', 'Coaching cues', 'The exact words we say. Short. Repeatable.'],
    ['mistakes', 'Common mistakes', 'What coaches get wrong when running this, and the fix.'],
    ['measure', 'How we measure it', 'What goes in the session log and the player report (CONF / TECH / EFF, focus areas).'],
  ],
  sales: [
    ['objective', 'Objective', 'What a salesperson must be able to do after this module.'],
    ['principles', 'Key principles', 'How we sell: integrity, speed to lead, the evaluation close.'],
    ['script', 'Script', 'The words, step by step: open, connect, diagnose, show the path, prove it, invite.'],
    ['objections', 'Objections and answers', 'Price, time, "let me think about it", "my kid already trains".'],
    ['process', 'Process in the app', 'Where to log calls, meetings and closes; what the end-of-day report needs.'],
    ['mistakes', 'Common mistakes', 'What loses the sale, and the fix.'],
    ['measure', 'How we measure it', '100 calls, 3–5 meetings, 2 closes a day; eval show rate; close rate.'],
  ],
  frontdesk: [
    ['objective', 'Objective', 'What the shift must deliver, every day.'],
    ['standard', 'The standard', 'What "done right" looks like for the gym, the concession and the guest experience.'],
    ['steps', 'Step by step', 'Opening, during the shift, closing. Match the checklist.'],
    ['videos', 'Videos', 'What to film, how many, how to post or hand off.'],
    ['guests', 'Rentals, parties and guests', 'Greeting, confirming end times, handling issues.'],
    ['mistakes', 'Common mistakes', 'What gets missed, and the fix.'],
    ['measure', 'How we measure it', 'Checklists complete, photos, 2 videos a day, incident-free close.'],
  ],
  newhire: [
    ['objective', 'Objective', 'What a new hire should know by the end of this module.'],
    ['content', 'Content', 'The material.'],
    ['measure', 'How we check it', 'The conversation or test at the end.'],
  ],
}
const templateFor = (audience = []) => TEMPLATES[audience.find(a => TEMPLATES[a]) || 'coach']

export default function ModulePage() {
  const { id } = useParams()
  const [params] = useSearchParams()
  const nav = useNavigate()
  const { user, roles } = useAuth()
  const [m, setM] = useState(null)
  const [edit, setEdit] = useState(params.get('edit') === '1')
  const [done, setDone] = useState(false)
  const [progress, setProgress] = useState([])
  const canEdit = isDirector(roles)

  async function load() {
    const { data } = await supabase.from('modules').select('*').eq('id', id).single(); setM(data)
    const { data: p } = await supabase.from('module_progress').select('user_id, completed_at, profiles(full_name)').eq('module_id', id)
    setProgress(p || []); setDone((p || []).some(x => x.user_id === user.id))
  }
  useEffect(() => { load() }, [id])

  const tpl = useMemo(() => templateFor(m?.audience), [m?.audience])
  const bodyHtml = useMemo(() => m?.body ? marked.parse(m.body, { gfm: true }) : '', [m?.body])
  const sec = k => m?.sections?.[k] || ''
  const setSec = (k, v) => setM({ ...m, sections: { ...(m.sections || {}), [k]: v } })
  const hasSections = tpl.some(([k]) => sec(k).trim())

  async function save(extra = {}) {
    const { id: _i, created_at, ...rest } = { ...m, ...extra, updated_at: new Date().toISOString() }
    const { error } = await supabase.from('modules').update(rest).eq('id', id)
    if (error) return alert(error.message)
    setM({ ...m, ...extra }); if (!('published' in extra)) setEdit(false)
  }
  async function markDone() {
    await supabase.from('module_progress').upsert({ user_id: user.id, module_id: id }, { onConflict: 'user_id,module_id' })
    setDone(true); load()
  }

  if (!m) return <p className="muted">Loading…</p>
  const video = embedUrl(m.video_url || '')

  return (
    <>
      <div className="row between"><Link to="/method" className="small">← {(m.audience || []).includes('coach') ? 'The Method' : 'Training'}</Link>{canEdit && <div className="row" style={{ gap: 6 }}><button className="btn ghost small" onClick={() => setEdit(!edit)}>{edit ? 'Preview' : 'Edit'}</button><button className={`btn small ${m.published ? 'ghost' : 'gold'}`} onClick={() => save({ published: !m.published })}>{m.published ? 'Unpublish' : 'Publish'}</button></div>}</div>

      {edit && canEdit ? (
        <div className="editor">
          <div className="card">
            <label className="field"><span>Title</span><input className="input" value={m.title} onChange={e => setM({ ...m, title: e.target.value })} /></label>
            <label className="field"><span>One-line summary</span><input className="input" value={m.summary || ''} onChange={e => setM({ ...m, summary: e.target.value })} /></label>
            <label className="field"><span>Video link (YouTube, Vimeo, Loom or Google Drive). Record on your phone, upload unlisted, paste the link.</span><input className="input" value={m.video_url || ''} onChange={e => setM({ ...m, video_url: e.target.value })} placeholder="https://youtu.be/…" /></label>
            <div className="row wrap" style={{ gap: 8 }}>
              <label className="field" style={{ flex: 1 }}><span>Who it's for</span><div className="chips">{AUDIENCES.map(([a, l]) => { const on = (m.audience || []).includes(a); return <button key={a} type="button" className={`chip gold ${on ? 'on' : ''}`} onClick={() => setM({ ...m, audience: on ? m.audience.filter(x => x !== a) : [...(m.audience || []), a] })}>{l}</button> })}</div></label>
              <label className="field" style={{ width: 90 }}><span>Order</span><input className="input" type="number" value={m.sort ?? 0} onChange={e => setM({ ...m, sort: Number(e.target.value) })} /></label>
            </div>
          </div>
          <div className="card accent">
            <h2>The module</h2>
            <p className="small muted">Fill in each part. Short and specific beats long. Leave a part empty and it won't show.</p>
            {tpl.map(([k, label, hint]) => (
              <label className="field" key={k}><span>{label}</span><textarea className="input" style={{ minHeight: 90 }} value={sec(k)} onChange={e => setSec(k, e.target.value)} placeholder={hint} /></label>
            ))}
            <label className="field"><span>Anything else (optional, Markdown)</span><textarea className="input" style={{ minHeight: 90 }} value={m.body || ''} onChange={e => setM({ ...m, body: e.target.value })} /></label>
          </div>
          <div className="row" style={{ gap: 8 }}><button className="btn" onClick={() => save()}>Save</button><button className="btn ghost" onClick={() => { setEdit(false); load() }}>Cancel</button>
            <button className="btn danger small" onClick={async () => { if (confirm('Delete this module?')) { await supabase.from('modules').delete().eq('id', id); nav('/method') } }}>Delete</button></div>
        </div>
      ) : (
        <>
          <h1>{m.title}</h1>
          <div className="row wrap" style={{ gap: 6, marginBottom: 8 }}>{(m.audience || []).map(a => <span key={a} className="pill gold">{ROLES[a] || a}</span>)}{!m.published && <span className="pill">draft</span>}</div>
          {m.summary && <p className="muted">{m.summary}</p>}
          {video && <iframe className="video" src={video} title={m.title} allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture" allowFullScreen style={{ marginBottom: 12 }} />}
          {!video && m.video_url && <p><a href={m.video_url} target="_blank" rel="noreferrer">Watch the video ↗</a></p>}
          {hasSections && tpl.map(([k, label]) => sec(k).trim() ? (
            <div className="card" key={k}><h2 style={{ marginTop: 0 }}>{label}</h2><div className="md" dangerouslySetInnerHTML={{ __html: marked.parse(sec(k), { gfm: true, breaks: true }) }} /></div>
          ) : null)}
          {m.body && <article className="md" dangerouslySetInnerHTML={{ __html: bodyHtml }} />}
          {!hasSections && !m.body && <p className="muted">This module is still being written.</p>}
          <hr className="hr" />
          {done ? <p className="muted">You completed this module. ✓</p> : <button className="btn block" onClick={markDone}>I've watched and read this module</button>}
          {canEdit && progress.length > 0 && <p className="small muted" style={{ marginTop: 10 }}>Completed by: {progress.map(p => p.profiles?.full_name).filter(Boolean).join(', ')}</p>}
        </>
      )}
    </>
  )
}
