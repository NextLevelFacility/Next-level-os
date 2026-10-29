import { useEffect, useState } from 'react'
import { useAuth } from '../lib/auth.jsx'
import { supabase, today } from '../lib/supabase'

// Daily targets. One line per metric: name, progress, and the controls to log it. Nothing else.
export default function Goals({ userId, roles: rolesProp, readOnly = false, date = today(), compact = false, refresh = 0, title = 'Today' }) {
  const auth = useAuth()
  const uid = userId || auth.user.id
  const roles = rolesProp || auth.roles
  const [goals, setGoals] = useState([])
  const [data, setData] = useState({})
  const [saving, setSaving] = useState(false)

  async function load() {
    const { data: g } = await supabase.from('kpi_goals').select('*').in('role', roles).eq('active', true).order('role').order('sort')
    // same metric in two roles (e.g. 'sessions') counts once, with the higher goal
    const seen = {}; for (const x of g || []) { if (!seen[x.metric] || Number(x.goal) > Number(seen[x.metric].goal)) seen[x.metric] = x }
    setGoals(Object.values(seen).sort((a, b) => a.role.localeCompare(b.role) || a.sort - b.sort))
    const { data: d } = await supabase.from('kpi_days').select('data').eq('user_id', uid).eq('kpi_date', date).maybeSingle()
    setData(d?.data || {})
  }
  useEffect(() => { load() }, [uid, roles.join(','), date, refresh])

  async function set(metric, value) {
    const next = { ...data, [metric]: Math.max(0, value) }
    setData(next); setSaving(true)
    const { error } = await supabase.from('kpi_days').upsert({ user_id: uid, location_id: auth.locationId, kpi_date: date, data: next, updated_at: new Date().toISOString() }, { onConflict: 'user_id,kpi_date' })
    setSaving(false)
    if (error) alert(error.message)
  }

  if (goals.length === 0) return null
  const hit = goals.filter(g => (data[g.metric] || 0) >= Number(g.goal)).length

  return (
    <div className="card" style={compact ? { padding: 12 } : {}}>
      <div className="row between">
        <h2 style={{ margin: 0 }}>{title}</h2>
        <span className={`small ${hit === goals.length ? '' : 'muted'}`} style={hit === goals.length ? { color: 'var(--good)' } : {}}>{hit} of {goals.length} targets met{saving ? ' · saving' : ''}</span>
      </div>
      <div style={{ marginTop: 4 }}>
        {goals.map(g => {
          const v = Number(data[g.metric] || 0), goal = Number(g.goal), stretch = g.stretch ? Number(g.stretch) : null
          const done = v >= goal
          const pct = Math.min(100, Math.round(v / goal * 100))
          return (
            <div className="goal" key={g.id}>
              <div className="name">{g.label}{roles.length > 1 && <span className="muted small"> · {g.role}</span>}</div>
              <div className={`num ${done ? 'hit' : ''}`}>
                {g.kind === 'check' ? (done ? 'Done' : <span className="of">Not yet</span>) : <>{v}<span className="of"> / {goal}{stretch ? `–${stretch}` : ''}</span></>}
              </div>
              {g.kind === 'count' && <div className="bar"><div className="progress"><div style={{ width: pct + '%', background: done ? 'var(--good)' : undefined }} /></div></div>}
              {!readOnly && (
                <div className="acts">
                  {g.kind === 'check'
                    ? <button className={`btn small ${done ? 'ghost' : ''}`} onClick={() => set(g.metric, done ? 0 : 1)}>{done ? 'Undo' : 'Mark done'}</button>
                    : <>
                        <button className="btn ghost small" onClick={() => set(g.metric, v + 1)}>+1</button>
                        {g.step > 1 && <button className="btn ghost small" onClick={() => set(g.metric, v + g.step)}>+{g.step}</button>}
                        <button className="btn ghost small" onClick={() => set(g.metric, v - 1)}>−1</button>
                        <input className="input" type="number" inputMode="numeric" value={v} onChange={e => set(g.metric, Number(e.target.value) || 0)} aria-label={`${g.label} total`} />
                      </>}
                </div>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}
