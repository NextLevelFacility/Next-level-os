import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { visibleNotes } from '../lib/vault'
import { roleMatches } from './Today.jsx'
import { ROLES, isManager } from '../lib/supabase'
import { supabase } from '../lib/supabase'
import { useAuth } from '../lib/auth.jsx'
import { useSops, sopFor } from '../lib/sops'

export default function Playbook() {
  const { user, roles } = useAuth()
  const { sops: allSops } = useSops()
  const notes = visibleNotes(roles)
  const folders = [...new Set(notes.map(n => n.folder))].filter(Boolean).sort()
  const [q, setQ] = useState('')
  const [reads, setReads] = useState(new Set())
  useEffect(() => {
    supabase.from('sop_reads').select('sop_path').eq('user_id', user.id).then(({ data }) => setReads(new Set((data || []).map(x => x.sop_path))))
  }, [user.id])

  const ql = q.trim().toLowerCase()
  const match = n => !ql || n.title.toLowerCase().includes(ql) || n.body.toLowerCase().includes(ql) || n.tags.some(t => t.includes(ql))
  const groups = [...folders, ''].map(f => [f, notes.filter(n => n.folder === f && match(n))]).filter(([, l]) => l.length)
  const mine = isManager(roles) ? [] : notes.filter(n => match(n) && roleMatches(n, roles) && !/template/i.test(n.title))
  const liveSops = sopFor(allSops.filter(s => s.status === 'published'), roles).filter(s => !ql || s.title.toLowerCase().includes(ql) || (s.body || '').toLowerCase().includes(ql))
  const mineRead = mine.filter(n => reads.has(n.path)).length + liveSops.filter(s => reads.has(s.key)).length
  const mineTotal = mine.length + liveSops.length

  return (
    <>
      <h1>Playbook</h1>
      <p className="muted">The standards and procedures Next Level runs on.</p>
      <input className="input" placeholder="Search the playbook…" value={q} onChange={e => setQ(e.target.value)} style={{ marginBottom: 14 }} />
      {mineTotal > 0 && (
        <div className="card accent">
          <div className="row between"><h2>For you · {roles.map(r => ROLES[r]).join(' + ')}</h2><span className={`pill ${mineRead === mineTotal ? 'good' : 'gold'}`}>{mineRead}/{mineTotal} read</span></div>
          <p className="small muted">The SOPs your role runs on. Read each one and mark it; your manager sees what's been read.</p>
          <ul className="list">
            {liveSops.map(s => (
              <li key={s.key}>
                <span className={`check ${reads.has(s.key) ? 'on' : ''}`} style={reads.has(s.key) ? { background: 'var(--good)', borderColor: 'var(--good)', color: '#0A0A0A' } : {}}>{reads.has(s.key) ? '✓' : ''}</span>
                <span className="grow"><Link to={`/sop/${encodeURIComponent(s.key)}`} className="title" style={{ color: 'var(--text)' }}>{s.title}</Link><div className="small muted">{s.dept}{s.video_url ? ' · ▶ video' : ''}</div></span>
                <Link className="btn ghost small" to={`/sop/${encodeURIComponent(s.key)}`}>{reads.has(s.key) ? 'Open' : 'Read'}</Link>
              </li>
            ))}
            {mine.map(n => (
              <li key={n.path}>
                <span className={`check ${reads.has(n.path) ? 'on' : ''}`} style={reads.has(n.path) ? { background: 'var(--good)', borderColor: 'var(--good)', color: '#0A0A0A' } : {}}>{reads.has(n.path) ? '✓' : ''}</span>
                <span className="grow"><Link to={`/playbook/${n.slug}`} className="title" style={{ color: 'var(--text)' }}>{n.title}</Link><div className="small muted">{n.folder.replace(/^\d+ - /, '')}</div></span>
                <Link className="btn ghost small" to={`/playbook/${n.slug}`}>{reads.has(n.path) ? 'Open' : 'Read'}</Link>
              </li>
            ))}
          </ul>
        </div>
      )}
      {groups.map(([folder, list]) => (
        <div className="card" key={folder || 'root'}>
          <h2>{folder ? folder.replace(/^\d+ - /, '') : 'Home'}</h2>
          <ul className="list">
            {list.map(n => (
              <li key={n.path}>
                <span className="grow">
                  <Link to={`/playbook/${n.slug}`} className="title" style={{ color: 'var(--text)' }}>{n.title}</Link>
                  <div className="row wrap small" style={{ gap: 6, marginTop: 2 }}>
                    {n.meta.status && <span className={`pill ${n.meta.status === 'approved' ? 'good' : ''}`}>{n.meta.status}</span>}
                    {n.meta.owner && <span className="muted">· {n.meta.owner}</span>}
                  </div>
                </span>
                {reads.has(n.path) && <span className="pill good">read</span>}
              </li>
            ))}
          </ul>
        </div>
      ))}
    </>
  )
}
