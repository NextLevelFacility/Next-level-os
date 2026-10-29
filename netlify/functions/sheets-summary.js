// Daily KPIs the team types into Google Sheets (Sales, Coaches, Concession), rolled up for the CEO dashboard.
// Env: KPI_SHEET_SALES, KPI_SHEET_COACHES, KPI_SHEET_CONCESSION = the Google Sheet ids. Each sheet must be shared "Anyone with the link · Viewer".
import { requireUser, json } from './_auth.js'
import { cached } from './_cache.js'

const IDS = () => ({ sales: (process.env.KPI_SHEET_SALES || '').trim(), coaches: (process.env.KPI_SHEET_COACHES || '').trim(), concession: (process.env.KPI_SHEET_CONCESSION || '').trim() })

// Google's CSV export of the first tab. Works without any API key once the sheet is link-shared.
async function fetchSheet(id) {
  const r = await fetch(`https://docs.google.com/spreadsheets/d/${id}/gviz/tq?tqx=out:csv`, { redirect: 'follow' })
  const text = await r.text()
  if (!r.ok || /<html/i.test(text.slice(0, 200))) { const e = new Error('not shared'); e.code = 'share'; throw e }
  return parseCsv(text)
}
function parseCsv(text) {
  const rows = []; let row = [], field = '', q = false
  for (let i = 0; i < text.length; i++) {
    const c = text[i]
    if (q) { if (c === '"') { if (text[i + 1] === '"') { field += '"'; i++ } else q = false } else field += c }
    else if (c === '"') q = true
    else if (c === ',') { row.push(field); field = '' }
    else if (c === '\n' || c === '\r') { if (c === '\r' && text[i + 1] === '\n') i++; row.push(field); rows.push(row); row = []; field = '' }
    else field += c
  }
  if (field.length || row.length) { row.push(field); rows.push(row) }
  const header = (rows.shift() || []).map(h => h.trim())
  return rows.filter(r => r.some(v => v && v.trim())).map(r => Object.fromEntries(header.map((h, i) => [h, (r[i] || '').trim()])))
}

const TZ = process.env.BUSINESS_TZ || 'America/New_York'
function todayParts() {
  const parts = new Intl.DateTimeFormat('en-US', { timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(new Date())
  const get = t => Number(parts.find(p => p.type === t)?.value || 0)
  return { y: get('year'), m: get('month'), d: get('day') }
}
const key = (y, m, d) => `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`
// Sheet dates arrive as M/D/YYYY (or YYYY-MM-DD); keep them as calendar days, no timezone games.
function dayKey(s) {
  const a = String(s || '').trim()
  let m = a.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2,4})/); if (m) return key(m[3].length === 2 ? 2000 + Number(m[3]) : Number(m[3]), Number(m[1]), Number(m[2]))
  m = a.match(/^(\d{4})-(\d{2})-(\d{2})/); if (m) return `${m[1]}-${m[2]}-${m[3]}`
  return null
}
const num = (v) => { const n = Number(String(v ?? '').replace(/[$,\s]/g, '')); return isFinite(n) ? n : 0 }
const filled = (v) => String(v ?? '').trim() !== ''

function windows() {
  const t = todayParts()
  const today = new Date(Date.UTC(t.y, t.m - 1, t.d))
  const dow = (today.getUTCDay() + 6) % 7                      // Monday = 0
  const monday = new Date(today.getTime() - dow * 864e5)
  const k = (d) => key(d.getUTCFullYear(), d.getUTCMonth() + 1, d.getUTCDate())
  return { today: k(today), weekStart: k(monday), monthStart: key(t.y, t.m, 1), days14: [...Array(14)].map((_, i) => k(new Date(today.getTime() - (13 - i) * 864e5))) }
}

function rollup(rows, metrics, { names } = {}) {
  const w = windows()
  const people = {}
  for (const r of rows) {
    const d = dayKey(r.Date); const name = (r.Name || '').trim(); if (!d || !name) continue
    const p = people[name] = people[name] || { name, today: {}, week: {}, month: {}, lastFilled: null, filledToday: false, daily: {} }
    const any = metrics.some(m => filled(r[m]))
    if (!any) continue
    if (!p.lastFilled || d > p.lastFilled) p.lastFilled = d
    if (d === w.today) p.filledToday = true
    const add = (bucket) => { for (const m of metrics) bucket[m] = (bucket[m] || 0) + num(r[m]) }
    if (d === w.today) add(p.today)
    if (d >= w.weekStart && d <= w.today) add(p.week)
    if (d >= w.monthStart && d <= w.today) add(p.month)
    if (w.days14.includes(d)) { p.daily[d] = p.daily[d] || {}; for (const m of metrics) p.daily[d][m] = (p.daily[d][m] || 0) + num(r[m]) }
  }
  for (const n of names || []) if (!people[n]) people[n] = { name: n, today: {}, week: {}, month: {}, lastFilled: null, filledToday: false, daily: {} }
  const team = { today: {}, week: {}, month: {} }
  for (const p of Object.values(people)) for (const b of ['today', 'week', 'month']) for (const m of metrics) team[b][m] = (team[b][m] || 0) + (p[b][m] || 0)
  return { people: Object.values(people).sort((a, b) => a.name.localeCompare(b.name)), team, windows: w }
}

