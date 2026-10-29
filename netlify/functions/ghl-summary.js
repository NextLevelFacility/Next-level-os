// Leads, pipeline and appointments from GoHighLevel (LeadConnector API v2).
// Needs GHL_API_KEY (a Private Integration token from Settings → Private Integrations) and GHL_LOCATION_ID in Netlify env vars.
import { requireUser, json } from './_auth.js'
import { cached } from './_cache.js'

const BASE = 'https://services.leadconnectorhq.com'
const KEY = () => (process.env.GHL_API_KEY || '').trim()
const LOC = () => (process.env.GHL_LOCATION_ID || '').trim()
const headers = () => ({ Authorization: `Bearer ${KEY()}`, Version: '2021-07-28', Accept: 'application/json', 'Content-Type': 'application/json' })

async function ghl(path, init = {}) {
  const r = await fetch(`${BASE}${path}`, { headers: headers(), ...init })
  const d = await r.json().catch(() => ({}))
  if (!r.ok) { const e = new Error(`${r.status} ${d.message || d.error || ''}`.trim()); e.status = r.status; throw e }
  return d
}

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

// Contacts created in a window: the search endpoint returns a total without paging through everyone.
async function leadsSince(startIso, endIso) {
  const d = await ghl('/contacts/search', { method: 'POST', body: JSON.stringify({ locationId: LOC(), pageLimit: 100, filters: [{ field: 'dateAdded', operator: 'range', value: { gte: startIso, lte: endIso } }], sort: [{ field: 'dateAdded', direction: 'desc' }] }) })
  return { total: d.total ?? (d.contacts || []).length, contacts: d.contacts || [] }
}

async function pipelines() {
  try { const d = await ghl(`/opportunities/pipelines?locationId=${encodeURIComponent(LOC())}`); return d.pipelines || [] } catch { return [] }
}
async function opportunities(status, extra = '') {
  let out = [], startAfter = '', startAfterId = '', guard = 0
  do {
    const d = await ghl(`/opportunities/search?location_id=${encodeURIComponent(LOC())}&limit=100&status=${status}${extra}${startAfterId ? `&startAfter=${startAfter}&startAfterId=${startAfterId}` : ''}`)
    out = out.concat(d.opportunities || [])
    startAfter = d.meta?.startAfter || ''; startAfterId = d.meta?.startAfterId || ''
    guard++
  } while (startAfterId && guard < 20)
  return out
}

async function appointments(startMs, endMs) {
  // Calendar events need a calendar (or user/group) id, so list calendars and ask each one.
  let cals = []
  try { cals = (await ghl(`/calendars/?locationId=${encodeURIComponent(LOC())}`)).calendars || [] } catch { return { events: [], calendars: 0, error: 'calendars' } }
  const events = []
  await Promise.all(cals.slice(0, 15).map(async (c) => {
    try { const d = await ghl(`/calendars/events?locationId=${encodeURIComponent(LOC())}&calendarId=${encodeURIComponent(c.id)}&startTime=${startMs}&endTime=${endMs}`); for (const e of d.events || []) events.push({ ...e, calendarName: c.name }) } catch {}
  }))
  return { events, calendars: cals.length }
}

