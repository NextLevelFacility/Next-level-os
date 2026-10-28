import { useEffect, useState } from 'react'
import { useAuth } from '../lib/auth.jsx'
import { supabase, hours } from '../lib/supabase'

const weekStart = () => { const d = new Date(); d.setHours(0, 0, 0, 0); d.setDate(d.getDate() - ((d.getDay() + 6) % 7)); return d.toISOString() }

export default function Clock() {
  const { user, locationId } = useAuth()
  const [open, setOpen] = useState(null)      // the running entry
  const [week, setWeek] = useState([])
  const [tick, setTick] = useState(0)

  async function load() {
    const { data } = await supabase.from('time_entries').select('*').eq('user_id', user.id).gte('clock_in', weekStart()).order('clock_in', { ascending: false })
    setWeek(data || [])
    setOpen((data || []).find(e => !e.clock_out) || null)
  }
  useEffect(() => { load() }, [user.id])
  useEffect(() => { const t = setInterval(() => setTick(x => x + 1), 30000); return () => clearInterval(t) }, [])

  async function clockIn() {
    const { data, error } = await supabase.from('time_entries').insert({ user_id: user.id, location_id: locationId }).select().single()
    if (error) return alert(error.message)
    setOpen(data); load()
  }
  async function clockOut() {
    const { error } = await supabase.from('time_entries').update({ clock_out: new Date().toISOString() }).eq('id', open.id)
    if (error) return alert(error.message)
    setOpen(null); load()
  }

  const now = Date.now()
  const runningMs = open ? now - new Date(open.clock_in).getTime() : 0
  const weekMs = week.reduce((a, e) => a + ((e.clock_out ? new Date(e.clock_out) : new Date()) - new Date(e.clock_in)), 0)

  return (
    <div className={`card ${open ? 'accent' : ''}`}>
      <div className="clock">
        <div>
          <div className="small muted" style={{ textTransform: 'uppercase', letterSpacing: '0.08em' }}>{open ? 'On the clock since ' + new Date(open.clock_in).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' }) : 'Off the clock'}</div>
          <div className={`big ${open ? 'live' : ''}`}>{open ? hours(runningMs) + ' h' : '—'}</div>
          <div className="small muted">{hours(weekMs)} h this week</div>
        </div>
        {open
          ? <button className="btn danger" onClick={clockOut}>Clock out</button>
          : <button className="btn good" onClick={clockIn}>Clock in</button>}
      </div>
    </div>
  )
}
