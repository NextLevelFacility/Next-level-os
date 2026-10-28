import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { supabase, today, fmtDate } from '../lib/supabase'
import { money } from '../lib/api'

export const daysUntil = (d) => d ? Math.ceil((new Date(d + 'T12:00:00') - new Date(today() + 'T12:00:00')) / 864e5) : null
export const phaseOf = (e) => {
  const t = today()
  if (e.ends_on && t > e.ends_on) return 'done'
  if (e.starts_on && t >= e.starts_on) return 'live'
  if (e.push_from && t >= e.push_from) return 'pushing'
  return 'upcoming'
}

export function useEvents() {
  const [events, setEvents] = useState([])
  const load = async () => {
    const { data } = await supabase.from('events').select('*, event_registrations(amount, paid)').eq('active', true).order('sort').order('starts_on')
    setEvents((data || []).map(e => ({ ...e, signups: e.event_registrations.length, revenue: e.event_registrations.reduce((a, r) => a + (Number(r.amount) || 0), 0) })))
  }
  useEffect(() => { load() }, [])
  return [events, load]
}

export default function ClinicBoard({ compact = false }) {
  const [events] = useEvents()
  const shown = events.filter(e => phaseOf(e) !== 'done')
  if (shown.length === 0) return null
  const pushing = shown.find(e => phaseOf(e) === 'pushing' || phaseOf(e) === 'live') || shown[0]

  return (
    <div className="card accent">
      <div className="row between"><h2>Clinics · live count</h2><Link to="/clinics" className="small">Board</Link></div>
      {shown.map(e => {
        const ph = phaseOf(e), d = daysUntil(e.starts_on), cap = e.capacity || e.goal_signups || 0
        const pct = cap ? Math.min(100, Math.round(e.signups / cap * 100)) : 0
        const isPush = e.id === pushing.id
        return (
          <div key={e.id} style={{ padding: '10px 0', borderBottom: '1px solid var(--line)' }}>
            <div className="row between">
              <div><span style={{ fontWeight: 600 }}>{e.name}</span> {isPush && ph !== 'live' && <span className="pill pink">PUSHING NOW</span>}{ph === 'live' && <span className="pill good">LIVE</span>}{ph === 'upcoming' && <span className="pill">push from {fmtDate(e.push_from)}</span>}</div>
              <span className="display" style={{ fontSize: '1.6rem', color: pct >= 100 ? 'var(--good)' : 'var(--pink)' }}>{e.signups}<span className="muted" style={{ fontSize: '0.9rem' }}> / {cap || '—'}</span></span>
            </div>
            <div className="progress" style={{ marginTop: 6 }}><div style={{ width: pct + '%' }} /></div>
            <div className="small muted" style={{ marginTop: 4 }}>{fmtDate(e.starts_on)}{e.ends_on ? ` – ${fmtDate(e.ends_on)}` : ''}{d != null && d >= 0 ? ` · ${d} days out` : ''}{!compact && e.revenue ? ` · ${money(e.revenue)} collected` : ''}{e.goal_signups ? ` · goal ${e.goal_signups}` : ''}</div>
          </div>
        )
      })}
      {!compact && <Link to="/clinics" className="btn gold small" style={{ marginTop: 10 }}>+ Add a sign-up</Link>}
    </div>
  )
}
