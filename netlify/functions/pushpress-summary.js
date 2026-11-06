// Members, plans and cancellations from PushPress.
// Needs PUSHPRESS_API_KEY in Netlify env vars. Optional: PUSHPRESS_COMPANY_ID (if the key covers several gyms), PUSHPRESS_API_BASE.
import { requireUser, json } from './_auth.js'
import { cached } from './_cache.js'

const BASE = (process.env.PUSHPRESS_API_BASE || 'https://api.pushpress.com/v3').replace(/\/$/, '')
const PAGE = 100
const KEY = () => (process.env.PUSHPRESS_API_KEY || '').trim()
const CID = () => (process.env.PUSHPRESS_COMPANY_ID || '').trim()

// PushPress accepts the key in the API-KEY header (per their SDK). We probe the alternatives once in case that changes.
const AUTH_STYLES = [
  ['API-KEY', (k) => ({ 'API-KEY': k })],
  ['x-api-key', (k) => ({ 'x-api-key': k })],
  ['Bearer', (k) => ({ Authorization: `Bearer ${k}` })],
]
let authStyle = null
function headers(style = authStyle || AUTH_STYLES[0]) {
  const h = { Accept: 'application/json', ...style[1](KEY()) }
  if (CID()) { h.companyId = CID(); h['company-id'] = CID() }
  return h
}
// Find the header style the API accepts, using the cheap /company endpoint. Returns { ok, tried } for diagnostics.
async function probe() {
  const tried = []
  for (const style of AUTH_STYLES) {
    const r = await fetch(`${BASE}/company`, { headers: headers(style) }).catch(() => null)
    tried.push(`${style[0]}→${r ? r.status : 'network error'}`)
    if (r && r.ok) { authStyle = style; const company = await r.json().catch(() => null); return { ok: true, tried, company } }
  }
  return { ok: false, tried }
}

// The list can sit at the top level, under data/results/items, or one level deeper ({ data: { customers: [...] } }).
const LIST_KEYS = ['data', 'results', 'items', 'customers', 'enrollments', 'resultArray', 'records', 'rows']
function pickList(d) {
  if (Array.isArray(d)) return d
  if (!d || typeof d !== 'object') return []
  for (const k of LIST_KEYS) if (Array.isArray(d[k])) return d[k]
  for (const v of Object.values(d)) {
    if (v && typeof v === 'object' && !Array.isArray(v)) {
      for (const k of LIST_KEYS) if (Array.isArray(v[k])) return v[k]
      const arr = Object.values(v).find(Array.isArray); if (arr) return arr
    }
  }
  return Object.values(d).find(Array.isArray) || []
}
// Shape of a response for diagnostics: key → type (arrays show length, objects show their keys). No values.
function describe(d, depth = 0) {
  if (Array.isArray(d)) return `array(${d.length})${d.length && depth < 2 ? ' of ' + describe(d[0], depth + 1) : ''}`
  if (!d || typeof d !== 'object') return typeof d
  if (depth >= 2) return 'object'
  return '{' + Object.entries(d).slice(0, 25).map(([k, v]) => `${k}: ${describe(v, depth + 1)}`).join(', ') + '}'
}
const rawShapes = {}
const planCache = new Map()   // planId → { name, category }, kept while the function instance is warm

// Pull every page of a list endpoint. Returns { list, status } — status is the first HTTP status so callers can tell 404 (no such endpoint) from 401.
async function listAll(path, params = {}) {
  const out = []
  let status = 200
  for (let page = 1; page <= 60; page++) {
    const qs = new URLSearchParams({ limit: String(PAGE), page: String(page), ...params })
    const r = await fetch(`${BASE}${path}?${qs}`, { headers: headers() })
    status = r.status
    if (!r.ok) {
      if (page > 1) break
      const t = await r.text().catch(() => '')
      const err = new Error(`PushPress responded ${r.status} on ${path}${t ? ': ' + t.slice(0, 160) : ''}`)
      err.status = r.status
      throw err
    }
    const d = await r.json().catch(() => ({}))
    if (page === 1) rawShapes[path] = describe(d)
    const list = pickList(d)
    out.push(...list)
    const more = d.hasMore ?? d.has_more ?? d.pagination?.hasMore ?? d.meta?.hasMore
    if (more === false || list.length < PAGE) break
    if (d.totalPages && page >= Number(d.totalPages)) break
  }
  return { list: out, status }
}