async function summary() {
  if (!LOC()) return { connected: true, error: 'Add GHL_LOCATION_ID in Netlify (Settings → Business Profile in GoHighLevel, or the id in the URL after /location/).' }
  const now = new Date(), t = tzParts(now)
  const startToday = tzMidnight(t.y, t.m, t.d, now), start7 = new Date(startToday.getTime() - 6 * 864e5), startMonth = tzMidnight(t.y, t.m, 1, now)
  const weekAhead = new Date(startToday.getTime() + 7 * 864e5)

  // 0) Does the token work? Location lookup is the cheapest check.
  let locationName = null
  try { const d = await ghl(`/locations/${encodeURIComponent(LOC())}`); locationName = d.location?.name || null } catch (e) {
    if (e.status === 401 || e.status === 403) return { connected: true, error: `GoHighLevel rejected the token (${e.status}). In GoHighLevel: Settings → Private Integrations → create one with contacts, opportunities, calendars and locations read access → copy the token into Netlify as GHL_API_KEY. Also check GHL_LOCATION_ID is this sub-account's id.` }
  }

  const [today, week, month] = await Promise.all([leadsSince(startToday.toISOString(), now.toISOString()), leadsSince(start7.toISOString(), now.toISOString()), leadsSince(startMonth.toISOString(), now.toISOString())])
  const sources = {}
  for (const c of month.contacts) { const s = (c.source || c.attributionSource?.sessionSource || 'Unknown').trim(); sources[s] = (sources[s] || 0) + 1 }
  const newest = today.contacts.slice(0, 10).map(c => ({ name: [c.firstName, c.lastName].filter(Boolean).join(' ') || c.contactName || c.email || 'Lead', source: c.source || '', at: c.dateAdded }))

  // Pipeline
  const pls = await pipelines()
  const stageName = {}; const pipeName = {}
  for (const p of pls) { pipeName[p.id] = p.name; for (const s of p.stages || []) stageName[s.id] = s.name }
  let open = [], won = [], oppErr = null
  try { open = await opportunities('open') } catch (e) { oppErr = String(e.message) }
  try { won = await opportunities('won', `&date=${encodeURIComponent(startMonth.toISOString())}`) } catch {}
  const byStage = {}
  for (const o of open) { const k = `${pipeName[o.pipelineId] ? pipeName[o.pipelineId] + ' · ' : ''}${stageName[o.pipelineStageId] || o.pipelineStageId || 'Stage'}`; byStage[k] = (byStage[k] || 0) + 1 }
  const wonMonth = won.filter(o => new Date(o.lastStatusChangeAt || o.updatedAt || o.createdAt) >= startMonth)
  const wonValue = wonMonth.reduce((a, o) => a + (Number(o.monetaryValue) || 0), 0)

  // Appointments: this week past (showed / no-show) and next 7 days booked
  const ap = await appointments(start7.getTime(), weekAhead.getTime())
  const st = (e) => String(e.appointmentStatus || e.status || '').toLowerCase()
  const upcoming = ap.events.filter(e => new Date(e.startTime) >= now && new Date(e.startTime) < weekAhead)
  const past = ap.events.filter(e => new Date(e.startTime) < now)
  const todayAppts = ap.events.filter(e => { const s = new Date(e.startTime); return s >= startToday && s < new Date(startToday.getTime() + 864e5) })

  return {
    connected: true, location: locationName,
    leads: { today: today.total, week: week.total, month: month.total, sources: Object.entries(sources).sort((a, b) => b[1] - a[1]).slice(0, 8), newest },
    pipeline: { open: open.length, byStage: Object.entries(byStage).sort((a, b) => b[1] - a[1]).slice(0, 10), wonMonth: wonMonth.length, wonValue, error: oppErr },
    appointments: {
      calendars: ap.calendars, today: todayAppts.length, upcoming7: upcoming.length,
      showed7: past.filter(e => st(e) === 'showed').length, noshow7: past.filter(e => st(e) === 'noshow' || st(e) === 'no-show').length, cancelled7: past.filter(e => st(e) === 'cancelled').length,
      todayList: todayAppts.slice(0, 12).map(e => ({ title: e.title, at: e.startTime, status: st(e), calendar: e.calendarName })).sort((a, b) => a.at.localeCompare(b.at)),
    },
    asOf: now.toISOString(),
  }
}

export const handler = async (event) => {
  const ctx = await requireUser(event)
  if (!ctx) return json(401, { error: 'Sign in required' })
  if (!KEY()) return json(200, { connected: false, hint: 'Add GHL_API_KEY and GHL_LOCATION_ID in Netlify → Environment variables.' })
  let body = {}
  try { body = JSON.parse(event.body || '{}') } catch {}
  const run = async () => { try { return await summary() } catch (e) { return { connected: true, error: String(e.message || e) } } }
  return json(200, await cached(ctx.sb, 'ghl', run, { force: Boolean(body.force) }))
}
