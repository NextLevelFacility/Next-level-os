// Live sales from Square: today / last 7 days / month to date, by category (field rentals, birthday parties, concession, training, clinics).
// Needs SQUARE_ACCESS_TOKEN in Netlify env vars (Square Developer → your app → Production → Access token). Optional: SQUARE_LOCATION_ID.
import { requireUser, json } from './_auth.js'
import { cached } from './_cache.js'

const SQ = 'https://connect.squareup.com/v2'
const TOKEN = () => (process.env.SQUARE_ACCESS_TOKEN || '').trim()
const headers = () => ({ Authorization: `Bearer ${TOKEN()}`, 'Content-Type': 'application/json', 'Square-Version': '2025-01-23' })

async function sq(path, init) {
  const r = await fetch(`${SQ}${path}`, { headers: headers(), ...init })
  const d = await r.json().catch(() => ({}))
  if (d.errors) { const e = new Error(d.errors.map(e => e.detail || e.code).join('; ')); e.code = d.errors[0]?.code; throw e }
  return d
}

let locCache = null
async function locationIds() {
  if (process.env.SQUARE_LOCATION_ID) return [process.env.SQUARE_LOCATION_ID.trim()]
  if (locCache) return locCache
  const d = await sq('/locations')
  locCache = (d.locations || []).filter(l => l.status !== 'INACTIVE').map(l => l.id)
  return locCache
}

// Completed orders in a window — one call per 500 orders, line items included (far faster than payments + order lookups).
async function completedOrders(startAt, endAt) {
  const ids = await locationIds()
  let cursor, out = []
  do {
    const body = { location_ids: ids.slice(0, 10), limit: 500, return_entries: false, query: { filter: { date_time_filter: { closed_at: { start_at: startAt, end_at: endAt } }, state_filter: { states: ['COMPLETED'] } }, sort: { sort_field: 'CLOSED_AT', sort_order: 'DESC' } } }
    if (cursor) body.cursor = cursor
    const d = await sq('/orders/search', { method: 'POST', body: JSON.stringify(body) })
    out = out.concat(d.orders || []); cursor = d.cursor
  } while (cursor && out.length < 20000)
  return out
}

async function subscriptions() {
  try {
    let cursor, subs = []
    do {
      const body = { limit: 200 }
      if (process.env.SQUARE_LOCATION_ID) body.query = { filter: { location_ids: [process.env.SQUARE_LOCATION_ID.trim()] } }
      if (cursor) body.cursor = cursor
      const d = await sq('/subscriptions/search', { method: 'POST', body: JSON.stringify(body) })
      subs = subs.concat(d.subscriptions || []); cursor = d.cursor
    } while (cursor)
    return { active: subs.filter(s => s.status === 'ACTIVE').length, paused: subs.filter(s => s.status === 'PAUSED').length, total: subs.length }
  } catch { return { active: null, total: null } }
}

// When Square says "could not be authorized", work out why without exposing the token.
async function diagnoseAuth() {
  const ping = async (host) => { try { const r = await fetch(`${host}/v2/locations`, { headers: headers() }); const d = await r.json(); return { ok: r.ok && !d.errors, status: r.status, detail: d.errors?.[0]?.detail || '' } } catch (e) { return { ok: false, status: 0, detail: String(e.message) } } }
  const prod = await ping('https://connect.squareup.com')
  if (prod.ok) return 'The token works but cannot read orders. In Square Developer → your app, make sure ORDERS_READ, PAYMENTS_READ, MERCHANT_PROFILE_READ and SUBSCRIPTIONS_READ are allowed.'
  const sandbox = await ping('https://connect.squareupsandbox.com')
  if (sandbox.ok) return 'This is a SANDBOX token, so it only sees test data. In Square Developer → your app → Credentials, switch the toggle at the top from Sandbox to Production, copy the Production Access Token, and replace SQUARE_ACCESS_TOKEN in Netlify.'
  return `Square rejected the token (${prod.status}${prod.detail ? ': ' + prod.detail : ''}). Re-copy the Production Access Token from Square Developer → your app → Credentials and paste the whole thing into Netlify as SQUARE_ACCESS_TOKEN, no spaces.`
}