const STATUS_FIELDS = ['status', 'membershipStatus', 'memberStatus', 'customerStatus', 'subscriptionStatus', 'state', 'type', 'role', 'customerType']
const DATE_FIELDS = ['cancelledAt', 'canceledAt', 'cancellationDate', 'cancelDate', 'cancelled_at', 'canceled_at', 'endDate', 'endedAt', 'end_date', 'terminatedAt', 'updatedAt', 'updated_at']
const norm = (v) => String(v ?? '').trim().toLowerCase()
const statusOf = (o) => { for (const f of STATUS_FIELDS) { if (o && o[f] != null && typeof o[f] !== 'object') return norm(o[f]) } return '' }
// PushPress plan/enrollment statuses: active, alert, pending_active, pending_cancel, paused, cancelled, completed (+ customer: member/lead/former)
const isActive = (s) => /^(active|alert|pending|paused|member|current|paid|trialing|trial|frozen|hold|on[_ -]?hold)/.test(s) && !/inactive/.test(s)
const isCancelled = (s) => /cancel|former|inactive|terminated|expired|ended|completed|churn/.test(s) && !/^pending/.test(s)
const isLead = (s) => /lead|prospect/.test(s)
const dateOf = (o) => { for (const f of DATE_FIELDS) { if (o && o[f]) { const d = new Date(o[f]); if (!isNaN(d)) return d } } return null }
const nameOf = (c) => {
  if (!c) return ''
  const n = c.name
  if (n && typeof n === 'object') return [n.first || n.firstName || n.given, n.last || n.lastName || n.family].filter(Boolean).join(' ').trim() || String(n.full || n.display || '')
  return String(n || [c.firstName || c.first_name, c.lastName || c.last_name].filter(Boolean).join(' ') || c.email || c.id || '').trim()
}
const planOf = (o) => {
  const p = o.plan ?? o.membership ?? o.subscription?.plan ?? o.planName ?? o.plan_name ?? o.membershipName ?? o.product ?? o.membershipType
  if (!p) return null
  return typeof p === 'object' ? (p.name || p.title || p.id || null) : String(p)
}
const since = () => { const d = new Date(); d.setDate(1); d.setHours(0, 0, 0, 0); return d }

// ---- billing cadence. PushPress tells us the schedule (month×1, day×29, month×3, week×1, once) and the charge dates, never the amounts.
const DAY = 864e5
const parseDay = (s) => { if (!s) return null; const d = new Date(/^\d{4}-\d{2}-\d{2}$/.test(s) ? s + 'T12:00:00' : s); return isNaN(d) ? null : d }
const isOnce = (e) => norm(e.billingSchedule?.period) === 'once' || !e.billingSchedule?.period
const cycleDays = (e) => { const b = e.billingSchedule || {}, n = Number(b.interval) || 0; switch (norm(b.period)) { case 'day': return n || 30; case 'week': return (n || 1) * 7; case 'month': return (n || 1) * 30.44; case 'year': return (n || 1) * 365.25; default: return 0 } }
// How many months one charge pays for: a 28/29-day plan is a monthly plan, month×3 is a quarterly prepay, week×1 is a quarter of a month.
const cycleMonths = (e) => { const b = e.billingSchedule || {}, n = Number(b.interval) || 0; switch (norm(b.period)) { case 'month': return n || 1; case 'year': return (n || 1) * 12; case 'week': return (n || 1) / 4.345; case 'day': return (n || 30) <= 31 ? 1 : n / 30.44; default: return 1 } }
const cycleLabel = (e) => { const b = e.billingSchedule || {}, n = Number(b.interval) || 0; switch (norm(b.period)) { case 'month': return n <= 1 ? 'monthly' : `every ${n} months`; case 'year': return n <= 1 ? 'yearly' : `every ${n} years`; case 'week': return n <= 1 ? 'weekly' : `every ${n} weeks`; case 'day': return `every ${n || 30} days`; default: return 'one-time' } }
const addMonths = (d, m) => { const x = new Date(d); x.setMonth(x.getMonth() + Math.floor(m)); if (m % 1) x.setDate(x.getDate() + Math.round((m % 1) * 30.44)); return x }
// Charge dates of one enrollment inside [from, to]: the last charge, plus earlier ones for weekly plans; or the next charge(s) ahead.
function chargesBetween(e, from, to) {
  const out = [], cd = cycleDays(e)
  const push = (d) => { if (d && d >= from && d <= to) out.push(d) }
  const last = parseDay(e.lastCharge), next = parseDay(e.nextCharge)
  if (last) { push(last); if (cd && cd < 20) { let d = new Date(last.getTime() - cd * DAY); for (let i = 0; i < 8 && d >= from; i++) { push(d); d = new Date(d.getTime() - cd * DAY) } } }
  if (next && (!last || next > last)) { push(next); if (cd && cd < 20) { let d = new Date(next.getTime() + cd * DAY); for (let i = 0; i < 8 && d <= to; i++) { push(d); d = new Date(d.getTime() + cd * DAY) } } }
  return out
}

