import { useState } from 'react'
import { money } from '../lib/api'

// Overall revenue, one look: Square sales by category + PushPress memberships, as an interactive donut.
const COLORS = ['#C9A227', '#4E9BE6', '#34C77B', '#E5484D', '#A274E8', '#F08A3C', '#3CC8C8', '#D6D6DC']
const PERIODS = [['today', 'Today'], ['week', 'Last 7 days'], ['month', 'This month']]

function arc(cx, cy, r, a0, a1) {
  const p = (a) => [cx + r * Math.sin(a), cy - r * Math.cos(a)]
  const [x0, y0] = p(a0), [x1, y1] = p(a1)
  return `M ${x0} ${y0} A ${r} ${r} 0 ${a1 - a0 > Math.PI ? 1 : 0} 1 ${x1} ${y1}`
}

export default function RevenuePie({ sq, pp }) {
  const [period, setPeriod] = useState('month')
  const [members, setMembers] = useState('billed')         // billed | expected
  const [hover, setHover] = useState(null)
  if (!sq) return <div className="card"><h3 style={{ marginTop: 0 }}>Revenue</h3><p className="muted small">Loading…</p></div>

  const cats = sq?.[period]?.cats || {}
  const slices = Object.entries(cats).map(([name, v]) => ({ name, amount: v.amount || 0, count: v.count || 0, src: 'Square' }))
  const rev = pp?.revenue
  if (period === 'month' && rev) {
    const amt = members === 'billed' ? rev.chargedMonth : (rev.expectedMonth ?? rev.mrr)
    slices.push({ name: members === 'billed' ? 'Memberships · billed so far (est.)' : 'Memberships · full month (est.)', amount: amt || 0, src: 'PushPress · price list' })
  }
  const list = slices.filter(s => s.amount > 0).sort((a, b) => b.amount - a.amount).map((s, i) => ({ ...s, color: COLORS[i % COLORS.length] }))
  const total = list.reduce((a, s) => a + s.amount, 0)

  let a = 0
  const arcs = list.map(s => { const span = total ? (s.amount / total) * Math.PI * 2 : 0; const out = { ...s, a0: a, a1: a + span }; a += span; return out })
  const active = hover != null ? list[hover] : null
  const size = 220, cx = size / 2, cy = size / 2, r = 82

  return (
    <div className="card">
      <div className="row between wrap" style={{ gap: 8 }}>
        <h3 style={{ margin: 0 }}>Where the money comes from</h3>
        <div className="row wrap" style={{ gap: 4 }}>{PERIODS.map(([k, l]) => <button key={k} className={`chip ${period === k ? 'on' : ''}`} onClick={() => { setPeriod(k); setHover(null) }}>{l}</button>)}</div>
      </div>
      {period === 'month' && rev && (
        <div className="row wrap" style={{ gap: 4, marginTop: 8 }}>
          <span className="small muted" style={{ alignSelf: 'center' }}>Memberships:</span>
          <button className={`chip ${members === 'billed' ? 'on' : ''}`} onClick={() => setMembers('billed')}>Billed so far</button>
          <button className={`chip ${members === 'expected' ? 'on' : ''}`} onClick={() => setMembers('expected')}>Full month (expected)</button>
        </div>
      )}
      {total === 0 ? <p className="muted small" style={{ marginTop: 12 }}>No revenue recorded for this period yet.</p> : (
        <div className="row wrap" style={{ gap: 18, marginTop: 12, alignItems: 'center' }}>
          <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} style={{ flex: '0 0 auto', maxWidth: '100%' }} onMouseLeave={() => setHover(null)}>
            {arcs.length === 1 ? (
              <circle cx={cx} cy={cy} r={r} fill="none" stroke={arcs[0].color} strokeWidth={hover === 0 ? 34 : 28} onMouseEnter={() => setHover(0)} onClick={() => setHover(hover === 0 ? null : 0)} style={{ cursor: 'pointer' }} />
            ) : arcs.map((s, i) => (
              <path key={s.name} d={arc(cx, cy, r, s.a0, s.a1 - 0.012)} fill="none" stroke={s.color} strokeWidth={hover === i ? 34 : 28} opacity={hover == null || hover === i ? 1 : 0.35}
                onMouseEnter={() => setHover(i)} onClick={() => setHover(hover === i ? null : i)} style={{ cursor: 'pointer', transition: 'stroke-width .15s, opacity .15s' }} />
            ))}
            <text x={cx} y={cy - 8} textAnchor="middle" fill="var(--muted)" fontSize="11">{active ? active.name.slice(0, 26) : 'Total'}</text>
            <text x={cx} y={cy + 16} textAnchor="middle" fill="var(--text)" fontSize="22" fontWeight="600">{money(active ? active.amount : total)}</text>
            {active && <text x={cx} y={cy + 34} textAnchor="middle" fill="var(--muted)" fontSize="11">{Math.round(active.amount / total * 100)}% of total</text>}
          </svg>
          <ul className="list" style={{ flex: 1, minWidth: 220 }}>
            {list.map((s, i) => (
              <li key={s.name} onMouseEnter={() => setHover(i)} onMouseLeave={() => setHover(null)} onClick={() => setHover(hover === i ? null : i)} style={{ cursor: 'pointer', padding: '7px 0', opacity: hover == null || hover === i ? 1 : 0.5 }}>
                <span style={{ width: 10, height: 10, borderRadius: 3, background: s.color, flex: '0 0 auto' }} />
                <span className="grow small"><div style={{ fontWeight: 500 }}>{s.name}</div><div className="muted">{s.src}{s.count ? ` · ${s.count}` : ''}</div></span>
                <span className="small" style={{ textAlign: 'right' }}><div style={{ fontWeight: 600 }}>{money(s.amount)}</div><div className="muted">{Math.round(s.amount / total * 100)}%</div></span>
              </li>
            ))}
            <li style={{ padding: '8px 0' }}><span className="grow small" style={{ fontWeight: 600 }}>Total</span><span style={{ fontWeight: 700, color: 'var(--gold)' }}>{money(total)}</span></li>
          </ul>
        </div>
      )}
      <p className="small muted" style={{ marginBottom: 0 }}>{period === 'month' ? 'Square sales this month + PushPress memberships (charge dates from PushPress × your price list). ' : 'Square sales only — memberships bill on their own cycles, see "This month". '}Tap a slice for its share.</p>
    </div>
  )
}
