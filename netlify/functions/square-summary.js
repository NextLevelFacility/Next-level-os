// Live sales from Square: today / last 7 days / month to date, memberships (subscriptions), and clinic sign-ups by keyword.
// Needs SQUARE_ACCESS_TOKEN in Netlify env vars (Square Developer → your app → Production → Access token). Optional: SQUARE_LOCATION_ID.
import { requireUser, json } from './_auth.js'

const SQ = 'https://connect.squareup.com/v2'
const TOKEN = () => (process.env.SQUARE_ACCESS_TOKEN || '').trim()
const headers = () => ({ Authorization: `Bearer ${TOKEN()}`, 'Content-Type': 'application/json', 'Square-Version': '2025-01-23' })

// When Square says "could not be authorized", work out why without exposing the token.
async function diagnoseAuth() {
  const ping = async (host) => { try { const r = await fetch(`${host}/v2/locations`, { headers: headers() }); const d = await r.json(); return { ok: r.ok && !d.errors, status: r.status, detail: d.errors?.[0]?.detail || '' } } catch (e) { return { ok: false, status: 0, detail: String(e.message) } } }
  const prod = await ping('https://connect.squareup.com')
  if (prod.ok) return 'The token works but cannot read payments. In Square Developer → your app → Permissions (or OAuth), make sure PAYMENTS_READ, ORDERS_READ and SUBSCRIPTIONS_READ are allowed.'
  const sandbox = await ping('https://connect.squareupsandbox.com')
  if (sandbox.ok) return 'This is a SANDBOX token, so it only sees test data. In Square Developer → your app → Credentials, switch the toggle at the top from Sandbox to Production, copy the Production Access Token, and replace SQUARE_ACCESS_TOKEN in Netlify.'
  return `Square rejected the token (${prod.status}${prod.detail ? ': ' + prod.detail : ''}). Re-copy the Production Access Token from Square Developer → your app → Credentials and paste the whole thing into Netlify as SQUARE_ACCESS_TOKEN, no spaces.`
}

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
    let cursor, subs = []
    do {
      const body = { limit: 200 }
      if (process.env.SQUARE_LOCATION_ID) body.query = { filter: { location_ids: [process.env.SQUARE_LOCATION_ID] } }
      if (cursor) body.cursor = cursor
      const r = await fetch(`${SQ}/subscriptions/search`, { method: 'POST', headers: headers(), body: JSON.stringify(body) })
      const d = await r.json()
      if (d.errors) return { active: null, total: null, error: d.errors.map(e => e.detail || e.code).join('; ') }
      subs = subs.concat(d.subscriptions || []); cursor = d.cursor
    } while (cursor)
    return { active: subs.filter(s => s.status === 'ACTIVE').length, paused: subs.filter(s => s.status === 'PAUSED').length, total: subs.length }
  } catch { return { active: null, total: null } }
}

const sum = (ps) => ps.reduce((a, p) => a + (p.amount_money?.amount || 0), 0) / 100

// Netlify functions run in UTC; the business day is Miami time.
const TZ = process.env.BUSINESS_TZ || 'America/New_York'
function tzParts(d) {
  const parts = new Intl.DateTimeFormat('en-US', { timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false }).formatToParts(d)
  const get = t => Number(parts.find(p => p.type === t)?.value || 0)
  return { y: get('year'), m: get('month'), d: get('day'), h: get('hour') % 24, mi: get('minute'), s: get('second') }
}
// Midnight (in TZ) of the given local calendar day, as a real Date.
function tzMidnight(y, m, d, ref = new Date()) {
  const p = tzParts(ref)
  const offset = Date.UTC(p.y, p.m - 1, p.d, p.h, p.mi, p.s) - ref.getTime()   // TZ offset from UTC, in ms
  return new Date(Date.UTC(y, m - 1, d) - offset)
}

export const handler = async (event) => {
  const ctx = await requireUser(event)
  if (!ctx) return json(401, { error: 'Sign in required' })
  if (!TOKEN()) return json(200, { connected: false, hint: 'Add SQUARE_ACCESS_TOKEN in Netlify → Environment variables.' })
  try {
    const now = new Date()
    const t = tzParts(now)
    const startToday = tzMidnight(t.y, t.m, t.d, now)
    const start7 = new Date(startToday.getTime() - 6 * 864e5)
    const startMonth = tzMidnight(t.y, t.m, 1, now)
    const start90 = new Date(startToday.getTime() - 90 * 864e5)
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
    const msg = String(e.message || e)
    const error = /authoriz|UNAUTHORIZED|ACCESS_TOKEN/i.test(msg) ? await diagnoseAuth() : msg
    return json(200, { connected: true, error })
  }
}
