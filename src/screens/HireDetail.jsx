import { useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { useAuth } from '../lib/auth.jsx'
import { supabase, ROLES, isManager } from '../lib/supabase'
import { PHASES, C_LABEL } from '../lib/onboardingPlan'
import { Progress } from './Today.jsx'

export default function HireDetail() {
  const { id } = useParams()
  const { user, role } = useAuth()
  const [hire, setHire] = useState(null)
  const [tasks, setTasks] = useState([])
  const [checkins, setCheckins] = useState([])
  const [people, setPeople] = useState({})
  const [note, setNote] = useState(''); const [needed, setNeeded] = useState('')
  const [problems, setProblems] = useState(['', '', ''])
  const manager = isManager(role)

  async function load() {
    const { data: h } = await supabase.from('hires').select('*').eq('id', id).single()
    setHire(h); setProblems(h?.problems || ['', '', ''])
    const { data: t } = await supabase.from('onboarding_tasks').select('*').eq('hire_id', id).order('sort')
    setTasks(t || [])
    const { data: c } = await supabase.from('checkins').select('*').eq('hire_id', id).order('created_at', { ascending: false })
    setCheckins(c || [])
    const { data: p } = await supabase.from('profiles').select('id, full_name, phone')
    setPeople(Object.fromEntries((p || []).map(x => [x.id, x])))
  }
  useEffect(() => { load() }, [id])

  async function toggle(t) {
    const done = !t.done
    await supabase.from('onboarding_tasks').update({ done, done_at: done ? new Date().toISOString() : null }).eq('id', t.id)
    setTasks(tasks.map(x => x.id === t.id ? { ...x, done } : x))
  }
  async function saveProblems() { await supabase.from('hires').update({ problems }).eq('id', id); alert('Saved') }
  async function setStatus(status) { await supabase.from('hires').update({ status }).eq('id', id); setHire({ ...hire, status }) }
  async function addCheckin(e) {
    e.preventDefault()
    await supabase.from('checkins').insert({ hire_id: id, by_user: user.id, note, needed })
    setNote(''); setNeeded(''); load()
  }
  async function linkMe() { await supabase.from('hires').update({ user_id: user.id }).eq('id', id); load() }

  if (!hire) return <p className="muted">Loading…</p>
  const buddy = people[hire.buddy_id], mgr = people[hire.manager_id]
  const isMe = hire.user_id === user.id

  return (
    <>
      <Link to="/onboarding" className="small">← Onboarding</Link>
      <h1>{hire.full_name}</h1>
      <p className="muted">{ROLES[hire.role]} · starts {hire.start_date || 'TBD'}</p>
      <Progress tasks={tasks} />

      {!hire.user_id && !manager && <button className="btn gold small" onClick={linkMe}>This is me</button>}

      <div className="card accent">
        <h2>Why you're here</h2>
        <p className="small muted">The three problems this seat exists to solve.</p>
        {problems.map((p, i) => manager
          ? <input key={i} className="input" style={{ marginBottom: 8 }} placeholder={`Problem ${i + 1}`} value={p} onChange={e => setProblems(problems.map((x, j) => j === i ? e.target.value : x))} />
          : <p key={i}><b style={{ color: 'var(--gold)' }}>{i + 1}.</b> {p || <span className="muted">not written yet</span>}</p>)}
        {manager && <button className="btn small" onClick={saveProblems}>Save</button>}
      </div>

      <div className="card">
        <h2>Your people</h2>
        <ul className="list">
          <li><span className="pill gold">Buddy</span><span className="grow">{buddy ? <>{buddy.full_name}{buddy.phone && <> · <a href={`tel:${buddy.phone}`}>{buddy.phone}</a></>}</> : <span className="muted">not assigned</span>}</span></li>
          <li><span className="pill gold">Manager</span><span className="grow">{mgr ? mgr.full_name : <span className="muted">not assigned</span>}</span></li>
        </ul>
      </div>

      {manager && (
        <div className="card">
          <h3>Stage</h3>
          <div className="row wrap" style={{ gap: 6 }}>
            {[...PHASES.map(([k]) => k), 'complete'].map(s => <button key={s} className={`btn small ${hire.status === s ? '' : 'ghost'}`} onClick={() => setStatus(s)}>{s}</button>)}
          </div>
        </div>
      )}

      {PHASES.map(([key, label]) => {
        const list = tasks.filter(t => t.phase === key)
        if (!list.length) return null
        const current = hire.status === key
        return (
          <div className={`card ${current ? 'accent' : ''}`} key={key}>
            <h2>{label}</h2>
            <ul className="list">
              {list.map(t => {
                const canTick = manager || (isMe && t.owner === 'hire') || (t.owner === 'buddy' && hire.buddy_id === user.id)
                return (
                  <li key={t.id}>
                    <button className={`check ${t.done ? 'on' : ''}`} disabled={!canTick} onClick={() => toggle(t)}>{t.done ? '✓' : ''}</button>
                    <span className={`grow ${t.done ? 'done' : ''}`}>{t.text}<div className="small muted">{C_LABEL[t.c]} · {t.owner}</div></span>
                  </li>
                )
              })}
            </ul>
          </div>
        )
      })}

      <div className="card">
        <h2>Check-ins</h2>
        {(manager || hire.manager_id === user.id) && (
          <form onSubmit={addCheckin}>
            <label className="field"><span>Note</span><input className="input" value={note} onChange={e => setNote(e.target.value)} placeholder="How did today go?" /></label>
            <label className="field"><span>"What did you need today that you didn't have?"</span><input className="input" value={needed} onChange={e => setNeeded(e.target.value)} placeholder="This becomes an SOP" /></label>
            <button className="btn small">Log check-in</button>
          </form>
        )}
        <ul className="list" style={{ marginTop: 10 }}>
          {checkins.map(c => <li key={c.id}><span className="grow"><div>{c.note}</div>{c.needed && <div className="small flag">Needed: {c.needed}</div>}<div className="small muted">{new Date(c.created_at).toLocaleString()} · {people[c.by_user]?.full_name}</div></span></li>)}
          {checkins.length === 0 && <li className="muted">No check-ins logged yet.</li>}
        </ul>
      </div>
    </>
  )
}
