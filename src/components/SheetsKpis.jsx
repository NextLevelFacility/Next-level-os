import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { money } from '../lib/api'

// Team KPIs — one Google Sheet tracker per person, read live. Same numbers, targets and
// on-track / close / behind calls as each person's own Dashboard tab.
const fmtDay = (k) => k ? new Date(k + 'T12:00:00').toLocaleDateString(undefined, { month: 'short', day: 'numeric' }) : '—'
const pct = (v) => v == null ? '—' : Math.round(v * 100) + '%'
const STATE = { on: ['On track', 'good'], close: ['Close', 'gold'], behind: ['Behind', 'bad'] }
const SHEET_ID_RE = /[-\w]{25,}/

function Tile({ label, value, goal, sub, moneyFmt }) {
  const v = goal ? goal.actual : value
  const shown = moneyFmt ? money(v || 0) : (v ?? 0)
  const st = goal?.state ? STATE[goal.state] : null
  return (
    <div className="stat">
      <div className="label">{label}</div>
      <div className="value" style={{ color: st?.[1] === 'bad' ? 'var(--bad)' : st?.[1] === 'good' ? 'var(--good)' : undefined }}>{shown}{goal?.target ? <span className="muted" style={{ fontSize: '0.85rem', fontWeight: 500 }}> / {goal.target}</span> : null}</div>
      {st ? <div className="small" style={{ marginTop: 4 }}><span className={`pill ${st[1]}`}>{st[0]}{goal.pct != null ? ` · ${Math.round(goal.pct * 100)}%` : ''}</span></div> : sub ? <div className="small muted">{sub}</div> : null}
    </div>
  )
}

function PersonHeader({ p }) {
  return (
    <div className="row between wrap" style={{ gap: 8 }}>
      <div className="row" style={{ gap: 8 }}>
        <h3 style={{ margin: 0 }}>{p.name}</h3>
        {!p.error && (p.filledToday ? <span className="pill good">Filled in today</span> : p.lastFilled ? <span className="pill bad">Last filled {fmtDay(p.lastFilled)}</span> : <span className="pill">Nothing logged yet</span>)}
      </div>
      <a className="small" href={p.url} target="_blank" rel="noreferrer">Open sheet</a>
    </div>
  )
}

function SalesCard({ p, bucket }) {
  const g = p.goals[bucket], b = p[bucket], r = p.rates || {}
  const wk = bucket === 'month' ? 'Month' : 'Week'
  return (
    <div className="card">
      <PersonHeader p={p} />
      <div className="grid" style={{ marginTop: 10 }}>
        <Tile label="Calls" goal={g.Calls} />
        <Tile label="Meetings booked" goal={g['Meetings Booked']} />
        <Tile label="Sold (closes)" goal={g['Sold of showed']} />
        <Tile label="Showed" value={b.Showed} sub={`${b['Meetings Today'] || 0} scheduled`} />
        <Tile label="Upfront cash" value={b['Upfront Cash Collected']} moneyFmt />
        <Tile label={`Show rate · ${wk.toLowerCase()}`} value={pct(bucket === 'month' ? r.showMonth : r.showWeek)} sub={`target ${pct(p.targets.showRate)}`} />
        <Tile label={`Close rate · ${wk.toLowerCase()}`} value={pct(bucket === 'month' ? r.closeMonth : r.closeWeek)} sub={`target ${pct(p.targets.closeRate)}`} />
        {g['Sessions trained'] && <Tile label="Sessions trained" goal={g['Sessions trained']} />}
        {p.metrics.includes('Total players trained') && <Tile label="Players trained" value={b['Total players trained']} sub={r.playersPerSessionWeek != null ? `${r.playersPerSessionWeek.toFixed(1)} per session · wk` : ''} />}
        <Tile label="Referrals" value={b.Referrals} sub={p.rateWeek != null ? `day rating ${p.rateWeek.toFixed(1)}/10 · wk` : ''} />
      </div>
    </div>
  )
}

