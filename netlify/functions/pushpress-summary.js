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

export const handler = async (event) => {
  const ctx = await requireUser(event)
  if (!ctx) return json(401, { error: 'Sign in required' })
  if (!KEY()) return json(200, { connected: false, hint: 'Add PUSHPRESS_API_KEY in Netlify → Environment variables.' })
  let body = {}
  try { body = JSON.parse(event.body || '{}') } catch {}
  if (body.debug && ctx.profile && ['owner', 'operator'].includes(ctx.profile.role)) return json(200, await debug())
  return json(200, await cached(ctx.sb, 'pushpress', () => summary(ctx.sb), { force: Boolean(body.force) }))
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

    // Plan prices live in the app (PushPress has none). Seed new plans with a guess from the name (3x/2x/1x per week), the Owner edits the rest.
    const guessPrice = (name = '') => { const m = name.match(/(\d)\s*x\s*\/?\s*week/i); if (!m) return null; return { 3: 720, 2: 560, 1: 360, 4: 880, 5: 1500 }[Number(m[1])] ?? null }
    let prices = {}
    try {
      const { data: rows } = await sb.from('plan_prices').select('plan_id, name, monthly_price')
      for (const r of rows || []) prices[r.plan_id] = r
      const missing = [...planCache.entries()].filter(([id, pl]) => pl && !prices[id]).map(([id, pl]) => ({ plan_id: id, name: pl.name, category: pl.category, monthly_price: guessPrice(pl.name) }))
      if (missing.length) { const { error } = await sb.from('plan_prices').upsert(missing, { onConflict: 'plan_id' }); if (!error) for (const m of missing) prices[m.plan_id] = m }
    } catch {}
    const priceOf = (e) => { const v = prices[e.planId]?.monthly_price; return v == null || v === '' ? null : Number(v) }
    const enrName = (e) => nameOf(byId.get(e.customerId) || e.customer || e) || 'Member'
    const endOf = (e) => e.endDate ? new Date(e.endDate) : dateOf(e)
    const monthStart = since(), now = new Date()

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

    return {
      connected: true,
      company: pr.company?.name || pr.company?.data?.name || null,
      active, total: customers.length, leads, ex_members: exMembers, cancelled_total: exMembers || canceled.length,
      pushpress_members: members.length,
      active_enrollments: running.length, paused: pausedIds.size, paused_plans: paused.length, alerts: alertIds.size,
      alert_list: alertList.slice(0, 20),
      plans: Object.entries(plans).sort((a, b) => b[1] - a[1]).slice(0, 12),
      revenue: (() => {
        const priced = running.filter(e => priceOf(e) != null)
        const mrr = priced.reduce((a, e) => a + priceOf(e), 0)
        const unpriced = [...new Set(running.filter(e => priceOf(e) == null).map(e => planLabel(e)))]
        const chargedMonth = running.filter(e => e.lastCharge && new Date(e.lastCharge) >= monthStart && priceOf(e) != null).reduce((a, e) => a + priceOf(e), 0)
        const dueRest = running.filter(e => e.nextCharge && new Date(e.nextCharge) >= now && new Date(e.nextCharge) <= new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59) && priceOf(e) != null).reduce((a, e) => a + priceOf(e), 0)
        return { mrr, chargedMonth, dueRest, pricedPlans: priced.length, unpricedPlans: running.length - priced.length, unpriced, plansList: [...planCache.entries()].filter(([, pl]) => pl).map(([id, pl]) => ({ id, name: pl.name, category: pl.category, price: prices[id]?.monthly_price ?? null, active: running.filter(e => e.planId === id).length })).sort((a, b) => b.active - a.active) }
      })(),
      cancellations_month: cancelled.length,
      cancelled: cancelled.sort((a, b) => (b.at || '').localeCompare(a.at || '')).slice(0, 50),
      pending_cancel: leaving.length,
      leaving: leaving.sort((a, b) => (a.at || '').localeCompare(b.at || '')).slice(0, 50),
      asOf: now.toISOString(),
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