export const handler = async (event) => {
  const ctx = await requireUser(event)
  if (!ctx) return json(401, { error: 'Sign in required' })
  if (!KEY()) return json(200, { connected: false, hint: 'Add PUSHPRESS_API_KEY in Netlify → Environment variables.' })
  let body = {}
  try { body = JSON.parse(event.body || '{}') } catch {}
  if (body.debug && ctx.profile && ['owner', 'operator'].includes(ctx.profile.role)) return json(200, await debug())
  if (body.billing && ctx.profile && ['owner', 'operator'].includes(ctx.profile.role)) return json(200, await billingDebug())
  return json(200, await cached(ctx.sb, 'pushpress', () => summary(ctx.sb), { force: Boolean(body.force) }))
}

// Owner-only: billing cadence of every live plan (no names, no ids) so the revenue math can be checked.
async function billingDebug() {
  await probe()
  const { list } = await listAll('/enrollments')
  const rows = list.filter(e => !/cancel|complete/.test(norm(e.status))).map(e => ({ status: e.status, plan: planCache.get(e.planId)?.name || e.planId, period: e.billingSchedule?.period, interval: e.billingSchedule?.interval, start: e.startDate, last: e.lastCharge, next: e.nextCharge, paidUntil: e.paidUntil, end: e.endDate }))
  return { count: rows.length, rows }
}

