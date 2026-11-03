import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { callFn } from '../lib/api'

// Run the day: Gabriel's NEXT LEVEL Calendar (today + the week ahead) and the daily task list.
const TZ = 'America/New_York'
const todayKey = () => { const p = new Intl.DateTimeFormat('en-US', { timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(new Date()); const g = t => p.find(x => x.type === t)?.value; return `${g('year')}-${g('month')}-${g('day')}` }
const shiftDay = (k, n) => { const d = new Date(k + 'T12:00:00Z'); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10) }
const dayLabel = (k, today) => k === today ? 'Today' : k === shiftDay(today, 1) ? 'Tomorrow' : new Date(k + 'T12:00:00').toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' })

function CalendarCard({ cal, onRefresh }) {
  const [open, setOpen] = useState(false)
  if (!cal) return <div className="card"><h3 style={{ marginTop: 0 }}>Calendar</h3><p className="muted small">Loading calendar…</p></div>
  if (!cal.connected) return <div className="card"><h3 style={{ marginTop: 0 }}>Calendar</h3><p className="muted small" style={{ margin: 0 }}>{cal.hint || 'Not connected yet.'}</p></div>
  if (cal.error) return <div className="card"><h3 style={{ marginTop: 0 }}>Calendar</h3><p className="flag small" style={{ margin: 0 }}>{cal.error}</p></div>
  const today = cal.today, rest = (cal.days || []).filter(d => d.day !== today && d.events.length)
  return (
    <div className="card">
      <div className="row between wrap"><h3 style={{ margin: 0 }}>Today · {cal.name || 'Calendar'}</h3><div className="row" style={{ gap: 6 }}><a className="small" href="https://calendar.google.com" target="_blank" rel="noreferrer">Open calendar</a><button className="btn ghost small" onClick={onRefresh}>Refresh</button></div></div>
      {cal.todayEvents.length === 0 ? <p className="muted small" style={{ margin: '10px 0 0' }}>Nothing on the calendar today.</p> : (
        <ul className="list" style={{ marginTop: 6 }}>
          {cal.todayEvents.map(e => <li key={e.id}><span className="small muted" style={{ minWidth: 118 }}>{e.time}</span><span className="grow"><div style={{ fontWeight: 500 }}>{e.title}</div>{e.location && <div className="small muted">{e.location}</div>}</span></li>)}
        </ul>
      )}
      {rest.length > 0 && (
        <>
          <a className="small" style={{ cursor: 'pointer', display: 'inline-block', marginTop: 8 }} onClick={() => setOpen(!open)}>{open ? 'Hide the week' : `Next 7 days · ${rest.reduce((a, d) => a + d.events.length, 0)} events`}</a>
          {open && rest.map(d => (
            <div key={d.day} style={{ marginTop: 8 }}>
              <div className="small" style={{ fontWeight: 600 }}>{dayLabel(d.day, today)}</div>
              <ul className="list">{d.events.map(e => <li key={e.id} style={{ padding: '6px 0' }}><span className="small muted" style={{ minWidth: 118 }}>{e.time}</span><span className="grow small">{e.title}</span></li>)}</ul>
            </div>
          ))}
        </>
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
  const Row = ({ t, muted }) => (
    <li style={{ padding: '7px 0' }}>
      <input type="checkbox" checked={t.done} onChange={e => patch(t, { done: e.target.checked, done_at: e.target.checked ? new Date().toISOString() : null })} />
      <span className="grow" style={{ textDecoration: t.done ? 'line-through' : 'none', color: t.done || muted ? 'var(--muted)' : 'var(--text)' }}>{t.title}{!t.done && t.due < today && <span className="pill bad" style={{ marginLeft: 8 }}>from {new Date(t.due + 'T12:00:00').toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}</span>}{!t.done && t.due > today && <span className="pill" style={{ marginLeft: 8 }}>{dayLabel(t.due, today)}</span>}</span>
      {!t.done && t.due <= today && <button className="btn ghost small" title="Move to tomorrow" onClick={() => patch(t, { due: shiftDay(today, 1) })}>→ tmrw</button>}
      <button className="btn ghost small" title="Delete" onClick={() => remove(t)}>×</button>
    </li>
  )
  return (
    <div className="card">
      <div className="row between wrap"><h3 style={{ margin: 0 }}>Daily tasks</h3><span className="small muted">{open.length} open · {doneToday.length} done today</span></div>
      <form onSubmit={add} className="row" style={{ gap: 6, marginTop: 10 }}><input className="input" style={{ flex: 1 }} placeholder="Add a task for today and press Enter" value={text} onChange={e => setText(e.target.value)} /><button className="btn small">Add</button></form>
      <ul className="list" style={{ marginTop: 6 }}>
        {open.map(t => <Row key={t.id} t={t} />)}
        {open.length === 0 && <li className="muted small">Nothing open. Type a task above.</li>}
      </ul>
      {later.length > 0 && <><div className="small muted" style={{ marginTop: 8 }}>Coming up</div><ul className="list">{later.map(t => <Row key={t.id} t={t} muted />)}</ul></>}
      {doneToday.length > 0 && <><a className="small" style={{ cursor: 'pointer', display: 'inline-block', marginTop: 8 }} onClick={() => setShowDone(!showDone)}>{showDone ? 'Hide done' : `Done today (${doneToday.length})`}</a>{showDone && <ul className="list">{doneToday.map(t => <Row key={t.id} t={t} />)}</ul>}</>}
    </div>
  )
}

export default function TodayPanel({ userId }) {
  const [cal, setCal] = useState(null)
  const loadCal = (force) => callFn('calendar-summary', force ? { force: true } : undefined).then(setCal).catch(() => setCal({ connected: true, error: 'unavailable' }))
  useEffect(() => { loadCal(false) }, [])
  return (
    <div className="grid" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: 10, marginTop: 6 }}>
      <CalendarCard cal={cal} onRefresh={() => loadCal(true)} />
      <TasksCard userId={userId} />
    </div>
  )
}
