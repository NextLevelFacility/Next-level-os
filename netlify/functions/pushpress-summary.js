// Members, plans and cancellations from PushPress.
// Needs PUSHPRESS_API_KEY in Netlify env vars. Optional: PUSHPRESS_COMPANY_ID (if the key covers several gyms), PUSHPRESS_API_BASE.
import { requireUser, json } from './_auth.js'

const BASE = (process.env.PUSHPRESS_API_BASE || 'https://api.pushpress.com/v3').replace(/\/$/, '')
const PAGE = 100

function headers() {
  const key = process.env.PUSHPRESS_API_KEY
  const h = { Accept: 'application/json', 'API-KEY': key, 'x-api-key': key, Authorization: `Bearer ${key}` }
  const cid = process.env.PUSHPRESS_COMPANY_ID
  if (cid) { h.companyId = cid; h['company-id'] = cid }
  return h
}

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
    const list = Array.isArray(d) ? d : (d.data || d.results || d.items || d.customers || d.enrollments || [])
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
const isActive = (s) => /^(active|member|current|paid|trialing|trial|frozen|hold|on[_ -]?hold)/.test(s) && !/inactive/.test(s)
const isCancelled = (s) => /cancel|former|inactive|terminated|expired|ended|churn/.test(s)
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
  if (!process.env.PUSHPRESS_API_KEY) return json(200, { connected: false, hint: 'Add PUSHPRESS_API_KEY in Netlify → Environment variables.' })

  try {
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
      shape: {   // diagnostics only — key names and counts, never member data
        customers: customers.length, customerKeys: Object.keys(customers[0] || {}).slice(0, 40), statusField, statusValues,
        enrollments: enrollments ? enrollments.length : null, enrollmentKeys: Object.keys((enrollments || [])[0] || {}).slice(0, 40), enrollErr,
      },
    })
  } catch (e) {
    return json(200, { connected: true, error: String(e.message || e) })
  }
}
