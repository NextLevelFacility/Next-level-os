import { useEffect, useMemo, useState } from 'react'
import { callFn } from '../lib/api'
import { useAuth } from '../lib/auth.jsx'
import { isManager } from '../lib/supabase'

// Every evaluation and appointment booked in GoHighLevel, by day, with what happened to it.
const STATUS_TONE = { showed: 'good', 'no-show': 'bad', cancelled: '', confirmed: 'gold', booked: 'gold', new: 'gold' }
const dayKey = (iso) => { const d = new Date(iso); return new Date(d.getFullYear(), d.getMonth(), d.getDate()).toISOString().slice(0, 10) }
const dayLabel = (key) => { const d = new Date(key + 'T12:00:00'); const t = new Date(); const diff = Math.round((d - new Date(t.getFullYear(), t.getMonth(), t.getDate(), 12)) / 864e5); return (diff === 0 ? 'Today · ' : diff === 1 ? 'Tomorrow · ' : diff === -1 ? 'Yesterday · ' : '') + d.toLocaleDateString(undefined, { weekday: 'long', month: 'short', day: 'numeric' }) }

export default function Appointments() {
  const { roles } = useAuth()
  const [ghl, setGhl] = useState(null)
  const [cal, setCal] = useState('all')
  const [range, setRange] = useState('upcoming')   // upcoming | past
  useEffect(() => { callFn('ghl-summary').then(setGhl).catch(() => setGhl({ error: 'Could not load' })) }, [])

  const list = ghl?.appointments?.list || []
  const now = Date.now()
  const shown = useMemo(() => list.filter(e => cal === 'all' || e.calendar === cal).filter(e => range === 'upcoming' ? new Date(e.at) >= now - 3600e3 : new Date(e.at) < now - 3600e3), [list, cal, range])
  const groups = useMemo(() => { const g = {}; for (const e of shown) { const k = dayKey(e.at); (g[k] = g[k] || []).push(e) } return Object.entries(g).sort((a, b) => range === 'upcoming' ? a[0].localeCompare(b[0]) : b[0].localeCompare(a[0])) }, [shown, range])
  const calendars = ghl?.appointments?.calendars || []
  const m = ghl?.appointments?.month

  return (
    <>
      <h1>Appointments</h1>
      <p className="muted">Every evaluation booked in GoHighLevel. Mark showed / no-show in GHL and it updates here.</p>
      {!ghl ? <p className="muted">Loading…</p> : !ghl.connected ? <div className="card"><p className="muted" style={{ margin: 0 }}>GoHighLevel isn't connected yet.</p></div> : ghl.error ? <div className="card"><p className="flag" style={{ margin: 0 }}>{ghl.error}</p></div> : (
        <>
          <div className="grid" style={{ marginBottom: 10 }}>
            <div className="stat"><div className="label">Today</div><div className="value">{ghl.appointments.today}</div></div>
            <div className="stat"><div className="label">Next 7 days</div><div className="value">{ghl.appointments.upcoming7}</div></div>
            {m && <div className="stat"><div className="label">Showed · month</div><div className="value" style={{ color: 'var(--good)' }}>{m.showed}</div><div className="small muted">{m.noshow} no-shows{m.showRate != null ? ` · ${m.showRate}% show rate` : ''}</div></div>}
            {m && <div className="stat"><div className="label">Booked · month</div><div className="value">{m.booked}</div><div className="small muted">{m.cancelled} cancelled</div></div>}
          </div>
          {isManager(roles) && ghl.appointments.byCalendar?.length > 0 && (
            <div className="card"><h2 style={{ margin: 0 }}>By calendar · this month and ahead</h2><ul className="list">{ghl.appointments.byCalendar.map(([n, v]) => <li key={n}><span className="grow">{n}</span><span className="small muted">{v.showed} showed · {v.noshow} no-show</span><b>{v.booked}</b></li>)}</ul></div>
          )}
          <div className="row wrap" style={{ gap: 6, marginBottom: 10 }}>
            <button className={`chip ${range === 'upcoming' ? 'on' : ''}`} onClick={() => setRange('upcoming')}>Upcoming</button>
            <button className={`chip ${range === 'past' ? 'on' : ''}`} onClick={() => setRange('past')}>Past 30 days</button>
            <span style={{ width: 8 }} />
            <button className={`chip ${cal === 'all' ? 'on' : ''}`} onClick={() => setCal('all')}>All calendars</button>
            {calendars.map(c => <button key={c.id} className={`chip ${cal === c.name ? 'on' : ''}`} onClick={() => setCal(c.name)}>{c.name}</button>)}
          </div>
          {groups.length === 0 && <p className="muted">Nothing {range === 'upcoming' ? 'booked yet' : 'in this window'}.</p>}
          {groups.map(([k, items]) => (
            <div className="card" key={k}>
              <div className="row between"><h2 style={{ margin: 0 }}>{dayLabel(k)}</h2><span className="small muted">{items.length} booked</span></div>
              <ul className="list">
                {items.map(e => (
                  <li key={e.id}>
                    <span className="pill" style={{ minWidth: 76, justifyContent: 'center' }}>{new Date(e.at).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}</span>
                    <span className="grow"><div style={{ fontWeight: 500 }}>{e.title}</div><div className="small muted">{e.calendar}{e.with ? ` · ${e.with}` : ''}{e.notes ? ` · ${e.notes}` : ''}</div></span>
                    <span className={`pill ${STATUS_TONE[e.status] ?? ''}`}>{e.status}</span>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </>
      )}
    </>
  )
}