function CoachCard({ p, bucket }) {
  const g = p.goals[bucket], r = p.rates || {}
  return (
    <div className="card">
      <PersonHeader p={p} />
      <div className="grid" style={{ marginTop: 10 }}>
        <Tile label="Sessions trained" goal={g['Sessions trained']} />
        <Tile label="Players trained" goal={g['Total players trained']} />
        <Tile label="Players per session" value={(bucket === 'month' ? r.playersPerSessionMonth : r.playersPerSessionWeek)?.toFixed(1) ?? '—'} sub={`target ${p.targets.playersPerSession}`} />
      </div>
    </div>
  )
}

function ConcessionCard({ p, bucket }) {
  const g = p.goals[bucket], b = p[bucket], c = p.checklist
  const today = c?.today
  const avgLabel = bucket === 'month' ? 'month' : 'week'
  const avg = bucket === 'month' ? c?.monthAvg : c?.weekAvg
  return (
    <div className="card">
      <PersonHeader p={p} />
      <div className="grid" style={{ marginTop: 10 }}>
        <div className="stat">
          <div className="label">Checklist today</div>
          <div className="value" style={{ color: today ? (today.pct >= 1 ? 'var(--good)' : today.pct < 0.7 ? 'var(--bad)' : undefined) : 'var(--muted)' }}>{today ? pct(today.pct) : '—'}</div>
          <div className="small muted">{!today ? 'not filled in yet' : today.missed.length === 0 ? 'clean shift' : `missed: ${today.missed.slice(0, 3).join(', ')}${today.missed.length > 3 ? ` +${today.missed.length - 3}` : ''}`}</div>
        </div>
        <Tile label={`Checklist · ${avgLabel} average`} value={pct(avg)} sub="target 100%" />
        <Tile label="Videos recorded" goal={g['Videos recorded']} />
        <Tile label="Insta stories" goal={g['Insta stories posted']} />
        <Tile label="Bathroom cleans" goal={g['Bathroom cleaned (# times)']} />
        <Tile label="Reviews asked for" goal={g['Reviews asked for']} />
        <Tile label="Items sold" value={b['Items sold']} />
        <Tile label="Boots rented" value={b['Boots rented']} />
        <Tile label="Field rentals" value={b['Field rentals hosted']} sub={`${b['Birthday parties hosted'] || 0} birthday parties`} />
        <Tile label="Complaints" value={b.Complaints} />
      </div>
    </div>
  )
}

function ErrorCard({ p }) {
  return <div className="card"><PersonHeader p={p} /><p className="flag small" style={{ marginBottom: 0 }}>{p.error}</p></div>
}

