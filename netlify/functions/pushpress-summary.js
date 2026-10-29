// Members, plans and cancellations from PushPress.
// Needs PUSHPRESS_API_KEY in Netlify env vars. Optional: PUSHPRESS_COMPANY_ID (if the key covers several gyms), PUSHPRESS_API_BASE.
import { requireUser, json } from './_auth.js'

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
const nameOf = (c) => (c.name || [c.firstName || c.first_name, c.lastName || c.last_name].filter(Boolean).join(' ') || c.email || c.id || '').trim()
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

  try {
    // 0) Can this key talk to PushPress at all?
    const pr = await probe()
    if (!pr.ok) {
      return json(200, { connected: true, error: `PushPress rejected the API key (${pr.tried.join(', ')}). In PushPress go to Settings → Security & Access → API keys, create a key, and paste the whole key into Netlify as PUSHPRESS_API_KEY (no spaces). If your key covers more than one gym, also add PUSHPRESS_COMPANY_ID.` })
    }

    // 1) Customers: members, former members and leads
    const { list: customers } = await listAll('/customers')
    const statusValues = {}
    for (const c of customers) { const s = statusOf(c) || '(none)'; statusValues[s] = (statusValues[s] || 0) + 1 }
    const statusField = STATUS_FIELDS.find(f => customers.some(c => c && c[f] != null && typeof c[f] !== 'object')) || null

    // 2) Enrollments (memberships on a plan), when the key can see them. Gives plan names and cancellation dates.
    let enrollments = null, enrollErr = null
    try { enrollments = (await listAll('/enrollments')).list } catch (e) { enrollErr = e.status || String(e.message) }
    const monthStart = since()

    let active = null, total = customers.length, leads = null, cancelledAll = null, cancelled = [], plans = {}
    if (enrollments && enrollments.length) {
      const activeEnr = enrollments.filter(e => isActive(statusOf(e)) || (!statusOf(e) && !dateOf(e)))
      const ids = new Set(activeEnr.map(e => e.customerId || e.customer_id || e.customer?.id || e.userId || e.id))
      active = ids.size
      for (const e of activeEnr) { const p = planOf(e) || 'Member'; plans[p] = (plans[p] || 0) + 1 }
      cancelled = enrollments.filter(e => isCancelled(statusOf(e))).map(e => ({ name: nameOf(e.customer || e), plan: planOf(e), at: dateOf(e)?.toISOString() || null })).filter(x => x.at && new Date(x.at) >= monthStart)
      cancelledAll = enrollments.filter(e => isCancelled(statusOf(e))).length
    }
    if (active == null && statusField) {
      active = customers.filter(c => isActive(statusOf(c))).length
      leads = customers.filter(c => isLead(statusOf(c))).length
      cancelledAll = customers.filter(c => isCancelled(statusOf(c))).length
      for (const c of customers.filter(c => isActive(statusOf(c)))) { const p = planOf(c) || 'Member'; plans[p] = (plans[p] || 0) + 1 }
      if (!cancelled.length) cancelled = customers.filter(c => isCancelled(statusOf(c))).map(c => ({ name: nameOf(c), plan: planOf(c), at: dateOf(c)?.toISOString() || null })).filter(x => x.at && new Date(x.at) >= monthStart)
    }
    if (active == null) {
      // No status anywhere: treat everyone the API returns as a customer and let the Owner keep the manual count for churn.
      active = null
    }

    return json(200, {
      connected: true,
      active, total, leads, cancelled_total: cancelledAll,
      plans: Object.entries(plans).sort((a, b) => b[1] - a[1]).slice(0, 10),
      cancellations_month: active == null ? null : cancelled.length,
      cancelled: cancelled.sort((a, b) => (b.at || '').localeCompare(a.at || '')).slice(0, 50),
      asOf: new Date().toISOString(),
      company: pr.company?.name || pr.company?.data?.name || null,
      shape: {   // diagnostics only — key names and counts, never member data
        auth: authStyle?.[0], customers: customers.length, customerKeys: Object.keys(customers[0] || {}).slice(0, 40), statusField, statusValues,
        enrollments: enrollments ? enrollments.length : null, enrollmentKeys: Object.keys((enrollments || [])[0] || {}).slice(0, 40), enrollErr,
        raw: rawShapes,
      },
    })
  } catch (e) {
    return json(200, { connected: true, error: String(e.message || e), shape: { auth: authStyle?.[0], raw: rawShapes } })
  }
}
