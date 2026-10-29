import { useEffect, useState } from 'react'
import { useAuth } from '../lib/auth.jsx'
import { supabase, isManager, fmtDate } from '../lib/supabase'
import { callFn, money } from '../lib/api'
import { useEvents, phaseOf, daysUntil } from '../components/ClinicBoard.jsx'

export default function Clinics() {
  const { user, role } = useAuth()
  const [events, reload] = useEvents()
  const [open, setOpen] = useState(null)
  const [regs, setRegs] = useState([])
  const [form, setForm] = useState({ athlete_name: '', parent_name: '', phone: '', amount: '' })
  const [edit, setEdit] = useState(null)
  const [importing, setImporting] = useState(false)
  const manager = isManager(role)

  async function loadRegs(eid) {
    const { data } = await supabase.from('event_registrations').select('*, profiles!added_by(full_name)').eq('event_id', eid).order('created_at', { ascending: false })
    setRegs(data || [])
  }
  useEffect(() => { if (open) loadRegs(open) }, [open])

  async function addReg(e) {
    e.preventDefault()
    const { error } = await supabase.from('event_registrations').insert({ event_id: open, athlete_name: form.athlete_name, parent_name: form.parent_name, phone: form.phone, amount: form.amount === '' ? null : Number(form.amount), added_by: user.id })
    if (error) return alert(error.message)
    setForm({ athlete_name: '', parent_name: '', phone: '', amount: '' }); loadRegs(open); reload()
  }
  async function saveEvent(e) {
    e.preventDefault()
    const { id, event_registrations, signups, revenue, created_at, ...rest } = edit
    const { error } = id ? await supabase.from('events').update(rest).eq('id', id) : await supabase.from('events').insert(rest)
    if (error) return alert(error.message); setEdit(null); reload()
  }
  // Pull sign-ups from Square: any payment whose line item contains the clinic keyword becomes a registration (never double-counted).
  async function importFromSquare() {
    setImporting(true)
    const sq = await callFn('square-summary', { days: 90 })
    if (!sq.connected) { setImporting(false); return alert(sq.hint || 'Square is not connected yet.') }
    if (sq.error) { setImporting(false); return alert('Square: ' + sq.error) }
    let added = 0
    for (const ev of events) {
      if (!ev.keyword) continue
      for (const [name, info] of Object.entries(sq.lineItems || {})) {
        if (!name.toLowerCase().includes(ev.keyword.toLowerCase())) continue
        for (const p of info.paymentIds) {
          const { error } = await supabase.from('event_registrations').insert({ event_id: ev.id, athlete_name: p.note || p.buyer || `Square ${p.id.slice(0, 6)}`, email: p.buyer || null, amount: info.amount / Math.max(1, info.paymentIds.length), source: 'square', external_id: p.id, added_by: user.id })
          if (!error) added++
        }
      }
    }
    setImporting(false); reload(); if (open) loadRegs(open)
    alert(added ? `${added} new sign-up${added > 1 ? 's' : ''} pulled from Square.` : 'No new Square sign-ups found.')
  }

  const blank = { name: '', kind: 'clinic', starts_on: '', ends_on: '', capacity: 60, price: '', push_from: '', push_until: '', keyword: '', goal_signups: 50, active: true, sort: events.length + 1 }

  return (
    <>
      <div className="row between"><h1>Clinics</h1>{manager && <div className="row" style={{ gap: 6 }}><button className="btn ghost small" onClick={importFromSquare} disabled={importing}>{importing ? 'Pulling…' : 'Pull from Square'}</button><button className="btn small" onClick={() => setEdit(blank)}>+ Event</button></div>}</div>
      <p className="muted">Live sign-ups for every clinic and camp. The team pushes one at a time: Thanksgiving → Winter → Spring (push from Feb) → Summer (push from April).</p>

      {edit && (
        <form className="card accent" onSubmit={saveEvent}>
          <h2>{edit.id ? 'Edit event' : 'New event'}</h2>
          <label className="field"><span>Name</span><input className="input" value={edit.name} onChange={e => setEdit({ ...edit, name: e.target.value })} required /></label>
          <div className="row" style={{ gap: 8 }}>
            <label className="field" style={{ flex: 1 }}><span>Starts</span><input className="input" type="date" value={edit.starts_on || ''} onChange={e => setEdit({ ...edit, starts_on: e.target.value })} /></label>
            <label className="field" style={{ flex: 1 }}><span>Ends</span><input className="input" type="date" value={edit.ends_on || ''} onChange={e => setEdit({ ...edit, ends_on: e.target.value })} /></label>
          </div>
          <div className="row" style={{ gap: 8 }}>
            <label className="field" style={{ flex: 1 }}><span>Push from</span><input className="input" type="date" value={edit.push_from || ''} onChange={e => setEdit({ ...edit, push_from: e.target.value })} /></label>
            <label className="field" style={{ flex: 1 }}><span>Push until</span><input className="input" type="date" value={edit.push_until || ''} onChange={e => setEdit({ ...edit, push_until: e.target.value })} /></label>
          </div>
          <div className="row" style={{ gap: 8 }}>
            <label className="field" style={{ flex: 1 }}><span>Capacity</span><input className="input" type="number" value={edit.capacity ?? ''} onChange={e => setEdit({ ...edit, capacity: Number(e.target.value) || null })} /></label>
            <label className="field" style={{ flex: 1 }}><span>Goal sign-ups</span><input className="input" type="number" value={edit.goal_signups ?? ''} onChange={e => setEdit({ ...edit, goal_signups: Number(e.target.value) || null })} /></label>
            <label className="field" style={{ flex: 1 }}><span>Price $</span><input className="input" type="number" value={edit.price ?? ''} onChange={e => setEdit({ ...edit, price: e.target.value === '' ? null : Number(e.target.value) })} /></label>
          </div>
          <label className="field"><span>Square keyword (item name contains)</span><input className="input" value={edit.keyword || ''} onChange={e => setEdit({ ...edit, keyword: e.target.value })} placeholder="Thanksgiving" /></label>
          <div className="row" style={{ gap: 8 }}><button className="btn">Save</button><button type="button" className="btn ghost" onClick={() => setEdit(null)}>Cancel</button>{edit.id && <button type="button" className="btn danger small" onClick={async () => { await supabase.from('events').update({ active: false }).eq('id', edit.id); setEdit(null); reload() }}>Archive</button>}</div>
        </form>
      )}

      {events.map(e => {
        const ph = phaseOf(e), cap = e.capacity || e.goal_signups || 0, pct = cap ? Math.min(100, Math.round(e.signups / cap * 100)) : 0, d = daysUntil(e.starts_on)
        return (
          <div className={`card ${ph === 'pushing' || ph === 'live' ? 'accent' : ''}`} key={e.id}>
            <div className="row between">
              <div><h2 style={{ margin: 0 }}>{e.name}</h2><div className="small muted">{fmtDate(e.starts_on)} – {fmtDate(e.ends_on)}{d != null && d >= 0 ? ` · ${d} days out` : ''} · push {fmtDate(e.push_from)} → {fmtDate(e.push_until)}</div></div>
              <span className={`pill ${ph === 'live' ? 'good' : ph === 'pushing' ? 'pink' : ''}`}>{ph === 'pushing' ? 'PUSHING' : ph.toUpperCase()}</span>
            </div>
            <div className="grid" style={{ marginTop: 10 }}>
              <div className="stat"><div className="label">Signed up</div><div className={`value ${pct >= 100 ? 'gold' : 'pink'}`}>{e.signups}<span className="muted" style={{ fontSize: '1rem' }}> / {cap || '—'}</span></div></div>
              <div className="stat"><div className="label">Collected</div><div className="value">{money(e.revenue)}</div></div>
              <div className="stat"><div className="label">Goal</div><div className="value">{e.goal_signups ?? '—'}</div></div>
            </div>
            <div className="progress" style={{ marginTop: 10 }}><div style={{ width: pct + '%' }} /></div>
            <div className="row" style={{ gap: 6, marginTop: 10 }}>
              <button className={`btn small ${open === e.id ? '' : 'ghost'}`} onClick={() => setOpen(open === e.id ? null : e.id)}>{open === e.id ? 'Close' : 'Sign-ups & add'}</button>
              {manager && <button className="btn ghost small" onClick={() => setEdit(e)}>Edit</button>}
            </div>
            {open === e.id && (
              <div style={{ marginTop: 10 }}>
                <form onSubmit={addReg} className="row wrap" style={{ gap: 6 }}>
                  <input className="input" style={{ flex: 2, minWidth: 140 }} placeholder="Athlete name" value={form.athlete_name} onChange={ev => setForm({ ...form, athlete_name: ev.target.value })} required />
                  <input className="input" style={{ flex: 2, minWidth: 120 }} placeholder="Parent" value={form.parent_name} onChange={ev => setForm({ ...form, parent_name: ev.target.value })} />
                  <input className="input" style={{ flex: 1, minWidth: 110 }} placeholder="Phone" inputMode="tel" value={form.phone} onChange={ev => setForm({ ...form, phone: ev.target.value })} />
                  <input className="input" style={{ width: 90 }} placeholder="$" type="number" value={form.amount} onChange={ev => setForm({ ...form, amount: ev.target.value })} />
                  <button className="btn small">Add</button>
                </form>
                <ul className="list" style={{ marginTop: 8 }}>
                  {regs.map(r => <li key={r.id}><span className="grow"><div>{r.athlete_name} <span className="small muted">{r.parent_name ? `· ${r.parent_name}` : ''}{r.phone ? ` · ${r.phone}` : ''}</span></div><div className="small muted">{money(r.amount)} · {r.source} · {new Date(r.created_at).toLocaleDateString()}{r.profiles?.full_name ? ` · by ${r.profiles.full_name}` : ''}</div></span>{manager && <button className="btn ghost small" onClick={async () => { if (confirm('Remove this sign-up?')) { await supabase.from('event_registrations').delete().eq('id', r.id); loadRegs(e.id); reload() } }}>×</button>}</li>)}
                  {regs.length === 0 && <li className="muted">No sign-ups yet.</li>}
                </ul>
              </div>
            )}
          </div>
        )
      })}
    </>
  )
}
