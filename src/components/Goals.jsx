import { useEffect, useState } from 'react'
import { useAuth } from '../lib/auth.jsx'
import { supabase, today } from '../lib/supabase'

// Daily goals, pinned to the top of Today. Each goal flips to a green check the moment it's hit.
export default function Goals({ userId, role: roleProp, readOnly = false, date = today(), compact = false }) {
  const auth = useAuth()
  const uid = userId || auth.user.id
  const role = roleProp || auth.role
  const [goals, setGoals] = useState([])
  const [data, setData] = useState({})
  const [saving, setSaving] = useState(false)

  async function load() {
    const { data: g } = await supabase.from('kpi_goals').select('*').eq('role', role).eq('active', true).order('sort')
    setGoals(g || [])
    const { data: d } = await supabase.from('kpi_days').select('data').eq('user_id', uid).eq('kpi_date', date).maybeSingle()
    setData(d?.data || {})
  }
  useEffect(() => { load() }, [uid, role, date])

  async function set(metric, value) {
    const next = { ...data, [metric]: Math.max(0, value) }
    setData(next); setSaving(true)
    const { error } = await supabase.from('kpi_days').upsert({ user_id: uid, location_id: auth.locationId, kpi_date: date, data: next, updated_at: new Date().toISOString() }, { onConflict: 'user_id,kpi_date' })
    setSaving(false)
    if (error) alert(error.message)
  }

  if (goals.length === 0) return null
  const hit = goals.filter(g => (data[g.metric] || 0) >= Number(g.goal)).length
  const allHit = hit === goals.length

  return (
    <div className={`card ${allHit ? 'accent' : ''}`} style={compact ? { padding: 12 } : {}}>
      <div className="row between">
        <h2 style={{ margin: 0 }}>{compact ? 'Goals' : "Today's goals"}</h2>
        <span className={`pill ${allHit ? 'good' : 'gold'}`}>{hit} / {goals.length}{allHit ? ' · ALL HIT' : ''}</span>
      </div>
      <ul className="list">
        {goals.map(g => {
          const v = Number(data[g.metric] || 0), goal = Number(g.goal), stretch = g.stretch ? Number(g.stretch) : null
          const done = v >= goal, stretchDone = stretch && v >= stretch
          const pct = Math.min(100, Math.round(v / goal * 100))
          return (
            <li key={g.id} style={{ alignItems: 'flex-start' }}>
              <span className={`check ${done ? 'on' : ''}`} style={done ? { background: 'var(--good)', borderColor: 'var(--good)', color: '#0A0A0A' } : {}}>{done ? '✓' : ''}</span>
              <span className="grow">
                <div className="row between">
                  <span style={{ fontWeight: 600 }}>{g.label}</span>
                  <span className="display" style={{ fontSize: '1.4rem', color: done ? 'var(--good)' : 'var(--pink)' }}>
                    {g.kind === 'check' ? (done ? 'DONE' : 'NOT YET') : <>{v}<span className="muted" style={{ fontSize: '0.9rem' }}> / {goal}{stretch ? `–${stretch}` : ''}</span></>}
                  </span>
                </div>
                {g.kind === 'count' && <div className="progress" style={{ marginTop: 6 }}><div style={{ width: pct + '%', background: done ? 'var(--good)' : undefined }} /></div>}
                {stretchDone && <div className="small" style={{ color: 'var(--gold)' }}>Stretch goal hit.</div>}
                {!readOnly && (
                  <div className="row" style={{ gap: 6, marginTop: 8, flexWrap: 'wrap' }}>
                    {g.kind === 'check'
                      ? <button className={`btn small ${done ? 'ghost' : 'good'}`} onClick={() => set(g.metric, done ? 0 : 1)}>{done ? 'Undo' : 'Mark done'}</button>
                      : <>
                          <button className="btn small" onClick={() => set(g.metric, v + 1)}>+1</button>
                          {g.step > 1 && <button className="btn small" onClick={() => set(g.metric, v + g.step)}>+{g.step}</button>}
                          <button className="btn ghost small" onClick={() => set(g.metric, v - 1)}>−1</button>
                          <input className="input" type="number" inputMode="numeric" value={v} onChange={e => set(g.metric, Number(e.target.value) || 0)} style={{ width: 80, minHeight: 36, padding: '6px 10px' }} />
                        </>}
                  </div>
                )}
              </span>
            </li>
          )
        })}
      </ul>
      {saving && <div className="small muted">Saving…</div>}
    </div>
  )
}
