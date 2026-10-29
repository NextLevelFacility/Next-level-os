import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '../lib/supabase'

// Clinics and camps straight from PushPress events: who reserved a spot, counted live. Goals come from the Clinics page.
export const CLINIC_RE = /clinic|camp|thanksgiving|winter|spring|summer|blueprint|boot ?camp/i
export const fmtRange = (a, b) => { const s = new Date(a), e = new Date(b); const f = (d) => d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' }); return s.toDateString() === e.toDateString() ? f(s) : `${f(s)} – ${f(e)}` }
export const phase = (c) => { const now = Date.now(), s = new Date(c.starts).getTime(), e = new Date(c.ends).getTime(); return e < now ? 'done' : s <= now ? 'running' : 'upcoming' }

export function useClinicGoals() {
  const [goals, setGoals] = useState([])
  useEffect(() => { supabase.from('events').select('*').eq('active', true).then(({ data }) => setGoals(data || [])) }, [])
  return goals
}
export const goalFor = (c, goals) => goals.find(g => g.keyword && c.title.toLowerCase().includes(g.keyword.toLowerCase())) || goals.find(g => c.title.toLowerCase().includes(g.name.toLowerCase().replace(/ clinic| camp.*$/i, '').toLowerCase()))

export default function ClinicsCard({ pp, full = false }) {
  const goals = useClinicGoals()
  const [open, setOpen] = useState(null)
  if (!pp) return <><h2>Clinics & camps · PushPress</h2><p className="muted">Loading…</p></>
  const list = (pp.clinics || []).filter(c => full || CLINIC_RE.test(c.title) || c.signups > 0).filter(c => phase(c) !== 'done' || full)
  return (
    <>
      <div className="row between wrap"><h2 style={{ marginTop: 18 }}>Clinics & camps · PushPress</h2>{!full && <Link to="/clinics" className="small">Open</Link>}</div>
      {pp.clinicErr && <p className="flag small">{pp.clinicErr}</p>}
      {list.length === 0 ? <div className="card"><p className="muted" style={{ margin: 0 }}>No upcoming clinic or camp events in PushPress. Create the event in PushPress (Calendar → Events) and sign-ups show here automatically.</p></div> : (
        <div className="card">
          {list.map(c => {
            const g = goalFor(c, goals); const cap = g?.capacity || g?.goal_signups || 0; const pctv = cap ? Math.min(100, Math.round(c.signups / cap * 100)) : 0; const ph = phase(c)
            return (
              <div key={c.title} style={{ padding: '10px 0', borderBottom: '1px solid var(--line)' }}>
                <div className="row between wrap" style={{ gap: 8 }}>
                  <div><span style={{ fontWeight: 500 }}>{c.title}</span> {ph === 'running' && <span className="pill good">Running</span>}{g?.push_from && ph === 'upcoming' && new Date(g.push_from) <= new Date() && <span className="pill gold">Pushing now</span>}</div>
                  <span className="display" style={{ fontSize: '1.05rem', color: cap && pctv >= 100 ? 'var(--good)' : 'var(--text)' }}>{c.signups}<span className="muted" style={{ fontSize: '0.85rem', fontWeight: 500 }}>{cap ? ` / ${cap}` : ' signed up'}</span></span>
                </div>
                {cap > 0 && <div className="progress" style={{ marginTop: 6 }}><div style={{ width: pctv + '%' }} /></div>}
                <div className="small muted" style={{ marginTop: 4 }}>{fmtRange(c.starts, c.ends)} · {c.sessions} session{c.sessions === 1 ? '' : 's'}{g?.goal_signups ? ` · goal ${g.goal_signups}` : ''}{c.names?.length ? <> · <a onClick={() => setOpen(open === c.title ? null : c.title)} style={{ cursor: 'pointer', color: 'var(--text)' }}>{open === c.title ? 'hide names' : 'who'}</a></> : null}</div>
                {open === c.title && <div className="small" style={{ marginTop: 6 }}>{c.names.join(' · ')}</div>}
              </div>
            )
          })}
        </div>
      )}
    </>
  )
}