// Owner: which Google Sheet belongs to whom.
function ManageSheets({ onChanged }) {
  const [rows, setRows] = useState(null)
  const [saving, setSaving] = useState(false)
  const load = async () => { const { data } = await supabase.from('kpi_sheets').select('*').order('sort'); setRows(data || []) }
  useEffect(() => { load() }, [])
  const set = (i, patch) => setRows(rows.map((r, j) => j === i ? { ...r, ...patch } : r))
  async function save() {
    setSaving(true)
    for (const r of rows) {
      const sheet_id = (String(r.sheet_id || '').match(SHEET_ID_RE) || [''])[0]
      if (!r.name || !sheet_id) continue
      const rec = { name: r.name.trim(), kind: r.kind, sheet_id, sort: r.sort ?? 0, active: r.active !== false }
      if (r.id) await supabase.from('kpi_sheets').update(rec).eq('id', r.id)
      else await supabase.from('kpi_sheets').insert(rec)
    }
    setSaving(false); await load(); onChanged?.()
  }
  if (!rows) return <p className="muted small">Loading…</p>
  return (
    <div className="card accent">
      <h3 style={{ marginTop: 0 }}>Sheets</h3>
      <p className="small muted">Paste each person's Google Sheet link. The sheet must be shared "Anyone with the link · Viewer" so the dashboard can read it.</p>
      <ul className="list">
        {rows.map((r, i) => (
          <li key={r.id || i} style={{ flexWrap: 'wrap' }}>
            <input className="input" style={{ width: 110 }} value={r.name} placeholder="First name" onChange={e => set(i, { name: e.target.value })} />
            <select className="input" style={{ width: 130 }} value={r.kind} onChange={e => set(i, { kind: e.target.value })}><option value="sales">Sales</option><option value="coach">Coach</option><option value="concession">Concession</option></select>
            <input className="input grow" style={{ flex: 1, minWidth: 200 }} value={r.sheet_id} placeholder="Google Sheet link or id" onChange={e => set(i, { sheet_id: e.target.value })} />
            <label className="small muted" style={{ display: 'flex', gap: 6, alignItems: 'center' }}><input type="checkbox" checked={r.active !== false} onChange={e => set(i, { active: e.target.checked })} /> on</label>
          </li>
        ))}
      </ul>
      <div className="row" style={{ gap: 8, marginTop: 8 }}>
        <button className="btn ghost small" onClick={() => setRows([...rows, { name: '', kind: 'sales', sheet_id: '', sort: rows.length + 1, active: true }])}>+ Add person</button>
        <button className="btn small" disabled={saving} onClick={save}>{saving ? 'Saving…' : 'Save'}</button>
      </div>
    </div>
  )
}

export default function SheetsKpis({ sheets, onRefresh, owner }) {
  const [bucket, setBucket] = useState('week')
  const [manage, setManage] = useState(false)
  const [busy, setBusy] = useState(false)
  const people = sheets?.people || []
  const refresh = async () => { setBusy(true); try { await onRefresh?.() } finally { setBusy(false) } }
  const Section = ({ title, kind, Card }) => {
    const list = people.filter(p => p.kind === kind)
    if (!list.length) return null
    return <><h3 className="muted" style={{ margin: '14px 0 6px', fontWeight: 500 }}>{title}</h3>{list.map(p => p.error ? <ErrorCard key={p.sheetId} p={p} /> : <Card key={p.sheetId} p={p} bucket={bucket} />)}</>
  }
  return (
    <>
      <div className="row between wrap" style={{ marginTop: 18, gap: 8 }}>
        <h2 style={{ margin: 0 }}>Team KPIs · Google Sheets</h2>
        <div className="row wrap" style={{ gap: 4 }}>
          {[['today', 'Today'], ['week', 'This week'], ['month', 'This month']].map(([k, l]) => <button key={k} className={`chip ${bucket === k ? 'on' : ''}`} onClick={() => setBucket(k)}>{l}</button>)}
          <button className="btn ghost small" disabled={busy} onClick={refresh}>{busy ? '…' : 'Refresh'}</button>
          {owner && <button className="btn ghost small" onClick={() => setManage(!manage)}>{manage ? 'Close' : 'Manage sheets'}</button>}
        </div>
      </div>
      {manage && <ManageSheets onChanged={refresh} />}
      {!sheets ? <p className="muted">Loading sheets…</p>
        : sheets.error && !sheets.people ? <div className="card"><p className="flag" style={{ margin: 0 }}>Sheets: {sheets.error}</p></div>
        : !sheets.connected ? <div className="card"><p className="muted" style={{ margin: 0 }}>{sheets.hint || 'No sheets linked yet.'}</p></div>
        : (
          <>
            <Section title="Sales" kind="sales" Card={SalesCard} />
            <Section title="Coaches" kind="coach" Card={CoachCard} />
            <Section title="Concession" kind="concession" Card={ConcessionCard} />
            <p className="small muted">Targets come from the yellow cells on each person's sheet. Week targets count Mon–Sat worked so far; month targets assume six days a week. On track = 100%+, Close = 70%+.</p>
          </>
        )}
    </>
  )
}
