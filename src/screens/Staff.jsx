import { useEffect, useMemo, useState } from 'react'
import { supabase, fmtDate } from '../lib/supabase'
import { callFn } from '../lib/api'

// Staff Files — one file per person from the employee onboarding form on Jotform. Owner only.
const SENSITIVE = /ssn|social security|tax id|\bitin\b|routing|account (number|#|no)|acct|bank account|license number|licence number|passport number|\bdob\b|date of birth|birth ?date/i
const IMG = /\.(jpe?g|png|webp|gif|heic)(\?|$)/i
const fileName = (u) => decodeURIComponent(u.split('/').pop().split('?')[0])
const initials = (n) => n.split(/\s+/).filter(Boolean).slice(0, 2).map(w => w[0]).join('').toUpperCase()

// Fetches a Jotform upload through the server (it needs the API key) and turns it into a local link.
const blobCache = new Map()
async function fileUrl(url) {
  if (blobCache.has(url)) return blobCache.get(url)
  const p = (async () => {
    const { data } = await supabase.auth.getSession()
    const r = await fetch(`/.netlify/functions/jotform-file?url=${encodeURIComponent(url)}`, { headers: { Authorization: `Bearer ${data?.session?.access_token || ''}` } })
    if (!r.ok) { let m = `HTTP ${r.status}`; try { m = (await r.json()).error || m } catch {} throw new Error(m) }
    return URL.createObjectURL(await r.blob())
  })()
  blobCache.set(url, p); p.catch(() => blobCache.delete(url))
  return p
}

function Img({ url, className, alt, fallback }) {
  const [src, setSrc] = useState(null), [err, setErr] = useState(false)
  useEffect(() => { let on = true; setSrc(null); setErr(false); if (url) fileUrl(url).then(s => on && setSrc(s)).catch(() => on && setErr(true)); return () => { on = false } }, [url])
  if (!url || err) return fallback || null
  return src ? <img src={src} alt={alt || ''} className={className} /> : <div className={`${className} staff-ph`} />
}

function FileLink({ url }) {
  const [busy, setBusy] = useState(false)
  const open = async () => { setBusy(true); try { window.open(await fileUrl(url), '_blank') } catch (e) { alert(e.message) } setBusy(false) }
  return <button className="btn ghost small" onClick={open} disabled={busy}>{busy ? 'Opening…' : `Open ${fileName(url)}`}</button>
}

function Field({ f }) {
  const [show, setShow] = useState(false)
  if (f.value.files) return (
    <div className="staff-field"><div className="small muted">{f.label}</div>
      <div className="staff-files">{f.value.files.map(u => IMG.test(u)
        ? <a key={u} onClick={async () => window.open(await fileUrl(u), '_blank')} style={{ cursor: 'pointer' }}><Img url={u} className="staff-thumb" alt={f.label} fallback={<FileLink url={u} />} /></a>
        : <FileLink key={u} url={u} />)}</div>
    </div>)
  const secret = SENSITIVE.test(f.label)
  return (
    <div className="staff-field"><div className="small muted">{f.label}</div>
      <div className="row" style={{ gap: 8, alignItems: 'flex-start' }}>
        <div style={{ whiteSpace: 'pre-wrap', wordBreak: 'break-word', flex: 1 }}>{secret && !show ? '•••• ' + String(f.value).slice(-4).replace(/./g, '•') : f.value}</div>
        {secret && <button className="btn ghost small" onClick={() => setShow(!show)}>{show ? 'Hide' : 'Show'}</button>}
      </div>
    </div>)
}

export default function Staff() {
  const [d, setD] = useState(null)
  const [q, setQ] = useState('')
  const [open, setOpen] = useState(null)
  const load = () => { setD(null); callFn('jotform-staff').then(setD) }
  useEffect(load, [])

  const people = useMemo(() => (d?.people || []).filter(p => !q || `${p.name} ${p.role} ${p.email} ${p.phone}`.toLowerCase().includes(q.toLowerCase())), [d, q])
  const person = open && d?.people?.find(p => p.id === open)

  if (person) return (
    <>
      <div className="row between"><button className="btn ghost small" onClick={() => setOpen(null)}>← All staff</button><button className="btn ghost small" onClick={() => window.print()}>Print</button></div>
      <div className="card accent staff-head">
        <Img url={person.photo} className="staff-photo lg" alt={person.name} fallback={<div className="staff-photo lg staff-ph">{initials(person.name)}</div>} />
        <div>
          <h1 style={{ margin: 0 }}>{person.name}</h1>
          {person.role && <div className="pill gold" style={{ marginTop: 6 }}>{person.role}</div>}
          <div className="small muted" style={{ marginTop: 8 }}>{[person.phone, person.email].filter(Boolean).join(' · ')}</div>
          <div className="small muted">Onboarding form submitted {fmtDate(person.submittedAt?.slice(0, 10))}</div>
        </div>
      </div>
      <div className="card">
        <h2>Everything on file</h2>
        {person.fields.map(f => <Field key={f.qid} f={f} />)}
      </div>
    </>
  )

  return (
    <>
      <div className="row between"><h1>Staff files</h1><button className="btn ghost small" onClick={load}>Refresh</button></div>
      <p className="muted">Everyone who filled out the onboarding form on Jotform{d?.formTitle ? <> (<b>{d.formTitle}</b>)</> : ''}. Tap a person for their full file — photo, documents and every answer. Only you (Owner) can see this page.</p>

      {!d && <div className="card muted">Loading from Jotform…</div>}
      {d && d.connected === false && <div className="card"><b>Jotform isn't connected yet.</b><p className="small muted">{d.hint}</p></div>}
      {d?.error && <div className="card"><b>Couldn't load staff files.</b><p className="small muted">{d.error}</p>
        {d.forms?.length > 0 && <><p className="small">Your forms:</p><ul className="list">{d.forms.map(f => <li key={f.id} className="small"><span className="grow">{f.title}</span><code>{f.id}</code></li>)}</ul></>}</div>}

      {d?.people && <>
        <input className="input" placeholder="Search by name, role, phone…" value={q} onChange={e => setQ(e.target.value)} style={{ marginBottom: 12 }} />
        <div className="staff-grid">
          {people.map(p => (
            <button key={p.id} className="card staff-card" onClick={() => { setOpen(p.id); window.scrollTo(0, 0) }}>
              <Img url={p.photo} className="staff-photo" alt={p.name} fallback={<div className="staff-photo staff-ph">{initials(p.name)}</div>} />
              <div className="staff-name">{p.name}</div>
              {p.role && <div className="small muted">{p.role}</div>}
              <div className="small muted">{p.phone}</div>
            </button>
          ))}
        </div>
        {people.length === 0 && <div className="card muted small">{q ? 'No one matches that search.' : 'No onboarding submissions yet.'}</div>}
      </>}
    </>
  )
}
