import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'

// Run the day: Gabriel's NEXT LEVEL Calendar (today + the week ahead) and the daily task list.
const TZ = 'America/New_York'
const todayKey = () => { const p = new Intl.DateTimeFormat('en-US', { timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(new Date()); const g = t => p.find(x => x.type === t)?.value; return `${g('year')}-${g('month')}-${g('day')}` }
const shiftDay = (k, n) => { const d = new Date(k + 'T12:00:00Z'); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10) }
const dayLabel = (k, today) => k === today ? 'Today' : k === shiftDay(today, 1) ? 'Tomorrow' : new Date(k + 'T12:00:00').toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' })
const gcalDay = (k) => `https://calendar.google.com/calendar/r/day/${k.replace(/-/g, '/')}`
const mins = (a, b) => Math.round((new Date(b) - new Date(a)) / 60000)
const dur = (e) => { if (!e.end || e.allDay) return ''; const m = mins(e.start, e.end); return m >= 60 ? `${Math.floor(m / 60)}h${m % 60 ? ` ${m % 60}m` : ''}` : `${m}m` }

// where an event sits relative to right now
function status(e, now) {
  if (e.allDay) return 'allday'
  const s = new Date(e.start).getTime(), en = e.end ? new Date(e.end).getTime() : s + 3600e3
  return en <= now ? 'done' : s <= now ? 'now' : 'later'
}

function Event({ e, st, isNext, open, onOpen }) {
  return (
    <li className={`evt ${st} ${isNext ? 'next' : ''} ${open ? 'open' : ''}`} onClick={onOpen}>
      <span className="evt-time">{e.allDay ? 'All day' : e.time.split(' – ')[0]}</span>
      <span className="evt-bar" />
      <span className="grow">
        <div className="evt-title">{e.title}{st === 'now' && <span className="pill gold" style={{ marginLeft: 8 }}>Now</span>}{isNext && st === 'later' && <span className="pill" style={{ marginLeft: 8 }}>Next</span>}</div>
        <div className="small muted">{e.allDay ? '' : e.time}{dur(e) ? ` · ${dur(e)}` : ''}{e.location && !open ? ` · ${e.location}` : ''}</div>
        {open && (
          <div className="evt-more small">
            {e.location && <div>📍 {e.location}</div>}
            <a href={gcalDay(e.day)} target="_blank" rel="noreferrer" onClick={ev => ev.stopPropagation()}>Open in Google Calendar ↗</a>
          </div>
        )}
      </span>
    </li>
  )
}

function CalendarCard({ cal, onRefresh }) {
  const [view, setView] = useState('today')
  const [open, setOpen] = useState(null)
  const [now, setNow] = useState(Date.now())
  useEffect(() => { const t = setInterval(() => setNow(Date.now()), 60000); return () => clearInterval(t) }, [])
  if (!cal) return <div className="card"><h3 style={{ marginTop: 0 }}>Calendar</h3><p className="muted small">Loading calendar…</p></div>
  if (!cal.connected) return <div className="card"><h3 style={{ marginTop: 0 }}>Calendar</h3><p className="muted small" style={{ margin: 0 }}>{cal.hint || 'Not connected yet.'}</p></div>
  if (cal.error) return <div className="card"><h3 style={{ marginTop: 0 }}>Calendar</h3><p className="flag small" style={{ margin: 0 }}>{cal.error}</p></div>
  const today = cal.today, todays = cal.todayEvents || []
  const rest = (cal.days || []).filter(d => d.day !== today && d.events.length)
  const nextId = todays.find(e => status(e, now) === 'later')?.id
  const left = todays.filter(e => status(e, now) !== 'done').length
  return (
    <div className="card cal">
      <div className="row between wrap" style={{ gap: 8 }}>
        <div><h3 style={{ margin: 0 }}>Calendar</h3><div className="small muted">{cal.name || 'Google Calendar'}{view === 'today' && todays.length ? ` · ${left} of ${todays.length} still to come` : ''}</div></div>
        <div className="row" style={{ gap: 4 }}>
          <button className={`chip ${view === 'today' ? 'on' : ''}`} onClick={() => setView('today')}>Today</button>
          <button className={`chip ${view === 'week' ? 'on' : ''}`} onClick={() => setView('week')}>Next 7 days{rest.length ? ` · ${rest.reduce((a, d) => a + d.events.length, 0)}` : ''}</button>
          <button className="btn ghost small" title="Reload the calendar" onClick={onRefresh}>↻</button>
        </div>
      </div>
      {view === 'today' ? (
        todays.length === 0 ? <p className="muted small" style={{ margin: '12px 0 0' }}>Nothing on the calendar today. <a href={gcalDay(today)} target="_blank" rel="noreferrer">Open Google Calendar ↗</a></p> : (
          <ul className="list evts" style={{ marginTop: 8 }}>
            {todays.map(e => <Event key={e.id} e={e} st={status(e, now)} isNext={e.id === nextId} open={open === e.id} onOpen={() => setOpen(open === e.id ? null : e.id)} />)}
          </ul>
        )
      ) : (
        rest.length === 0 ? <p className="muted small" style={{ margin: '12px 0 0' }}>Nothing else this week.</p> : rest.map(d => (
          <div key={d.day} style={{ marginTop: 10 }}>
            <div className="small day-h"><b>{dayLabel(d.day, today)}</b><span className="muted"> · {d.events.length} event{d.events.length === 1 ? '' : 's'}</span></div>
            <ul className="list evts">{d.events.map(e => <Event key={e.id} e={e} st={e.allDay ? 'allday' : 'later'} open={open === e.id} onOpen={() => setOpen(open === e.id ? null : e.id)} />)}</ul>
          </div>
        ))
      )}
    </div>
  )
}

function TasksCard({ userId }) {
  const [tasks, setTasks] = useState(null)
  const [text, setText] = useState('')
  const [showDone, setShowDone] = useState(false)
  const today = todayKey()
  const load = async () => { const { data } = await supabase.from('ceo_tasks').select('*').or(`done.eq.false,due.gte.${shiftDay(today, -7)}`).order('due').order('sort').order('created_at'); setTasks(data || []) }
  useEffect(() => { load() }, [])
  async function add(e) {
    e.preventDefault(); const title = text.trim(); if (!title) return
    setText('')
    const { data } = await supabase.from('ceo_tasks').insert({ user_id: userId, title, due: today, sort: (tasks?.length || 0) + 1 }).select().single()
    if (data) setTasks([...(tasks || []), data])
  }
  const patch = async (t, p) => { setTasks(tasks.map(x => x.id === t.id ? { ...x, ...p } : x)); await supabase.from('ceo_tasks').update(p).eq('id', t.id) }
  const remove = async (t) => { setTasks(tasks.filter(x => x.id !== t.id)); await supabase.from('ceo_tasks').delete().eq('id', t.id) }
  if (!tasks) return <div className="card"><h3 style={{ marginTop: 0 }}>Daily tasks</h3><p className="muted small">Loading…</p></div>
  const open = tasks.filter(t => !t.done && t.due <= today), later = tasks.filter(t => !t.done && t.due > today), doneToday = tasks.filter(t => t.done && (t.done_at || '').slice(0, 10) === new Date().toISOString().slice(0, 10))
  const total = open.length + doneToday.length, pctDone = total ? Math.round(doneToday.length / total * 100) : 0
  const Row = ({ t, muted }) => (
    <li className={`task ${t.done ? 'done' : ''}`}>
      <button className={`check ${t.done ? 'on' : ''}`} aria-label={t.done ? 'Mark not done' : 'Mark done'} onClick={() => patch(t, { done: !t.done, done_at: !t.done ? new Date().toISOString() : null })}>{t.done ? '✓' : ''}</button>
      <span className="grow" style={{ color: t.done || muted ? 'var(--muted)' : 'var(--text)' }}>{t.title}{!t.done && t.due < today && <span className="pill bad" style={{ marginLeft: 8 }}>from {new Date(t.due + 'T12:00:00').toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}</span>}{!t.done && t.due > today && <span className="pill" style={{ marginLeft: 8 }}>{dayLabel(t.due, today)}</span>}</span>
      <span className="task-acts">
        {!t.done && t.due <= today && <button className="btn ghost small" title="Move to tomorrow" onClick={() => patch(t, { due: shiftDay(today, 1) })}>→ tmrw</button>}
        <button className="btn ghost small" title="Delete" onClick={() => remove(t)}>×</button>
      </span>
    </li>
  )
  return (
    <div className="card tasks">
      <div className="row between wrap" style={{ gap: 8 }}>
        <div><h3 style={{ margin: 0 }}>Daily tasks</h3><div className="small muted">{total === 0 ? 'nothing on the list yet' : open.length === 0 ? 'all done — nice' : `${open.length} open · ${doneToday.length} done today`}</div></div>
        {total > 0 && <div className="task-prog"><div className="progress"><div style={{ width: pctDone + '%' }} /></div><span className="small muted">{pctDone}%</span></div>}
      </div>
      <form onSubmit={add} className="row" style={{ gap: 6, marginTop: 12 }}><input className="input" style={{ flex: 1 }} placeholder="Add a task for today and press Enter" value={text} onChange={e => setText(e.target.value)} /><button className="btn small">Add</button></form>
      <ul className="list" style={{ marginTop: 6 }}>
        {open.map(t => <Row key={t.id} t={t} />)}
        {open.length === 0 && <li className="muted small" style={{ borderBottom: 'none' }}>{total ? 'Nothing left for today.' : 'Type a task above.'}</li>}
      </ul>
      {later.length > 0 && <><div className="small muted" style={{ marginTop: 8 }}>Coming up</div><ul className="list">{later.map(t => <Row key={t.id} t={t} muted />)}</ul></>}
      {doneToday.length > 0 && <><a className="small" style={{ cursor: 'pointer', display: 'inline-block', marginTop: 8 }} onClick={() => setShowDone(!showDone)}>{showDone ? 'Hide done' : `Done today (${doneToday.length})`}</a>{showDone && <ul className="list">{doneToday.map(t => <Row key={t.id} t={t} />)}</ul>}</>}
    </div>
  )
}

export default function TodayPanel({ userId, cal, onRefreshCal }) {
  return (
    <div className="grid" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: 10 }}>
      <CalendarCard cal={cal} onRefresh={onRefreshCal} />
      <TasksCard userId={userId} />
    </div>
  )
}
