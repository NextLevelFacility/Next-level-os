// Active members from PushPress. Needs PUSHPRESS_API_KEY (and optionally PUSHPRESS_SUBDOMAIN) in Netlify env vars.
const { requireUser, json } = require('./_auth')

exports.handler = async (event) => {
  const ctx = await requireUser(event)
  if (!ctx) return json(401, { error: 'Sign in required' })
  const key = process.env.PUSHPRESS_API_KEY
  if (!key) return json(200, { connected: false, hint: 'Add PUSHPRESS_API_KEY in Netlify → Environment variables.' })
  try {
    // PushPress public API (v3). Counts active members; falls back to the customers list if the members endpoint is unavailable.
    const base = process.env.PUSHPRESS_API_BASE || 'https://api.pushpress.com/v3'
    const h = { 'x-api-key': key, 'Content-Type': 'application/json' }
    let active = null, total = null, plans = {}
    let r = await fetch(`${base}/customers?limit=500&status=active`, { headers: h })
    if (r.ok) {
      const d = await r.json()
      const list = d.data || d.customers || d.results || []
      active = list.length; total = d.total ?? d.count ?? list.length
      for (const c of list) { const p = c.plan || c.membership || c.subscription?.plan?.name || 'Member'; plans[p] = (plans[p] || 0) + 1 }
    } else {
      return json(200, { connected: true, error: `PushPress responded ${r.status}. Check the API key or base URL.` })
    }
    return json(200, { connected: true, active, total, plans: Object.entries(plans).sort((a, b) => b[1] - a[1]).slice(0, 10), asOf: new Date().toISOString() })
  } catch (e) {
    return json(200, { connected: true, error: String(e.message || e) })
  }
}