const SALES = ['Calls', 'Meetings Today', 'Meetings Booked', 'Showed', 'Sold of showed', 'Upfront Cash Collected', 'Referrals']
const COACH = ['Sessions trained', 'Total players trained']
const CONC_KPIS = ['Items sold', 'Boots rented', 'Field rentals hosted', 'Birthday parties hosted', 'Videos recorded', 'Insta stories posted', 'Bathroom cleaned (# times)', 'Complaints', 'Reviews asked for']

async function summary() {
  const ids = IDS()
  const out = { connected: true, asOf: new Date().toISOString(), sheets: {} }
  const load = async (k) => { if (!ids[k]) return null; try { return await fetchSheet(ids[k]) } catch (e) { out.sheets[k] = { error: e.code === 'share' ? 'Not readable yet — open the sheet → Share → General access → "Anyone with the link" → Viewer.' : String(e.message) }; return null } }
  const [sales, coaches, conc] = await Promise.all([load('sales'), load('coaches'), load('concession')])

  if (sales) {
    const r = rollup(sales, SALES, { names: ['Abe', 'Vittorio'] })
    // Rate day 1-10 is an average, not a sum
    for (const p of r.people) { const rated = sales.filter(x => (x.Name || '').trim() === p.name && filled(x['Rate day 1-10']) && dayKey(x.Date) >= r.windows.weekStart); p.rateWeek = rated.length ? +(rated.reduce((a, x) => a + num(x['Rate day 1-10']), 0) / rated.length).toFixed(1) : null }
    out.sheets.sales = { ...r, metrics: SALES, url: `https://docs.google.com/spreadsheets/d/${ids.sales}/edit` }
  }
  if (coaches) out.sheets.coaches = { ...rollup(coaches, COACH, { names: ['Simon', 'Vittorio', 'Abe'] }), metrics: COACH, url: `https://docs.google.com/spreadsheets/d/${ids.coaches}/edit` }
  if (conc) {
    const checks = Object.keys(conc[0] || {}).filter(h => h.startsWith('✓'))
    const r = rollup(conc, CONC_KPIS, { names: ['Dylan', 'Tomas'] })
    const w = r.windows
    // Checklist: per person per day, % done and what was missed
    const byDay = {}
    for (const row of conc) {
      const d = dayKey(row.Date), name = (row.Name || '').trim(); if (!d || !name) continue
      const done = checks.filter(c => num(row[c]) > 0 || /^(x|y|yes|true|✓)$/i.test(String(row[c]).trim()))
      const touched = done.length > 0 || CONC_KPIS.some(k => filled(row[k]))
      if (!touched) continue
      byDay[d] = byDay[d] || {}
      byDay[d][name] = { pct: Math.round(done.length / Math.max(1, checks.length) * 100), missed: checks.filter(c => !done.includes(c)).map(c => c.replace(/^✓\s*/, '')) }
    }
    const weekDays = Object.keys(byDay).filter(d => d >= w.weekStart && d <= w.today)
    const avg = (days) => { const v = days.flatMap(d => Object.values(byDay[d]).map(x => x.pct)); return v.length ? Math.round(v.reduce((a, b) => a + b, 0) / v.length) : null }
    out.sheets.concession = { ...r, metrics: CONC_KPIS, checklist: checks.map(c => c.replace(/^✓\s*/, '')), today: byDay[w.today] || {}, checklistWeekAvg: avg(weekDays), checklistMonthAvg: avg(Object.keys(byDay).filter(d => d >= w.monthStart && d <= w.today)), recentDays: Object.keys(byDay).sort().slice(-7).map(d => [d, byDay[d]]), url: `https://docs.google.com/spreadsheets/d/${ids.concession}/edit` }
  }
  return out
}

export const handler = async (event) => {
  const ctx = await requireUser(event)
  if (!ctx) return json(401, { error: 'Sign in required' })
  const ids = IDS()
  if (!ids.sales && !ids.coaches && !ids.concession) return json(200, { connected: false, hint: 'Add KPI_SHEET_SALES, KPI_SHEET_COACHES and KPI_SHEET_CONCESSION (the Google Sheet ids) in Netlify → Environment variables.' })
  let body = {}
  try { body = JSON.parse(event.body || '{}') } catch {}
  const run = async () => { try { return await summary() } catch (e) { return { connected: true, error: String(e.message || e) } } }
  return json(200, await cached(ctx.sb, 'sheets', run, { force: Boolean(body.force) }))
}
