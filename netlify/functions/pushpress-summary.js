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

  try {
    // 0) Can this key talk to PushPress at all?
    const pr = await probe()
    if (!pr.ok) {
      return json(200, { connected: true, error: `PushPress rejected the API key (${pr.tried.join(', ')}). In PushPress go to Settings → Security & Access → API keys, create a key, and paste the whole key into Netlify as PUSHPRESS_API_KEY (no spaces). If your key covers more than one gym, also add PUSHPRESS_COMPANY_ID.` })
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
    const enrName = (e) => nameOf(byId.get(e.customerId) || e.customer || e) || 'Member'
    const endOf = (e) => e.endDate ? new Date(e.endDate) : dateOf(e)
    const monthStart = since(), now = new Date()

    const st = (e) => norm(e.status)
    const running = enrollments.filter(e => st(e) === 'active' || st(e) === 'alert' || /^pending/.test(st(e)))
    const paused = enrollments.filter(e => st(e) === 'paused')
    const alerts = enrollments.filter(e => st(e) === 'alert')
    const canceled = enrollments.filter(e => /cancel/.test(st(e)))
    const plans = {}
    for (const e of running) { const n = planLabel(e); plans[n] = (plans[n] || 0) + 1 }
    // Canceled with an end date still ahead = leaving (save them). End date already passed this month = churned this month.
    const leaving = canceled.filter(e => { const d = endOf(e); return d && d > now }).map(e => ({ name: enrName(e), plan: planLabel(e), at: endOf(e).toISOString() }))
    const cancelled = canceled.filter(e => { const d = endOf(e); return d && d <= now && d >= monthStart }).map(e => ({ name: enrName(e), plan: planLabel(e), at: endOf(e).toISOString() }))
    const alertList = alerts.map(e => ({ name: enrName(e), plan: planLabel(e), at: e.nextCharge || e.lastCharge || null }))

    // Active members = people PushPress itself calls members (role). Falls back to unique customers on a running plan.
    const active = members.length || new Set(running.map(e => e.customerId)).size || null

    return json(200, {
      connected: true,
      company: pr.company?.name || pr.company?.data?.name || null,
      active, total: customers.length, leads, ex_members: exMembers, cancelled_total: exMembers || canceled.length,
      active_enrollments: running.length, paused: paused.length, alerts: alerts.length,
      alert_list: alertList.slice(0, 20),
      plans: Object.entries(plans).sort((a, b) => b[1] - a[1]).slice(0, 12),
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
    })
  } catch (e) {
    return json(200, { connected: true, error: String(e.message || e), shape: { auth: authStyle?.[0], raw: rawShapes } })
  }
}
