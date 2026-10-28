// Live sales from Square: today / last 7 days / month to date, memberships (subscriptions), and clinic sign-ups by keyword.
// Needs SQUARE_ACCESS_TOKEN in Netlify env vars (Square Developer → your app → Production → Access token). Optional: SQUARE_LOCATION_ID.
const { requireUser, json } = require('./_auth')

const SQ = 'https://connect.squareup.com/v2'
const headers = () => ({ Authorization: `Bearer ${process.env.SQUARE_ACCESS_TOKEN}`, 'Content-Type': 'application/json', 'Square-Version': '2025-01-23' })

async function listPayments(begin, end) {
  let cursor, out = []
  do {
    const qs = new URLSearchParams({ begin_time: begin, end_time: end, sort_order: 'ASC', limit: '100' })
    if (process.env.SQUARE_LOCATION_ID) qs.set('location_id', process.env.SQUARE_LOCATION_ID)
    if (cursor) qs.set('cursor', cursor)
    const r = await fetch(`${SQ}/payments?${qs}`, { headers: headers() })
    const d = await r.json()
    if (d.errors) throw new Error(d.errors.map(e => e.detail || e.code).join('; '))
    out = out.concat(d.payments || []); cursor = d.cursor
  } while (cursor)
  return out.filter(p => p.status === 'COMPLETED')
}
async function listOrders(ids) {
  if (!ids.length) return {}
  const orders = {}
  for (let i = 0; i < ids.length; i += 100) {
    const r = await fetch(`${SQ}/orders/batch-retrieve`, { method: 'POST', headers: headers(), body: JSON.stringify({ order_ids: ids.slice(i, i + 100) }) })
    const d = await r.json()
    for (const o of d.orders || []) orders[o.id] = o
  }
  return orders
}
async function activeSubscriptions() {
  try {
    const r = await fetch(`${SQ}/subscriptions/search`, { method: 'POST', headers: headers(), body: JSON.stringify({ query: { filter: {} }, limit: 200 }) })
    const d = await r.json()
    const subs = d.subscriptions || []
    return { active: subs.filter(s => s.status === 'ACTIVE').length, total: subs.length }
  } catch { return { active: null, total: null } }
}

const sum = (ps) => ps.reduce((a, p) => a + (p.amount_money?.amount || 0), 0) / 100

exports.handler = async (event) => {
  const ctx = await requireUser(event)
  if (!ctx) return json(401, { error: 'Sign in required' })
  if (!process.env.SQUARE_ACCESS_TOKEN) return json(200, { connected: false, hint: 'Add SQUARE_ACCESS_TOKEN in Netlify → Environment variables.' })
  try {
    const now = new Date()
    const startToday = new Date(now); startToday.setHours(0, 0, 0, 0)
    const start7 = new Date(startToday); start7.setDate(start7.getDate() - 6)
    const startMonth = new Date(now.getFullYear(), now.getMonth(), 1)
    const start90 = new Date(startToday); start90.setDate(start90.getDate() - 90)
    const payments = await listPayments(start90.toISOString(), now.toISOString())
    const orders = await listOrders([...new Set(payments.map(p => p.order_id).filter(Boolean))])

    const inRange = (p, from) => new Date(p.created_at) >= from
    const todayP = payments.filter(p => inRange(p, startToday)), weekP = payments.filter(p => inRange(p, start7)), monthP = payments.filter(p => inRange(p, startMonth))

    // Item breakdown this month (what sold)
    const items = {}
    const membershipWords = /member|semi|private|homeschool|monthly|program|speed/i
    let membershipMonth = 0
    for (const p of monthP) {
      const o = orders[p.order_id]
      for (const li of o?.line_items || []) {
        const name = li.name || 'Other'
        const amt = (li.total_money?.amount || 0) / 100
        items[name] = (items[name] || 0) + amt
        if (membershipWords.test(name)) membershipMonth += amt
      }
    }
    // Clinic sign-ups by keyword (last 90 days)
    const clinics = {}
    for (const p of payments) {
      const o = orders[p.order_id]
      for (const li of o?.line_items || []) {
        clinics[li.name] = clinics[li.name] || { count: 0, amount: 0, paymentIds: [] }
        clinics[li.name].count += Number(li.quantity || 1)
        clinics[li.name].amount += (li.total_money?.amount || 0) / 100
        clinics[li.name].paymentIds.push({ id: p.id, at: p.created_at, note: p.note || '', buyer: p.buyer_email_address || '' })
      }
    }
    const subs = await activeSubscriptions()
    return json(200, {
      connected: true,
      today: { sales: sum(todayP), count: todayP.length },
      week: { sales: sum(weekP), count: weekP.length },
      month: { sales: sum(monthP), count: monthP.length, memberships: membershipMonth },
      items: Object.entries(items).sort((a, b) => b[1] - a[1]).slice(0, 12),
      lineItems: clinics,
      subscriptions: subs,
      asOf: now.toISOString(),
    })
  } catch (e) {
    return json(200, { connected: true, error: String(e.message || e) })
  }
}