// Netlify functions run in UTC; the business day is Miami time.
const TZ = process.env.BUSINESS_TZ || 'America/New_York'
function tzParts(d) {
  const parts = new Intl.DateTimeFormat('en-US', { timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false }).formatToParts(d)
  const get = t => Number(parts.find(p => p.type === t)?.value || 0)
  return { y: get('year'), m: get('month'), d: get('day'), h: get('hour') % 24, mi: get('minute'), s: get('second') }
}
function tzMidnight(y, m, d, ref = new Date()) {
  const p = tzParts(ref)
  const offset = Date.UTC(p.y, p.m - 1, p.d, p.h, p.mi, p.s) - ref.getTime()
  return new Date(Date.UTC(y, m - 1, d) - offset)
}

// What Square actually sells at Next Level. Memberships bill through PushPress.
const CATS = [
  ['Field rentals', /field\s*rental|plei|pitch rental|rental \(/i],
  ['Birthday parties', /birthday|bday|party/i],
  ['Boot rentals', /boot/i],
  ['Clinics & camps', /clinic|camp|blueprint|thanksgiving|winter|spring break|summer/i],
  ['Training', /x\s*\/\s*week|session pack|sessions?\b|semi|private|program|rehab|paid in full|first month|homeschool|speed|training|membership|member/i],
]
const catOf = (name) => (CATS.find(([, re]) => re.test(name || '')) || ['Concession & other'])[0]
const emptyCats = () => Object.fromEntries([...CATS.map(c => c[0]), 'Concession & other'].map(c => [c, { amount: 0, count: 0 }]))
const orderTotal = (o) => ((o.total_money?.amount || 0) - (o.return_amounts?.total_money?.amount || 0)) / 100

function breakdown(orders) {
  const cats = emptyCats(), items = {}
  let sales = 0
  for (const o of orders) {
    sales += orderTotal(o)
    const lis = o.line_items || []
    if (!lis.length) { cats['Concession & other'].amount += orderTotal(o); cats['Concession & other'].count += 1; continue }
    for (const li of lis) {
      const name = li.name || 'Other', amt = (li.total_money?.amount || 0) / 100, qty = Number(li.quantity || 1)
      items[name] = (items[name] || 0) + amt
      const c = cats[catOf(name)]; c.amount += amt; c.count += qty
    }
  }
  return { sales, count: orders.length, cats, items: Object.entries(items).sort((a, b) => b[1] - a[1]).slice(0, 15) }
}

async function summary({ days = 0 } = {}) {
  const now = new Date()
  const t = tzParts(now)
  const startToday = tzMidnight(t.y, t.m, t.d, now)
  const start7 = new Date(startToday.getTime() - 6 * 864e5)
  const startMonth = tzMidnight(t.y, t.m, 1, now)
  const windowStart = new Date(Math.min(startMonth.getTime(), start7.getTime(), days ? startToday.getTime() - days * 864e5 : Infinity))
  const orders = await completedOrders(windowStart.toISOString(), now.toISOString())
  const closedAt = (o) => new Date(o.closed_at || o.created_at)
  const todayO = orders.filter(o => closedAt(o) >= startToday), weekO = orders.filter(o => closedAt(o) >= start7), monthO = orders.filter(o => closedAt(o) >= startMonth)
  const todayB = breakdown(todayO), weekB = breakdown(weekO), monthB = breakdown(monthO)

  // Every line item in the window, for clinic sign-up matching by keyword
  const lineItems = {}
  for (const o of orders) {
    for (const li of o.line_items || []) {
      const k = li.name || 'Other'
      lineItems[k] = lineItems[k] || { count: 0, amount: 0, paymentIds: [] }
      lineItems[k].count += Number(li.quantity || 1)
      lineItems[k].amount += (li.total_money?.amount || 0) / 100
      lineItems[k].paymentIds.push({ id: o.tenders?.[0]?.payment_id || o.id, at: o.closed_at || o.created_at, note: o.note || '', buyer: o.customer_id || '' })
    }
  }
  const subs = await subscriptions()
  return {
    connected: true,
    today: { sales: todayB.sales, count: todayB.count, cats: todayB.cats },
    week: { sales: weekB.sales, count: weekB.count, cats: weekB.cats },
    month: { sales: monthB.sales, count: monthB.count, cats: monthB.cats, memberships: monthB.cats['Training'].amount },
    items: monthB.items,
    lineItems,
    windowDays: Math.round((now - windowStart) / 864e5),
    subscriptions: subs,
    asOf: now.toISOString(),
  }
}

export const handler = async (event) => {
  const ctx = await requireUser(event)
  if (!ctx) return json(401, { error: 'Sign in required' })
  if (!TOKEN()) return json(200, { connected: false, hint: 'Add SQUARE_ACCESS_TOKEN in Netlify → Environment variables.' })
  let body = {}
  try { body = JSON.parse(event.body || '{}') } catch {}
  const run = async () => {
    try { return await summary({ days: Number(body.days) || 0 }) } catch (e) {
      const msg = String(e.message || e)
      return { connected: true, error: /authoriz|UNAUTHORIZED|ACCESS_TOKEN|FORBIDDEN/i.test(msg) ? await diagnoseAuth() : msg }
    }
  }
  if (body.debug && ctx.profile && ['owner', 'operator'].includes(ctx.profile.role)) return json(200, await debug())
  if (body.days) return json(200, await run())              // the 90-day clinic pull is on demand, never cached
  return json(200, await cached(ctx.sb, 'square', run, { force: Boolean(body.force) }))
}

// Owner-only diagnostics: which Square locations the token sees, and today's money by three different routes.
async function debug() {
  const now = new Date(), t = tzParts(now)
  const startToday = tzMidnight(t.y, t.m, t.d, now)
  const out = { startToday: startToday.toISOString(), now: now.toISOString() }
  try { const d = await sq('/locations'); out.locations = (d.locations || []).map(l => ({ id: l.id, name: l.name, status: l.status })) } catch (e) { out.locationsError = String(e.message) }
  try {
    let cursor, pays = []
    do { const qs = new URLSearchParams({ begin_time: startToday.toISOString(), end_time: now.toISOString(), limit: '100' }); if (cursor) qs.set('cursor', cursor); const d = await sq(`/payments?${qs}`); pays = pays.concat(d.payments || []); cursor = d.cursor } while (cursor)
    const byLoc = {}
    for (const p of pays) { const k = p.location_id; byLoc[k] = byLoc[k] || { count: 0, amount: 0, statuses: {} }; byLoc[k].count++; byLoc[k].amount += (p.amount_money?.amount || 0) / 100; byLoc[k].statuses[p.status] = (byLoc[k].statuses[p.status] || 0) + 1 }
    out.paymentsToday = { count: pays.length, amount: pays.reduce((a, p) => a + (p.amount_money?.amount || 0) / 100, 0), byLocation: byLoc }
  } catch (e) { out.paymentsError = String(e.message) }
  try {
    const ids = await locationIds()
    for (const states of [['COMPLETED'], ['OPEN'], ['CANCELED']]) {
      const d = await sq('/orders/search', { method: 'POST', body: JSON.stringify({ location_ids: ids.slice(0, 10), limit: 500, return_entries: false, query: { filter: { date_time_filter: { created_at: { start_at: startToday.toISOString(), end_at: now.toISOString() } }, state_filter: { states } }, sort: { sort_field: 'CREATED_AT', sort_order: 'DESC' } } }) })
      const os = d.orders || []
      out['ordersToday_' + states[0]] = { count: os.length, amount: os.reduce((a, o) => a + orderTotal(o), 0), sample: os.slice(0, 3).map(o => ({ source: o.source?.name, created: o.created_at, closed: o.closed_at, total: orderTotal(o), items: (o.line_items || []).map(l => l.name).slice(0, 3) })) }
    }
  } catch (e) { out.ordersError = String(e.message) }
  return out
}
