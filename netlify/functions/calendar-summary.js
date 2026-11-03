// Gabriel's NEXT LEVEL Calendar on the CEO view: today + the next 7 days, read from the calendar's secret iCal address.
// Env: CAL_ICS_URL — Google Calendar → Settings → "Gabriel's NEXT LEVEL Calendar" → Integrate calendar → "Secret address in iCal format".
import ical from 'node-ical'
import { requireUser, json } from './_auth.js'
import { cached } from './_cache.js'

const TZ = process.env.BUSINESS_TZ || 'America/New_York'
const DAYS_AHEAD = 7

function dayKeyOf(date) {
  const p = new Intl.DateTimeFormat('en-US', { timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(date)
  const g = t => p.find(x => x.type === t)?.value
  return `${g('year')}-${g('month')}-${g('day')}`
}
const timeOf = (date) => new Intl.DateTimeFormat('en-US', { timeZone: TZ, hour: 'numeric', minute: '2-digit' }).format(date)
// midnight (Miami) of today, as a UTC instant
function miamiMidnight(offsetDays = 0) {
  const k = dayKeyOf(new Date(Date.now() + offsetDays * 864e5))
  const [y, m, d] = k.split('-').map(Number)
  // find the instant where Miami's clock reads 00:00 on that day
  let t = Date.UTC(y, m - 1, d, 5)            // EST guess (UTC-5)
  const parts = new Intl.DateTimeFormat('en-US', { timeZone: TZ, hour: 'numeric', hour12: false }).formatToParts(new Date(t))
  const h = Number(parts.find(x => x.type === 'hour')?.value || 0) % 24
  if (h !== 0) t -= h * 3600e3
  return new Date(t)
}

function expand(data, from, to) {
  const out = []
  const add = (ev, start, end, baseId) => {
    if (!start || start >= to || (end && end <= from)) return
    const allDay = ev.datetype === 'date' || (ev.start && ev.start.dateOnly)
    out.push({ id: `${baseId || ev.uid}@${start.getTime()}`, title: ev.summary || '(no title)', start: start.toISOString(), end: end ? end.toISOString() : null, allDay: Boolean(allDay), location: ev.location || '', day: dayKeyOf(allDay ? new Date(start.getTime() + 12 * 3600e3) : start), time: allDay ? 'All day' : timeOf(start) + (end ? ' – ' + timeOf(end) : '') })
  }
  for (const ev of Object.values(data)) {
    if (!ev || ev.type !== 'VEVENT') continue
    if (ev.status && /cancelled/i.test(ev.status)) continue
    const dur = ev.end && ev.start ? ev.end.getTime() - ev.start.getTime() : 0
    if (ev.rrule) {
      let dates = []
      try { dates = ev.rrule.between(new Date(from.getTime() - 864e5), to, true) } catch { dates = [] }
      const ex = new Set(Object.keys(ev.exdate || {}).map(k => new Date(k).toDateString()))
      const overrides = ev.recurrences || {}
      for (const d of dates) {
        const key = d.toISOString().slice(0, 10)
        const ov = overrides[key] || overrides[d.toDateString()]
        if (ov) { if (!(ov.status && /cancelled/i.test(ov.status))) add(ov, ov.start, ov.end, ev.uid); continue }
        if (ex.has(d.toDateString())) continue
        add(ev, d, dur ? new Date(d.getTime() + dur) : null, ev.uid)
      }
      // overrides that moved into the window from outside it
      for (const ov of Object.values(overrides)) if (ov && ov.start && !dates.some(d => Math.abs(d - (ov.recurrenceid || 0)) < 1000)) add(ov, ov.start, ov.end, ev.uid)
    } else add(ev, ev.start, ev.end)
  }
  const seen = new Set()
  return out.filter(e => (seen.has(e.id) ? false : seen.add(e.id))).sort((a, b) => a.start.localeCompare(b.start))
}

async function summary() {
  const url = (process.env.CAL_ICS_URL || '').trim()
  if (!url) return { connected: false, hint: 'Add CAL_ICS_URL in Netlify → Environment variables (Google Calendar → Settings → Gabriel\'s NEXT LEVEL Calendar → Integrate calendar → Secret address in iCal format).' }
  const data = await ical.async.fromURL(url)
  const from = miamiMidnight(0), to = miamiMidnight(DAYS_AHEAD + 1)
  const events = expand(data, from, to)
  const today = dayKeyOf(new Date())
  const byDay = {}
  for (const e of events) (byDay[e.day] = byDay[e.day] || []).push(e)
  const days = [...Array(DAYS_AHEAD + 1)].map((_, i) => { const k = dayKeyOf(new Date(Date.now() + i * 864e5)); return { day: k, events: byDay[k] || [] } })
  const name = String(data?.vcalendar?.['WR-CALNAME'] || data?.vcalendar?.['X-WR-CALNAME'] || '').trim()
  return { connected: true, asOf: new Date().toISOString(), today, name, todayEvents: byDay[today] || [], days, count: events.length }
}

export const handler = async (event) => {
  const ctx = await requireUser(event)
  if (!ctx) return json(401, { error: 'Sign in required' })
  let body = {}
  try { body = JSON.parse(event.body || '{}') } catch {}
  const run = async () => { try { return await summary() } catch (e) { return { connected: true, error: String(e.message || e) } } }
  return json(200, await cached(ctx.sb, 'calendar', run, { force: Boolean(body.force) }))
}
