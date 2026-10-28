import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { notes, folders } from '../lib/vault'
import { supabase } from '../lib/supabase'
import { useAuth } from '../lib/auth.jsx'

export default function Playbook() {
  const { user } = useAuth()
  const [q, setQ] = useState('')
  const [reads, setReads] = useState(new Set())
  useEffect(() => {
    supabase.from('sop_reads').select('sop_path').eq('user_id', user.id).then(({ data }) => setReads(new Set((data || []).map(x => x.sop_path))))
  }, [user.id])

  const ql = q.trim().toLowerCase()
  const match = n => !ql || n.title.toLowerCase().includes(ql) || n.body.toLowerCase().includes(ql) || n.tags.some(t => t.includes(ql))
  const groups = [...folders, ''].map(f => [f, notes.filter(n => n.folder === f && match(n))]).filter(([, l]) => l.length)

  return (
    <>
      <h1>Playbook</h1>
      <p className="muted">Every SOP, standard and belief. Written once, followed everywhere.</p>
      <input className="input" placeholder="Search the playbook…" value={q} onChange={e => setQ(e.target.value)} style={{ marginBottom: 14 }} />
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
