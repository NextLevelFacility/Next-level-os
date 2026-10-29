import { useEffect, useState } from 'react'
import { callFn, money } from '../lib/api'

// The numbers the whole team should see, live: this month's sales, members, leads, evaluations.
export default function LiveNumbers({ title = 'Live numbers', showSales = true }) {
  const [sq, setSq] = useState(null)
  const [pp, setPp] = useState(null)
  const [ghl, setGhl] = useState(null)
  useEffect(() => {
    callFn('square-summary').then(setSq).catch(() => setSq({}))
    callFn('pushpress-summary').then(setPp).catch(() => setPp({}))
    callFn('ghl-summary').then(setGhl).catch(() => setGhl({}))
  }, [])
  const ok = (x) => x && x.connected && !x.error
  const tiles = []
  if (showSales && ok(sq)) tiles.push(['Sales · month', money(sq.month.sales), `${money(sq.today.sales)} today`])
  if (ok(pp)) tiles.push(['Active members', pp.active ?? '—', `${pp.cancellations_month ?? 0} cancelled this month`])
  if (ok(ghl)) tiles.push(['New leads today', ghl.leads.today, `${ghl.leads.week} this week`], ['Evals today', ghl.appointments.today, `${ghl.appointments.upcoming7} booked · 7 days`], ['Show rate · month', ghl.appointments.month?.showRate != null ? ghl.appointments.month.showRate + '%' : '—', `${ghl.appointments.month?.showed ?? 0} showed · ${ghl.appointments.month?.noshow ?? 0} no-show`])
  if (!tiles.length) return null
  return (
    <div className="card">
      <div className="row between"><h2 style={{ margin: 0 }}>{title}</h2><span className="small muted">updates every few minutes</span></div>
      <div className="grid" style={{ marginTop: 8 }}>
        {tiles.map(([l, v, s]) => <div className="stat" key={l}><div className="label">{l}</div><div className="value">{v}</div>{s && <div className="small muted">{s}</div>}</div>)}
      </div>
    </div>
  )
}
