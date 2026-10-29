import { useEffect, useMemo, useState } from 'react'
import { Link, useParams, useNavigate } from 'react-router-dom'
import { useAuth } from '../lib/auth.jsx'
import { supabase, ROLES, isDirector, isManager } from '../lib/supabase'
import { useSops, STATUS } from '../lib/sops'
import { render } from '../lib/vault'
import { embedUrl } from './ModulePage.jsx'

const ROLE_PICK = ['coach', 'sales', 'frontdesk', 'director', 'operator']

// One SOP: video on top, the written procedure, "I've read this". Directors flip to Edit and rewrite it right here.
export default function SopPage() {
  const { key: rawKey } = useParams()
  const key = decodeURIComponent(rawKey)
  const { user, roles } = useAuth()
  const { sops, loading, reload } = useSops()
  const nav = useNavigate()
  const sop = sops.find(s => s.key === key)
  const canEdit = isDirector(roles)
  const [edit, setEdit] = useState(false)
  const [form, setForm] = useState(null)
  const [readAt, setReadAt] = useState(null)
  const [readers, setReaders] = useState([])
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    window.scrollTo(0, 0)
    supabase.from('sop_reads').select('read_at').eq('user_id', user.id).eq('sop_path', key).maybeSingle().then(({ data }) => setReadAt(data?.read_at || null))
    if (isManager(roles)) supabase.from('sop_reads').select('read_at, profiles(full_name)').eq('sop_path', key).then(({ data }) => setReaders(data || []))
  }, [key, user.id])
  useEffect(() => { setForm(null); setEdit(false) }, [key])
  useEffect(() => { if (sop && !form) setForm({ title: sop.title, roles: sop.roles, video_url: sop.video_url || '', body: sop.body ?? sop.outline, status: sop.status === 'outline' ? 'draft' : sop.status }) }, [sop?.key, sop?.doc?.updated_at, form])

  const html = useMemo(() => sop ? render({ body: sop.body || sop.outline || '_Nothing written yet._' }) : '', [sop?.body, sop?.outline])
  if (loading) return <p className="muted">Loading…</p>
  if (!sop) return <div className="empty">That SOP doesn't exist. <Link to="/sops">Back to SOP Studio</Link></div>

  async function save(extra = {}) {
    setSaving(true)
    const payload = { key, dept: sop.dept, title: form.title.trim(), roles: form.roles, video_url: form.video_url.trim() || null, body: form.body, status: form.status, sort: sop.sort || 0, updated_by: user.id, updated_at: new Date().toISOString(), ...extra }
    const { error } = await supabase.from('sop_docs').upsert(payload, { onConflict: 'key' })
    setSaving(false)
    if (error) return alert(error.message)
    await reload(); setEdit(false)
  }
  async function resetToVault() {
    if (!confirm('Throw away the rewrite and video, and go back to the vault outline?')) return
    await supabase.from('sop_docs').delete().eq('key', key)
    if (sop.custom) return nav('/sops')
    setForm(null); await reload(); setEdit(false)
  }
  async function markRead() {
    await supabase.from('sop_reads').upsert({ user_id: user.id, sop_path: key }, { onConflict: 'user_id,sop_path' })
    setReadAt(new Date().toISOString())
  }

  const video = embedUrl(edit ? form?.video_url || '' : sop.video_url || '')
  const [label, tone] = STATUS[sop.status] || STATUS.outline

  return (
    <>
      <div className="row between wrap">
        <Link to={canEdit ? '/sops' : '/playbook'} className="small">← {canEdit ? 'SOP Studio' : 'Playbook'} · {sop.dept}</Link>
        {canEdit && <div className="row" style={{ gap: 6 }}>
          <button className="btn ghost small" onClick={() => setEdit(!edit)}>{edit ? 'Preview' : sop.body ? 'Edit' : 'Write it'}</button>
          {sop.status !== 'published' && sop.body && !edit && <button className="btn gold small" onClick={() => save({ status: 'published' })}>Publish</button>}
          {sop.status === 'published' && !edit && <button className="btn ghost small" onClick={() => save({ status: 'draft' })}>Unpublish</button>}
        </div>}
      </div>

      {edit && canEdit && form ? (
        <div className="editor">
          <div className="card">
            <label className="field"><span>SOP name</span><input className="input" value={form.title} onChange={e => setForm({ ...form, title: e.target.value })} /></label>
            <div className="row wrap" style={{ gap: 6, alignItems: 'center', marginBottom: 10 }}>
              <span className="small muted">Who must read it:</span>
              {ROLE_PICK.map(r => { const on = form.roles.includes(r); return <button key={r} type="button" className={`chip gold ${on ? 'on' : ''}`} onClick={() => setForm({ ...form, roles: on ? form.roles.filter(x => x !== r) : [...form.roles, r] })}>{ROLES[r]}</button> })}
            </div>
            <label className="field"><span>Video (YouTube, Vimeo, Loom or Google Drive link). Record it on your phone, upload unlisted, paste the link.</span><input className="input" value={form.video_url} onChange={e => setForm({ ...form, video_url: e.target.value })} placeholder="https://youtu.be/…" /></label>
            {video && <iframe className="video" src={video} title={form.title} allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture" allowFullScreen style={{ marginBottom: 12 }} />}
            <label className="field"><span>The SOP (Markdown: # headings, - bullets, 1. steps, **bold**). Started from the vault outline.</span><textarea className="input" value={form.body} onChange={e => setForm({ ...form, body: e.target.value })} /></label>
            <div className="row wrap" style={{ gap: 8, alignItems: 'center' }}>
              <select className="input" style={{ width: 'auto', minHeight: 36, padding: '6px 10px' }} value={form.status} onChange={e => setForm({ ...form, status: e.target.value })}><option value="draft">Draft (only directors see it)</option><option value="published">Published (team sees it)</option></select>
              <button className="btn" disabled={saving} onClick={() => save()}>{saving ? 'Saving…' : 'Save'}</button>
              <button className="btn ghost" onClick={() => setEdit(false)}>Cancel</button>
              {sop.doc && <button className="btn danger small" style={{ marginLeft: 'auto' }} onClick={resetToVault}>{sop.custom ? 'Delete SOP' : 'Back to vault outline'}</button>}
            </div>
          </div>
          <div className="card">
            <div className="small muted" style={{ marginBottom: 6 }}>Preview</div>
            <article className="md"><h1>{form.title}</h1><div dangerouslySetInnerHTML={{ __html: render({ body: form.body || '' }) }} /></article>
          </div>
        </div>
      ) : (
        <>
          <div className="row wrap" style={{ gap: 6, margin: '8px 0' }}>
            <span className={`pill ${tone}`}>{label}</span>
            {sop.roles.map(r => <span key={r} className="pill gold">{ROLES[r]}</span>)}
            {sop.doc?.updated_at && <span className="pill">updated {new Date(sop.doc.updated_at).toLocaleDateString()}</span>}
          </div>
          {!sop.body && <div className="callout"><div className="ct">Not written yet</div>This is the outline from the vault. {canEdit ? 'Hit "Write it" to turn it into the real SOP and add a video.' : 'Your manager is writing the full version.'}</div>}
          {video && <iframe className="video" src={video} title={sop.title} allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture" allowFullScreen style={{ marginBottom: 12 }} />}
          <article className="md"><h1>{sop.title}</h1><div dangerouslySetInnerHTML={{ __html: html }} /></article>
          <hr className="hr" />
          {readAt
            ? <p className="muted">You marked this read on {new Date(readAt).toLocaleDateString()}.</p>
            : <button className="btn block" onClick={markRead}>I've read this and I'll follow it</button>}
          {isManager(roles) && readers.length > 0 && <p className="small muted">Read by: {readers.map(r => r.profiles?.full_name).filter(Boolean).join(', ')}</p>}
        </>
      )}
    </>
  )
}