// Owner-only: which money endpoints this PushPress key can see (shape only, no values).
async function debug() {
  await probe()
  const out = {}
  let customers = []
  try { customers = (await listAll('/customers')).list.slice(0, 1) } catch {}
  // Events (clinics) and whoever is registered on them
  try {
    const r = await fetch(`${BASE}/events?limit=50&page=1`, { headers: headers() }); const d = await r.json(); const evs = pickList(d)
    out.events = { count: evs.length, keys: Object.keys(evs[0] || {}), sample: evs.slice(0, 6).map(e => Object.fromEntries(Object.entries(e).map(([k, v]) => [k, typeof v === 'object' && v ? JSON.stringify(v).slice(0, 160) : v]))) }
    const ev = evs.find(e => /clinic|camp|thanksgiving/i.test(JSON.stringify(e))) || evs[0]
    if (ev) {
      for (const path of [`/events/${ev.id}/reservations`, `/reservations?eventId=${ev.id}`, `/reservations?calendarItemId=${ev.id}`, `/reservations`, `/bookings?eventId=${ev.id}`, `/bookings`, `/check-ins?eventId=${ev.id}`, `/check-ins`, `/checkins?calendarItemId=${ev.id}`, `/checkins?type=event`, `/checkins?type=class`, `/events/${ev.id}/roster`, `/events/${ev.id}/members`, `/events/${ev.id}/signups`, `/classes/${ev.id}/reservations`, `/calendar/events/${ev.id}/reservations`, `/customers/${customers[0]?.id}/checkins`, `/customers/${customers[0]?.id}/reservations`]) {
        try { const r2 = await fetch(`${BASE}${path}${path.includes('?') ? '&' : '?'}limit=5`, { headers: headers() }); const d2 = await r2.json().catch(() => null); out['probe ' + path] = `${r2.status} · ${describe(d2)}` } catch (e) { out['probe ' + path] = String(e.message) }
      }
    }
  } catch (e) { out.eventsError = String(e.message) }
  try { const r = await fetch(`${BASE}/classes?limit=3&page=1`, { headers: headers() }); const d = await r.json(); const cl = pickList(d); out.classes = { keys: Object.keys(cl[0] || {}), sample: cl.slice(0, 2).map(e => Object.fromEntries(Object.entries(e).map(([k, v]) => [k, typeof v === 'object' && v ? JSON.stringify(v).slice(0, 160) : v]))) } } catch {}
  for (const path of ['/payments', '/invoices', '/transactions', '/charges', '/orders', '/subscriptions', '/memberships', '/billing', '/revenue', '/reports/revenue', '/checkins', '/appointments', '/classes', '/events']) {
    try {
      const r = await fetch(`${BASE}${path}?limit=5&page=1`, { headers: headers() })
      const d = await r.json().catch(() => null)
      out[path] = `${r.status} · ${describe(d)}`
    } catch (e) { out[path] = String(e.message) }
  }
  try {
    const r = await fetch(`${BASE}/enrollments?limit=1&page=1`, { headers: headers() })
    const d = await r.json(); const e = pickList(d)[0]
    out.enrollmentSample = e && Object.fromEntries(Object.entries(e).map(([k, v]) => [k, typeof v === 'object' && v ? JSON.stringify(v).slice(0, 120) : (k === 'customerId' || k === 'id' ? '…' : v)]))
  } catch {}
  try {
    const r = await fetch(`${BASE}/plans/${(await listAll('/enrollments')).list[0]?.planId}`, { headers: headers() })
    const d = await r.json(); out.planSample = JSON.stringify(d).slice(0, 600)
  } catch {}
  return out
}

