import { useState } from 'react'
import { money } from '../lib/api'

// What the team typed into the Google Sheets today, this week and this month.
const fmtDay = (k) => k ? new Date(k + 'T12:00:00').toLocaleDateString(undefined, { month: 'short', day: 'numeric' }) : '—'
const Cell = ({ v, moneyFmt }) => <td style={{ textAlign: 'right', fontFeatureSettings: '"tnum" 1' }}>{moneyFmt ? money(v || 0) : (v || 0)}</td>

function Table({ people, metrics, bucket, moneyCols = [], extra }) {
  return (
    <div style={{ overflowX: 'auto' }}>
      <table className="kpi">
        <thead><tr><th>Name</th>{metrics.map(m => <th key={m}>{m}</th>)}{extra && <th>{extra[0]}</th>}</tr></thead>
        <tbody>
          {people.map(p => (
            <tr key={p.name}>
              <td><div style={{ fontWeight: 500 }}>{p.name}</div><div className="small muted">{p.filledToday ? 'filled today' : p.lastFilled ? `last filled ${fmtDay(p.lastFilled)}` : 'nothing yet'}</div></td>
              {metrics.map(m => <Cell key={m} v={p[bucket][m]} moneyFmt={moneyCols.includes(m)} />)}
              {extra && <td style={{ textAlign: 'right' }}>{extra[1](p)}</td>}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

export default function SheetsKpis({ sheets }) {
  const [bucket, setBucket] = useState('today')
  const s = sheets?.sheets || {}
  const notReady = !sheets || (!sheets.connected && !sheets.error)
  return (
    <>
      <div className="row between wrap" style={{ marginTop: 18 }}>
        <h2 style={{ margin: 0 }}>Team KPIs · Google Sheets</h2>
        <div className="row" style={{ gap: 4 }}>{[['today', 'Today'], ['week', 'This week'], ['month', 'This month']].map(([k, l]) => <button key={k} className={`chip ${bucket === k ? 'on' : ''}`} onClick={() => setBucket(k)}>{l}</button>)}</div>
      </div>
      {!sheets ? <p className="muted">Loading sheets…</p> : notReady || (!sheets.connected) ? (
        <div className="card"><p className="muted" style={{ margin: 0 }}>Google Sheets aren't connected yet. Add <code>KPI_SHEET_SALES</code>, <code>KPI_SHEET_COACHES</code> and <code>KPI_SHEET_CONCESSION</code> in Netlify → Environment variables.</p></div>
      ) : sheets.error ? <div className="card"><p className="flag" style={{ margin: 0 }}>Sheets: {sheets.error}</p></div> : (
        <>
          <div className="card">
            <div className="row between wrap"><h3 style={{ margin: 0 }}>Sales · Abe & Vittorio</h3>{s.sales?.url && <a className="small" href={s.sales.url} target="_blank" rel="noreferrer">Open sheet</a>}</div>
            {s.sales?.error ? <p className="flag small">{s.sales.error}</p> : s.sales ? (
              <>
                <div className="grid" style={{ margin: '10px 0' }}>
                  {[['Calls', s.sales.team[bucket]['Calls']], ['Meetings booked', s.sales.team[bucket]['Meetings Booked']], ['Showed', s.sales.team[bucket]['Showed']], ['Sold', s.sales.team[bucket]['Sold of showed']], ['Upfront cash', money(s.sales.team[bucket]['Upfront Cash Collected'] || 0)]].map(([l, v]) => <div className="stat" key={l}><div className="label">{l}</div><div className="value">{v || 0}</div></div>)}
                </div>
                <Table people={s.sales.people} metrics={s.sales.metrics} bucket={bucket} moneyCols={['Upfront Cash Collected']} extra={['Rate (wk avg)', p => p.rateWeek ?? '—']} />
              </>
            ) : <p className="muted small">Sheet id not set.</p>}
          </div>
          <div className="card">
            <div className="row between wrap"><h3 style={{ margin: 0 }}>Coaches · sessions & players</h3>{s.coaches?.url && <a className="small" href={s.coaches.url} target="_blank" rel="noreferrer">Open sheet</a>}</div>
            {s.coaches?.error ? <p className="flag small">{s.coaches.error}</p> : s.coaches ? (
              <>
                <div className="grid" style={{ margin: '10px 0' }}>
                  <div className="stat"><div className="label">Sessions trained</div><div className="value">{s.coaches.team[bucket]['Sessions trained'] || 0}</div></div>
                  <div className="stat"><div className="label">Players trained</div><div className="value">{s.coaches.team[bucket]['Total players trained'] || 0}</div></div>
                </div>
                <Table people={s.coaches.people} metrics={s.coaches.metrics} bucket={bucket} />
              </>
            ) : <p className="muted small">Sheet id not set.</p>}
          </div>
          <div className="card">
            <div className="row between wrap"><h3 style={{ margin: 0 }}>Concession · checklist & KPIs</h3>{s.concession?.url && <a className="small" href={s.concession.url} target="_blank" rel="noreferrer">Open sheet</a>}</div>
            {s.concession?.error ? <p className="flag small">{s.concession.error}</p> : s.concession ? (
              <>
                <div className="grid" style={{ margin: '10px 0' }}>
                  {Object.entries(s.concession.today || {}).map(([name, v]) => <div className="stat" key={name}><div className="label">{name} · checklist today</div><div className="value" style={{ color: v.pct === 100 ? 'var(--good)' : v.pct < 70 ? 'var(--bad)' : undefined }}>{v.pct}%</div>{v.missed.length > 0 && <div className="small muted">missed: {v.missed.slice(0, 3).join(', ')}{v.missed.length > 3 ? '…' : ''}</div>}</div>)}
                  {Object.keys(s.concession.today || {}).length === 0 && <div className="stat"><div className="label">Checklist today</div><div className="value muted">—</div><div className="small muted">not filled in yet</div></div>}
                  <div className="stat"><div className="label">Checklist · week avg</div><div className="value">{s.concession.checklistWeekAvg != null ? s.concession.checklistWeekAvg + '%' : '—'}</div></div>
                  <div className="stat"><div className="label">Checklist · month avg</div><div className="value">{s.concession.checklistMonthAvg != null ? s.concession.checklistMonthAvg + '%' : '—'}</div></div>
                </div>
                <Table people={s.concession.people} metrics={s.concession.metrics} bucket={bucket} />
              </>
            ) : <p className="muted small">Sheet id not set.</p>}
          </div>
        </>
      )}
    </>
  )
}
