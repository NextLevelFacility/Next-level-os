import { useState } from 'react'
import { supabase, ROLES } from '../lib/supabase'
import { money } from '../lib/api'
import { saveComp } from '../lib/comp'

// What each person earns this month, from the sources of truth:
//  commission  → new Soccer Semi-Private memberships in PushPress, credited to the assigned staff (12%)
//  sessions    → the Coaches sheet × per-session rate
//  hourly      → hours come from ADP / the time clock, not from here
//  churn bonus → paid when the month closes under the churn target
export default function PayCard({ pp, sheets, ret, comp, roster, onCompSaved, onRosterSaved }) {
  const [editing, setEditing] = useState(false)
  const [form, setForm] = useState(null)
  const [rates, setRates] = useState({})
  const [saving, setSaving] = useState(false)
  const byStaff = pp?.commission?.byStaff || {}
  const coachMonth = (name) => (sheets?.sheets?.coaches?.people || []).find(p => p.name.toLowerCase() === name.toLowerCase().split(' ')[0])?.month?.['Sessions trained'] || 0
  const first = (n) => (n || '').trim().split(' ')[0]
  const staffKey = (name) => Object.keys(byStaff).find(k => k.toLowerCase().startsWith(first(name).toLowerCase()))
  const bonusFor = (name) => ret?.onTrack && (comp?.bonus_people || []).some(b => first(name).toLowerCase() === String(b).toLowerCase()) ? Number(comp?.churn_bonus) || 0 : 0

  const rows = roster.map(p => {
    const k = staffKey(p.full_name); const c = k ? byStaff[k].this : null
    const sessions = coachMonth(p.full_name)
    const sessionPay = sessions * (Number(p.pay_per_session) || 0)
    const commission = c ? c.commission : 0
    const bonus = bonusFor(p.full_name)
    return { p, sessions, sessionPay, commission, semi: c?.semi || 0, sales: c?.sales || 0, bonus, total: sessionPay + commission + bonus }
  })
  const unassigned = byStaff['Unassigned']?.this
  const unknown = Object.entries(byStaff).filter(([k]) => k !== 'Unassigned' && !roster.some(p => staffKey(p.full_name) === k))

  async function savePerson(p) {
    const r = rates[p.id] || {}
    const patch = { pay_hourly: r.pay_hourly === '' ? null : r.pay_hourly ?? p.pay_hourly, pay_per_session: r.pay_per_session === '' ? null : r.pay_per_session ?? p.pay_per_session }
    await supabase.from(p.source === 'invite' ? 'team_invites' : 'profiles').update(patch).eq('id', p.id)
  }
  async function saveAll() {
    setSaving(true)
    for (const p of roster) if (rates[p.id]) await savePerson(p)
    if (form) await saveComp({ ...comp, ...form, bonus_people: String(form.bonus_people).split(',').map(x => x.trim()).filter(Boolean) })
    setSaving(false); setEditing(false); setRates({}); setForm(null); onRosterSaved?.(); onCompSaved?.()
  }

  return (
    <div className="card">
      <div className="row between wrap">
        <div className="small muted">{pp?.commission?.rule || '12% on new Soccer Semi-Private memberships'} · sessions from the Coaches sheet · hourly staff are paid from ADP hours</div>
        <button className="btn ghost small" onClick={() => { setEditing(!editing); setForm({ commission_pct: comp?.commission_pct ?? 12, churn_target_pct: comp?.churn_target_pct ?? 5, churn_bonus: comp?.churn_bonus ?? 0, bonus_people: (comp?.bonus_people || []).join(', ') }) }}>{editing ? 'Close' : 'Rates & bonus'}</button>
      </div>
      <div style={{ overflowX: 'auto', marginTop: 10 }}>
        <table className="kpi">
          <thead><tr><th>Person</th><th>Role</th><th style={{ textAlign: 'right' }}>Semi-private sold</th><th style={{ textAlign: 'right' }}>Commission</th><th style={{ textAlign: 'right' }}>Sessions</th><th style={{ textAlign: 'right' }}>Session pay</th><th style={{ textAlign: 'right' }}>Churn bonus</th><th style={{ textAlign: 'right' }}>Total</th></tr></thead>
          <tbody>
            {rows.map(({ p, sessions, sessionPay, commission, semi, sales, bonus, total }) => (
              <tr key={p.id}>
                <td><div style={{ fontWeight: 500 }}>{p.full_name}</div><div className="small muted">{p.pay_hourly ? `$${p.pay_hourly}/h (ADP)` : ''}{p.pay_hourly && p.pay_per_session ? ' · ' : ''}{p.pay_per_session ? `$${p.pay_per_session}/session` : ''}{!p.pay_hourly && !p.pay_per_session ? 'no rate set' : ''}</div></td>
                <td className="small muted">{[p.role, ...(p.roles || [])].map(r => ROLES[r]).join(' + ')}</td>
                <td style={{ textAlign: 'right' }}>{semi}{sales ? <div className="small muted">{money(sales)}</div> : null}</td>
                <td style={{ textAlign: 'right' }}>{money(commission)}</td>
                <td style={{ textAlign: 'right' }}>{sessions}</td>
                <td style={{ textAlign: 'right' }}>{money(sessionPay)}</td>
                <td style={{ textAlign: 'right' }}>{bonus ? money(bonus) : '—'}</td>
                <td style={{ textAlign: 'right', fontWeight: 600, color: 'var(--gold)' }}>{money(total)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {(unassigned?.semi > 0 || unknown.length > 0) && (
        <p className="small muted" style={{ marginTop: 8 }}>
          {unassigned?.semi > 0 && <>{unassigned.semi} new semi-private membership{unassigned.semi > 1 ? 's' : ''} this month have no assigned staff in PushPress ({money(unassigned.commission)} of commission unclaimed) — set "Assigned to" on the member in PushPress and it moves to the right person. </>}
          {unknown.map(([k, v]) => <span key={k}>{k}: {v.this.semi} semi-private ({money(v.this.commission)}) — not on the roster. </span>)}
        </p>
      )}
      {pp?.memberships?.length > 0 && (
        <details style={{ marginTop: 8 }}>
          <summary className="small muted" style={{ cursor: 'pointer' }}>New memberships this month ({pp.memberships.filter(m => m.month === 'this').length}) and last month ({pp.memberships.filter(m => m.month === 'last').length})</summary>
          <ul className="list">{pp.memberships.slice(0, 40).map((m, i) => <li key={i}><span className="grow small"><div>{m.name} <span className="muted">· {m.plan}</span></div><div className="muted">{new Date(m.started).toLocaleDateString()} · {m.staff}{m.semiPrivate ? '' : ' · not semi-private, no commission'}</div></span>{m.semiPrivate ? <span className="pill gold">{money(m.commission)}</span> : null}</li>)}</ul>
        </details>
      )}
      {editing && form && (
        <div className="card accent" style={{ marginTop: 12, marginBottom: 0 }}>
          <h3 style={{ marginTop: 0 }}>Pay rates</h3>
          <ul className="list">
            {roster.map(p => (
              <li key={p.id}>
                <span className="grow small">{p.full_name} <span className="muted">· {[p.role, ...(p.roles || [])].map(r => ROLES[r]).join(' + ')}{p.source === 'invite' ? ' · not signed up yet' : ''}</span></span>
                <label className="field" style={{ margin: 0 }}><span>$ / hour</span><input className="input" type="number" step="0.01" style={{ width: 100, minHeight: 32, padding: '4px 8px' }} value={rates[p.id]?.pay_hourly ?? (p.pay_hourly ?? '')} onChange={e => setRates({ ...rates, [p.id]: { ...(rates[p.id] || {}), pay_hourly: e.target.value === '' ? '' : Number(e.target.value) } })} /></label>
                <label className="field" style={{ margin: 0 }}><span>$ / session</span><input className="input" type="number" step="0.01" style={{ width: 100, minHeight: 32, padding: '4px 8px' }} value={rates[p.id]?.pay_per_session ?? (p.pay_per_session ?? '')} onChange={e => setRates({ ...rates, [p.id]: { ...(rates[p.id] || {}), pay_per_session: e.target.value === '' ? '' : Number(e.target.value) } })} /></label>
              </li>
            ))}
          </ul>
          <h3>Commission & churn bonus</h3>
          <div className="row wrap" style={{ gap: 10 }}>
            <label className="field" style={{ margin: 0 }}><span>Commission %</span><input className="input" type="number" step="0.5" style={{ width: 100 }} value={form.commission_pct} onChange={e => setForm({ ...form, commission_pct: Number(e.target.value) })} /></label>
            <label className="field" style={{ margin: 0 }}><span>Churn target % (under)</span><input className="input" type="number" step="0.5" style={{ width: 120 }} value={form.churn_target_pct} onChange={e => setForm({ ...form, churn_target_pct: Number(e.target.value) })} /></label>
            <label className="field" style={{ margin: 0 }}><span>Churn bonus $ (each)</span><input className="input" type="number" style={{ width: 120 }} value={form.churn_bonus} onChange={e => setForm({ ...form, churn_bonus: Number(e.target.value) })} /></label>
            <label className="field" style={{ margin: 0, flex: 1, minWidth: 180 }}><span>Who gets the bonus (first names)</span><input className="input" value={form.bonus_people} onChange={e => setForm({ ...form, bonus_people: e.target.value })} /></label>
          </div>
          <button className="btn small" disabled={saving} onClick={saveAll} style={{ marginTop: 10 }}>{saving ? 'Saving…' : 'Save'}</button>
        </div>
      )}
    </div>
  )
}