async function summary(sb) {
  try {
    // 0) Can this key talk to PushPress at all?
    const pr = await probe()
    if (!pr.ok) {
      return { connected: true, error: `PushPress rejected the API key (${pr.tried.join(', ')}). In PushPress go to Settings → Security & Access → API keys, create a key, and paste the whole key into Netlify as PUSHPRESS_API_KEY (no spaces). If your key covers more than one gym, also add PUSHPRESS_COMPANY_ID.` }
    }

    // 1) Customers. PushPress tags each person with a role: member, lead, non-member, ex-member, coach, admin.
    const { list: customers } = await listAll('/customers')
    const byId = new Map(customers.map(c => [c.id, c]))
    const roleCounts = {}
    for (const c of customers) { const r = norm(c.role) || '(none)'; roleCounts[r] = (roleCounts[r] || 0) + 1 }
    const members = customers.filter(c => norm(c.role) === 'member')
    const leads = customers.filter(c => isLead(norm(c.role))).length
    const exMembers = customers.filter(c => /^ex[-_ ]?member|former/.test(norm(c.role))).length

    // 2) Enrollments = a customer on a plan. Real statuses: active, alert (payment failed), paused, canceled, completed.
    let enrollments = [], enrollErr = null
    try { enrollments = (await listAll('/enrollments')).list } catch (e) { enrollErr = e.status || String(e.message) }
    const enrStatus = {}
    for (const e of enrollments) { const st = norm(e.status) || '(none)'; enrStatus[st] = (enrStatus[st] || 0) + 1 }

    // 3) Plan names: there is no list endpoint, but GET /plans/{id} works. Resolve each distinct plan once (cached while the function is warm).
    const planIds = [...new Set(enrollments.map(e => e.planId).filter(Boolean))].filter(id => !planCache.has(id))
    await Promise.all(planIds.map(async (id) => {
      try { const r = await fetch(`${BASE}/plans/${id}`, { headers: headers() }); const d = r.ok ? await r.json() : null; const pl = d?.data || d; planCache.set(id, pl ? { name: pl.name || pl.title || null, category: pl.category?.name || null } : null) } catch { planCache.set(id, null) }
    }))
    const planLabel = (e) => planCache.get(e.planId)?.name || planOf(e) || (e.planId ? `Plan ${String(e.planId).slice(-6)}` : 'Member')

    // Plan prices live in the app (PushPress's API has no amounts). The price list: semi-private 3x/2x/1x a week = $720/$560/$360 a month,
    // with the first (evaluation) month at $997/$697/$497. New plans get seeded from the name; the Owner edits the rest.
    const tier = (name = '') => { const m = name.match(/(\d)\s*\/?\s*x\s*\/?\s*(week|wk)/i) || name.match(/(\d)x/i); return m ? Number(m[1]) : null }
    const guessPrice = (name = '') => ({ 3: 720, 2: 560, 1: 360, 4: 880, 5: 1500 }[tier(name)] ?? null)
    const guessFirst = (name = '', category = '') => /semi.?private|foundation|athlete gym|soccer/i.test(name + ' ' + category) ? ({ 3: 997, 2: 697, 1: 497 }[tier(name)] ?? null) : null
    let prices = {}
    try {
      const { data: rows } = await sb.from('plan_prices').select('plan_id, name, monthly_price, first_price, first_months')
      for (const r of rows || []) prices[r.plan_id] = r
      const missing = [...planCache.entries()].filter(([id, pl]) => pl && !prices[id]).map(([id, pl]) => ({ plan_id: id, name: pl.name, category: pl.category, monthly_price: guessPrice(pl.name), first_price: guessFirst(pl.name, pl.category), first_months: 1 }))
      if (missing.length) { const { error } = await sb.from('plan_prices').upsert(missing, { onConflict: 'plan_id' }); if (!error) for (const m of missing) prices[m.plan_id] = m }
    } catch {}
    const priceOf = (e) => { const v = prices[e.planId]?.monthly_price; return v == null || v === '' ? null : Number(v) }
    const enrName = (e) => nameOf(byId.get(e.customerId) || e.customer || e) || 'Member'
    const endOf = (e) => e.endDate ? new Date(e.endDate) : dateOf(e)
    const monthStart = since(), now = new Date(), monthEnd = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59)
    const started = (e) => parseDay(e.startDate)
    // What one charge on this date comes to: monthly price × months the cycle covers; the evaluation month(s) at the first price.
    const amountOf = (e, on) => {
      const p = prices[e.planId]; const m = priceOf(e); if (m == null) return null
      if (isOnce(e)) return m                                   // session packs: the stored price is the pack price
      const cm = cycleMonths(e), first = p?.first_price == null || p.first_price === '' ? null : Number(p.first_price), introMonths = Number(p?.first_months || 1)
      const s = started(e)
      const inIntro = first != null && s && on && on < new Date(addMonths(s, introMonths).getTime() - 3 * DAY)
      if (!inIntro) return +(m * cm).toFixed(2)
      return +(first * Math.min(cm, introMonths) + m * Math.max(0, cm - introMonths)).toFixed(2)
    }

    const st = (e) => norm(e.status)
    // Active = paying and not paused (Gabriel's definition): plans in status 'active'. Paused and failed-payment plans are reported separately.
    const running = enrollments.filter(e => st(e) === 'active' || /^pending/.test(st(e)))
    const paused = enrollments.filter(e => st(e) === 'paused')
    const alerts = enrollments.filter(e => st(e) === 'alert')
    const canceled = enrollments.filter(e => /cancel/.test(st(e)))
    const plans = {}
    for (const e of running) { const n = planLabel(e); plans[n] = (plans[n] || 0) + 1 }
    // Canceled with an end date still ahead = leaving (save them). End date already passed this month = churned this month.
    const leaving = canceled.filter(e => { const d = endOf(e); return d && d > now }).map(e => ({ name: enrName(e), plan: planLabel(e), at: endOf(e).toISOString() }))
    const cancelled = canceled.filter(e => { const d = endOf(e); return d && d <= now && d >= monthStart }).map(e => ({ name: enrName(e), plan: planLabel(e), at: endOf(e).toISOString() }))
    const alertList = alerts.map(e => ({ name: enrName(e), plan: planLabel(e), at: e.nextCharge || e.lastCharge || null }))

    // Active members = unique people with a paying, not-paused plan. PushPress's own "member" role count is kept for reference.
    const activeIds = new Set(running.map(e => e.customerId).filter(Boolean))
    const pausedIds = new Set(paused.map(e => e.customerId).filter(Boolean))
    const alertIds = new Set(alerts.map(e => e.customerId).filter(Boolean))
    const active = enrollments.length ? activeIds.size : (members.length || null)

    // 4) New memberships this month and last — commission goes to whoever the customer is assigned to in PushPress.
    //    Rule (Gabriel): sales earn 12% on new Soccer Semi-Private memberships only.
    const staffById = new Map(customers.filter(c => /coach|admin|staff|owner|manager/.test(norm(c.role))).map(c => [c.id, nameOf(c)]))
    const prevMonthStart = new Date(now.getFullYear(), now.getMonth() - 1, 1)
    // A sale = a plan whose start date falls in the month (a start later this month counts: it was sold now). Sale value = the first charge.
    const memberships = enrollments.filter(e => started(e) && started(e) >= prevMonthStart && started(e) <= monthEnd).map(e => {
      const c = byId.get(e.customerId); const plan = planLabel(e); const price = amountOf(e, started(e))
      const semi = /semi.?private|foundation/i.test(plan) || /semi.?private/i.test(planCache.get(e.planId)?.category || '')
      return { name: enrName(e), plan, price, cycle: cycleLabel(e), started: e.startDate, month: started(e) >= monthStart ? 'this' : 'last', status: st(e), staff: staffById.get(c?.assignedToStaffId) || (c?.assignedToStaffId ? 'Unknown staff' : 'Unassigned'), semiPrivate: semi, commission: semi && price != null ? +(price * 0.12).toFixed(2) : 0 }
    }).sort((a, b) => String(b.started).localeCompare(String(a.started)))
    const byStaff = {}
    for (const m of memberships) { const k = m.staff; byStaff[k] = byStaff[k] || { this: { count: 0, semi: 0, sales: 0, commission: 0 }, last: { count: 0, semi: 0, sales: 0, commission: 0 } }; const b = byStaff[k][m.month]; b.count++; if (m.semiPrivate) { b.semi++; b.sales += m.price || 0; b.commission += m.commission } }

    // 5) Clinics & camps: PushPress events and who reserved a spot (grouped by title; multi-day clinics are several events with one name)
    let clinics = [], clinicErr = null
    try {
      const evs = (await listAll('/events')).list.filter(e => e.start && e.start * 1000 >= now.getTime() - 45 * 864e5 && e.start * 1000 <= now.getTime() + 400 * 864e5)
      const groups = {}
      for (const e of evs) { const t = (e.title || 'Event').trim(); const g = groups[t] = groups[t] || { title: t, ids: [], starts: e.start, ends: e.end || e.start }; g.ids.push(e.id); g.starts = Math.min(g.starts, e.start); g.ends = Math.max(g.ends, e.end || e.start) }
      const list = Object.values(groups).sort((a, b) => a.starts - b.starts).slice(0, 25)
      let budget = 70
      for (const g of list) {
        const people = new Map()
        const ids = g.ids.slice(0, Math.max(1, Math.min(g.ids.length, budget)))
        budget -= ids.length
        await Promise.all(ids.map(async (id) => {
          try { const { list: res } = await listAll('/reservations', { calendarItemId: id }); for (const r of res) { const status = norm(r.status || r.state); if (/cancel|waitlist/.test(status)) continue; const cid = r.customerId || r.customer?.id || r.id; people.set(cid, { name: nameOf(byId.get(r.customerId) || r.customer || r) || 'Member', status }) } } catch {}
        }))
        g.signups = people.size; g.names = [...people.values()].map(p => p.name).sort(); g.sessions = g.ids.length; delete g.ids
        g.starts = new Date(g.starts * 1000).toISOString(); g.ends = new Date(g.ends * 1000).toISOString()
      }
      clinics = list
      rawShapes.reservationKeys = Object.keys((await listAll('/reservations', { calendarItemId: evs[0]?.id })).list[0] || {})
    } catch (e) { clinicErr = String(e.message) }

    return {
      connected: true,
      company: pr.company?.name || pr.company?.data?.name || null,
      active, total: customers.length, leads, ex_members: exMembers, cancelled_total: exMembers || canceled.length,
      pushpress_members: members.length, pending_activation: enrollments.filter(e => /^pend.*activ/.test(st(e))).length,
      active_enrollments: running.length, paused: pausedIds.size, paused_plans: paused.length, alerts: alertIds.size,
      alert_list: alertList.slice(0, 20),
      plans: Object.entries(plans).sort((a, b) => b[1] - a[1]).slice(0, 12),
      revenue: (() => {
        // Estimates: PushPress gives the charge dates and cadence of every plan, the app's price list gives the amounts.
        const billing = running.filter(e => st(e) === 'active')           // paused and failed-payment plans don't bill
        const priced = billing.filter(e => priceOf(e) != null)
        const recurring = priced.filter(e => !isOnce(e))
        const mrr = +recurring.reduce((a, e) => a + priceOf(e), 0).toFixed(2)   // regular monthly price, whatever the cadence
        const unpriced = [...new Set(running.filter(e => priceOf(e) == null).map(e => planLabel(e)))]
        let chargedMonth = 0, chargesSoFar = 0, dueRest = 0, chargesDue = 0
        const soon = []
        for (const e of priced) {
          for (const d of chargesBetween(e, monthStart, now)) { chargedMonth += amountOf(e, d) || 0; chargesSoFar++ }
          for (const d of chargesBetween(e, new Date(now.getTime() + 1), monthEnd)) { dueRest += amountOf(e, d) || 0; chargesDue++ }
        }
        for (const e of billing) { const n = parseDay(e.nextCharge); if (n && n > now && n <= new Date(now.getTime() + 7 * DAY)) soon.push({ name: enrName(e), plan: planLabel(e), at: n.toISOString().slice(0, 10), amount: amountOf(e, n), cycle: cycleLabel(e) }) }
        soon.sort((a, b) => a.at.localeCompare(b.at))
        const cadence = {}
        for (const e of billing) { const k = cycleLabel(e); cadence[k] = (cadence[k] || 0) + 1 }
        return {
          mrr, chargedMonth: +chargedMonth.toFixed(2), dueRest: +dueRest.toFixed(2), expectedMonth: +(chargedMonth + dueRest).toFixed(2), chargesSoFar, chargesDue,
          billingPlans: billing.length, pricedPlans: priced.length, unpricedPlans: billing.length - priced.length, unpriced, cadence, soon: soon.slice(0, 30), estimated: true,
          plansList: [...planCache.entries()].filter(([, pl]) => pl).map(([id, pl]) => ({ id, name: pl.name, category: pl.category, price: prices[id]?.monthly_price ?? null, first: prices[id]?.first_price ?? null, firstMonths: prices[id]?.first_months ?? 1, active: running.filter(e => e.planId === id).length })).sort((a, b) => b.active - a.active),
        }
      })(),
      cancellations_month: cancelled.length,
      cancelled: cancelled.sort((a, b) => (b.at || '').localeCompare(a.at || '')).slice(0, 50),
      pending_cancel: leaving.length,
      leaving: leaving.sort((a, b) => (a.at || '').localeCompare(b.at || '')).slice(0, 50),
      asOf: now.toISOString(),
      memberships, commission: { pct: 12, rule: '12% on new Soccer Semi-Private memberships, credited to the assigned staff in PushPress', byStaff },
      clinics, clinicErr,
      shape: {   // diagnostics only — key names and counts, never member data
        auth: authStyle?.[0], customers: customers.length, roleCounts,
        enrollments: enrollments.length, enrollmentStatus: enrStatus, plansKnown: [...planCache.values()].filter(Boolean).length, enrollErr,
        raw: rawShapes,
      },
    }
  } catch (e) {
    return { connected: true, error: String(e.message || e), shape: { auth: authStyle?.[0], raw: rawShapes } }
  }
}
