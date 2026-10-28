import { useEffect, useState } from 'react'
import { useAuth } from '../lib/auth.jsx'
import { supabase, isManager } from '../lib/supabase'

const today = () => new Date().toISOString().slice(0, 10)

export default function Checklists() {
  const { user, role, locationId } = useAuth()
  const [templates, setTemplates] = useState([])
  const [runs, setRuns] = useState({})
  const [open, setOpen] = useState(null)

  async function load() {
    const { data: t } = await supabase.from('checklist_templates').select('*').eq('active', true).order('slot')
    setTemplates((t || []).filter(x => !x.role || x.role === role || isManager(role)))
    const { data: r } = await supabase.from('checklist_runs').select('*').eq('run_date', today()).eq('location_id', locationId)
    setRuns(Object.fromEntries((r || []).map(x => [x.template_id, x])))
  }
  useEffect(() => { load() }, [role, locationId])

  async function toggle(t, idx, photoFile) {
    const run = runs[t.id] || { template_id: t.id, location_id: locationId, user_id: user.id, run_date: today(), completed: {} }
    const completed = { ...run.completed }
    if (completed[idx]) delete completed[idx]
    else {
      let photo = null
      if (photoFile) {
        const path = `${locationId}/${today()}/${t.id}-${idx}-${Date.now()}.jpg`
        const { error } = await supabase.storage.from('checklist-photos').upload(path, photoFile, { upsert: true })
        if (!error) photo = supabase.storage.from('checklist-photos').getPublicUrl(path).data.publicUrl
      }
      completed[idx] = { at: new Date().toISOString(), by: user.id, photo }
    }
    const done = t.items.every((_, i) => completed[i])
    const { data } = await supabase.from('checklist_runs').upsert({ ...run, completed, done, user_id: user.id }, { onConflict: 'template_id,location_id,run_date' }).select().single()
    if (data) setRuns({ ...runs, [t.id]: data })
  }

  return (
    <>
      <h1>Checklists</h1>
      <p className="muted">{new Date().toLocaleDateString(undefined, { weekday: 'long', month: 'short', day: 'numeric' })} · tap to tick, each tick is timestamped.</p>
      {templates.length === 0 && <div className="empty">No checklists yet. The Owner adds them in Supabase → checklist_templates.</div>}
      {templates.map(t => {
        const run = runs[t.id]
        const doneCount = run ? Object.keys(run.completed).length : 0
        const isOpen = open === t.id
        return (
          <div className={`card ${run?.done ? '' : ''}`} key={t.id}>
            <div className="row between" onClick={() => setOpen(isOpen ? null : t.id)} style={{ cursor: 'pointer' }}>
              <div>
                <div className="row" style={{ gap: 8 }}><span className="pill pink">{t.slot}</span><h2 style={{ margin: 0 }}>{t.name}</h2></div>
                <div className="small muted">{doneCount} of {t.items.length} · {run?.done ? <span style={{ color: 'var(--good)' }}>complete</span> : 'open'}</div>
              </div>
              <span className={`check ${run?.done ? 'on' : ''}`}>{run?.done ? '✓' : ''}</span>
            </div>
            {isOpen && (
              <ul className="list" style={{ marginTop: 10 }}>
                {t.items.map((item, i) => {
                  const c = run?.completed?.[i]
                  return (
                    <li key={i}>
                      {item.photo && !c
                        ? <label className="check" style={{ borderStyle: 'dashed' }} title="Take a photo">
                            📷<input type="file" accept="image/*" capture="environment" style={{ display: 'none' }} onChange={e => e.target.files[0] && toggle(t, i, e.target.files[0])} />
                          </label>
                        : <button className={`check ${c ? 'on' : ''}`} onClick={() => toggle(t, i)}>{c ? '✓' : ''}</button>}
                      <span className={`grow ${c ? 'done' : ''}`}>
                        {item.text}
                        {c && <div className="small muted">{new Date(c.at).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}{c.photo && <> · <a href={c.photo} target="_blank" rel="noreferrer">photo</a></>}</div>}
                        {item.photo && !c && <div className="small muted">photo required</div>}
                      </span>
                    </li>
                  )
                })}
              </ul>
            )}
          </div>
        )
      })}
    </>
  )
}
