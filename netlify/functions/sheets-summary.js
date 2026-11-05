// One Google Sheet tracker per person (a Dashboard tab with the targets + one tab per month, e.g. "Nov 2026"), rolled up for the CEO dashboard.
// Which sheet belongs to whom lives in the kpi_sheets table (owner-editable in the app).
// Each sheet must be shared "Anyone with the link · Viewer" — the reader uses Google's public CSV export, no API key.
import { requireUser, json } from './_auth.js'
import { cached } from './_cache.js'

// ---------- Google Sheets CSV ----------
// range keeps each column a single type (Google's CSV export blanks cells that don't match a column's main type)
async function fetchTab(id, tab, range) {
  const r = await fetch(`https://docs.google.com/spreadsheets/d/${id}/gviz/tq?tqx=out:csv&headers=1&sheet=${encodeURIComponent(tab)}${range ? '&range=' + range : ''}`, { redirect: 'follow' })
  const text = await r.text()
  if (!r.ok || /<html/i.test(text.slice(0, 300))) { const e = new Error('not shared'); e.code = 'share'; throw e }
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
  return rows
}
// The daily grid on a month tab starts at the row whose first cell is "Date"; the rows above it are the person's totals.
function gridRows(rows, year) {
  const h = rows.findIndex(r => String(r[0] || '').trim() === 'Date')
  if (h < 0) return []
  const header = rows[h].map(x => x.trim()); const out = []
  for (const r of rows.slice(h + 1)) {
    const d = dayKey(r[0], year); if (!d) { if (out.length) break; else continue }
    out.push({ ...Object.fromEntries(header.map((k, i) => [k, (r[i] || '').trim()])), Date: d })
  }
  return out
}
const monthTab = (y, m) => new Date(Date.UTC(y, m - 1, 1)).toLocaleDateString('en-US', { month: 'short', year: 'numeric', timeZone: 'UTC' })   // "Nov 2026"

// ---------- calendar (Miami days) ----------
const TZ = process.env.BUSINESS_TZ || 'America/New_York'
function todayParts() {
  const parts = new Intl.DateTimeFormat('en-US', { timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(new Date())
  const get = t => Number(parts.find(p => p.type === t)?.value || 0)
  return { y: get('year'), m: get('month'), d: get('day') }
}
const key = (y, m, d) => `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`
// Dates arrive however the sheet formats them ("Thu 10/29/26", "10/29/2026", "2026-10-29") — pull the calendar day out.
function dayKey(s, year) {
  const a = String(s || '').trim()
  let m = a.match(/(\d{1,2})\/(\d{1,2})\/(\d{2,4})/); if (m) return key(m[3].length === 2 ? 2000 + Number(m[3]) : Number(m[3]), Number(m[1]), Number(m[2]))
  m = a.match(/(\d{4})-(\d{2})-(\d{2})/); if (m) return `${m[1]}-${m[2]}-${m[3]}`
  m = a.match(/^(?:[A-Za-z]{3}\.?\s+)?(\d{1,2})\/(\d{1,2})$/); if (m && year) return key(year, Number(m[1]), Number(m[2]))
  return null
}
const num = (v) => { const s = String(v ?? '').trim(); if (!s) return 0; const pct = /%$/.test(s); const n = Number(s.replace(/[$,%\s]/g, '')); return isFinite(n) ? (pct ? n / 100 : n) : 0 }
const filled = (v) => String(v ?? '').trim() !== ''
const ticked = (v) => { const s = String(v ?? '').trim(); return s !== '' && s !== '0' && !/^(false|no|n)$/i.test(s) }

function windows() {
  const t = todayParts()
  const today = new Date(Date.UTC(t.y, t.m - 1, t.d))
  const dow = (today.getUTCDay() + 6) % 7                      // Monday = 0
  const monday = new Date(today.getTime() - dow * 864e5)
  const k = (d) => key(d.getUTCFullYear(), d.getUTCMonth() + 1, d.getUTCDate())
  const weekStarts = [0, 1, 2, 3].map(i => k(new Date(monday.getTime() - i * 7 * 864e5)))
  const prev = t.m === 1 ? { y: t.y - 1, m: 12 } : { y: t.y, m: t.m - 1 }
  return { today: k(today), weekStart: k(monday), monthStart: key(t.y, t.m, 1), workDays: Math.min(6, dow + 1), dayOfMonth: t.d, weekStarts, cur: { y: t.y, m: t.m, tab: monthTab(t.y, t.m) }, prev: { ...prev, tab: monthTab(prev.y, prev.m) } }
}

// ---------- targets (the yellow cells on each sheet's Dashboard tab) ----------
const TARGET_LABELS = {
  'calls per day': 'callsPerDay', 'meetings booked per day': 'bookedPerDay', 'closes (sold) per day': 'soldPerDay', 'show rate': 'showRate', 'close rate': 'closeRate',
  'sessions trained per day': 'sessionsPerDay', 'sessions per day': 'sessionsPerDay', 'players per session': 'playersPerSession',
  'checklist completion': 'checklist', 'videos recorded per shift': 'videosPerShift', 'insta stories per shift': 'storiesPerShift', 'bathroom cleans per shift': 'bathroomPerShift', 'reviews asked for per shift': 'reviewsPerShift',
}
const DEFAULT_TARGETS = { sales: { callsPerDay: 100, bookedPerDay: 3, soldPerDay: 2, showRate: 0.6, closeRate: 0.5, sessionsPerDay: 3 }, coach: { sessionsPerDay: 4, playersPerSession: 5 }, concession: { checklist: 1, videosPerShift: 2, storiesPerShift: 3, bathroomPerShift: 3, reviewsPerShift: 2 } }
function readTargets(rows, kind) {
  const t = { ...DEFAULT_TARGETS[kind] }
  for (const r of rows) { const k = TARGET_LABELS[String(r[0] || '').trim().toLowerCase()]; if (k && filled(r[1])) t[k] = num(r[1]) }
  return t
}

// ---------- rollup ----------
const SALES = ['Calls', 'Meetings Today', 'Meetings Booked', 'Showed', 'Sold of showed', 'Upfront Cash Collected', 'Referrals']
const COACH = ['Sessions trained', 'Total players trained']
const CONC = ['Items sold', 'Boots rented', 'Field rentals hosted', 'Birthday parties hosted', 'Field rentals rented out', 'Field rental cash', 'Birthdays rented out', 'Birthday cash', 'Paper cash collected', 'Paper cash in black box (EOD)', 'Videos recorded', 'Insta stories posted', 'Bathroom cleaned (# times)', 'Complaints', 'Reviews asked for']
const state = (pct) => pct == null ? null : pct >= 1 ? 'on' : pct >= 0.7 ? 'close' : 'behind'
const goal = (actual, target) => { const t = Math.round(target || 0); const pct = t > 0 ? +(actual / t).toFixed(3) : null; return { actual, target: t, pct, state: state(pct) } }
const ratio = (a, b) => b > 0 ? +(a / b).toFixed(3) : null

function person(row, log, dash) {
  const w = windows()
  const headers = log.length ? Object.keys(log[0]) : (row.kind === 'sales' ? [...SALES, 'Rate day 1-10', ...COACH] : row.kind === 'coach' ? COACH : CONC)
  const checks = headers.filter(h => h.startsWith('✓'))
  const metrics = [...SALES, ...COACH, ...CONC].filter(m => headers.includes(m))
  const targets = readTargets(dash, row.kind)
  const p = { name: row.name, kind: row.kind, sheetId: row.sheet_id, metrics, today: {}, week: {}, month: {}, weeks: {}, lastFilled: null, filledToday: false, targets, checklist: null }
  const rated = { week: [], month: [] }
  const checkDays = {}                                           // day → {pct, missed}
  for (const r of log) {
    const d = dayKey(r.Date); if (!d) continue
    const done = checks.filter(c => ticked(r[c]))
    const touched = metrics.some(m => filled(r[m])) || done.length > 0
    if (!touched) continue
    if (!p.lastFilled || d > p.lastFilled) p.lastFilled = d
    if (d === w.today) p.filledToday = true
    const add = (bucket) => { for (const m of metrics) bucket[m] = (bucket[m] || 0) + num(r[m]) }
    if (d === w.today) add(p.today)
    if (d >= w.weekStart && d <= w.today) add(p.week)
    if (d >= w.monthStart && d <= w.today) add(p.month)
    const ws = w.weekStarts.find((s, i) => d >= s && (i === 0 || d < w.weekStarts[i - 1]))
    if (ws) add(p.weeks[ws] = p.weeks[ws] || {})
    if (filled(r['Rate day 1-10'])) { if (d >= w.weekStart && d <= w.today) rated.week.push(num(r['Rate day 1-10'])); if (d >= w.monthStart && d <= w.today) rated.month.push(num(r['Rate day 1-10'])) }
    if (checks.length) checkDays[d] = { pct: +(done.length / checks.length).toFixed(3), missed: checks.filter(c => !done.includes(c)).map(c => c.replace(/^✓\s*/, '')), done: done.map(c => c.replace(/^✓\s*/, '')) }
  }
  const avg = (xs) => xs.length ? +(xs.reduce((a, b) => a + b, 0) / xs.length).toFixed(3) : null
  p.rateWeek = avg(rated.week); p.rateMonth = avg(rated.month)

  // Goals and rates, mirroring the sheet's own Dashboard tab
  const T = targets, g = {}
  const per = (perDay) => ({ today: perDay, week: perDay * w.workDays, month: perDay * w.dayOfMonth * 6 / 7 })
  const bucketGoals = (b, mult) => {
    const out = {}
    if (row.kind === 'sales') { out.Calls = goal(p[b].Calls || 0, per(T.callsPerDay)[mult]); out['Meetings Booked'] = goal(p[b]['Meetings Booked'] || 0, per(T.bookedPerDay)[mult]); out['Sold of showed'] = goal(p[b]['Sold of showed'] || 0, per(T.soldPerDay)[mult]) }
    if (metrics.includes('Sessions trained')) out['Sessions trained'] = goal(p[b]['Sessions trained'] || 0, per(T.sessionsPerDay)[mult])
    if (row.kind === 'coach') out['Total players trained'] = goal(p[b]['Total players trained'] || 0, per(T.sessionsPerDay * T.playersPerSession)[mult])
    if (row.kind === 'concession') { out['Videos recorded'] = goal(p[b]['Videos recorded'] || 0, per(T.videosPerShift)[mult]); out['Insta stories posted'] = goal(p[b]['Insta stories posted'] || 0, per(T.storiesPerShift)[mult]); out['Bathroom cleaned (# times)'] = goal(p[b]['Bathroom cleaned (# times)'] || 0, per(T.bathroomPerShift)[mult]); out['Reviews asked for'] = goal(p[b]['Reviews asked for'] || 0, per(T.reviewsPerShift)[mult]) }
    return out
  }
  p.goals = { today: bucketGoals('today', 'today'), week: bucketGoals('week', 'week'), month: bucketGoals('month', 'month') }
  if (row.kind === 'sales') {
    p.rates = {
      showWeek: ratio(p.week.Showed || 0, p.week['Meetings Today'] || 0), showMonth: ratio(p.month.Showed || 0, p.month['Meetings Today'] || 0),
      closeWeek: ratio(p.week['Sold of showed'] || 0, p.week.Showed || 0), closeMonth: ratio(p.month['Sold of showed'] || 0, p.month.Showed || 0),
      callsPerBookedWeek: ratio(p.week.Calls || 0, p.week['Meetings Booked'] || 0), cashPerSaleMonth: ratio(p.month['Upfront Cash Collected'] || 0, p.month['Sold of showed'] || 0),
    }
  }
  if (metrics.includes('Sessions trained')) p.rates = { ...(p.rates || {}), playersPerSessionWeek: ratio(p.week['Total players trained'] || 0, p.week['Sessions trained'] || 0), playersPerSessionMonth: ratio(p.month['Total players trained'] || 0, p.month['Sessions trained'] || 0) }
  if (checks.length) {
    const days = Object.keys(checkDays)
    const wk = days.filter(d => d >= w.weekStart && d <= w.today), mo = days.filter(d => d >= w.monthStart && d <= w.today)
    const items = checks.map(c => c.replace(/^✓\s*/, ''))
    // Per item: was it done today, and on how many of the logged shifts this week / month
    const byItem = {}
    for (const it of items) {
      const t = checkDays[w.today]
      byItem[it] = { today: t ? t.done.includes(it) : null, week: { done: wk.filter(d => checkDays[d].done.includes(it)).length, shifts: wk.length }, month: { done: mo.filter(d => checkDays[d].done.includes(it)).length, shifts: mo.length } }
    }
    p.checklist = { items, byItem, today: checkDays[w.today] || null, weekAvg: avg(wk.map(d => checkDays[d].pct)), monthAvg: avg(mo.map(d => checkDays[d].pct)), recent: days.sort().slice(-7).map(d => [d, checkDays[d]]) }
  }
  return p
}

async function summary(sb) {
  const { data: rows, error } = await sb.from('kpi_sheets').select('*').eq('active', true).order('sort')
  if (error) return { connected: false, error: error.message, hint: 'Run supabase/phase13-kpi-sheets.sql' }
  if (!rows?.length) return { connected: false, hint: 'No sheets linked yet — add each person\'s Google Sheet under Team KPIs → Manage sheets.' }
  const w = windows()
  const out = { connected: true, asOf: new Date().toISOString(), windows: w, people: [], sheets: { sales: { people: [] }, coaches: { people: [] }, concession: { people: [] } } }
  await Promise.all(rows.map(async (row) => {
    const url = `https://docs.google.com/spreadsheets/d/${row.sheet_id}/edit`
    try {
      const [curRows, prevRows, dash] = await Promise.all([fetchTab(row.sheet_id, w.cur.tab, 'A10:Z42'), fetchTab(row.sheet_id, w.prev.tab, 'A10:Z42').catch(() => []), fetchTab(row.sheet_id, 'Dashboard', 'A6:C12').catch(() => [])])
      const curGrid = gridRows(curRows, w.cur.y)
      if (!curGrid.length) throw new Error(`No "${w.cur.tab}" tab in this sheet — add the month tab (duplicate last month's and change the date in B3).`)
      const log = [...gridRows(prevRows, w.prev.y), ...curGrid]
      out.people.push({ ...person(row, log, dash), url, tab: w.cur.tab })
    } catch (e) {
      out.people.push({ name: row.name, kind: row.kind, sheetId: row.sheet_id, url, error: e.code === 'share' ? 'Not readable yet — open the sheet → Share → General access → "Anyone with the link" → Viewer.' : String(e.message || e) })
    }
  }))
  out.people.sort((a, b) => rows.findIndex(r => r.sheet_id === a.sheetId) - rows.findIndex(r => r.sheet_id === b.sheetId))
  // Grouped views (the pay card reads coaches[].month['Sessions trained'])
  for (const p of out.people) {
    if (p.kind === 'sales') out.sheets.sales.people.push(p)
    if (p.kind === 'coach' || p.metrics?.includes('Sessions trained')) out.sheets.coaches.people.push(p)
    if (p.kind === 'concession') out.sheets.concession.people.push(p)
  }
  const team = (people, metrics) => { const t = { today: {}, week: {}, month: {} }; for (const p of people) if (!p.error) for (const b of ['today', 'week', 'month']) for (const m of metrics) t[b][m] = (t[b][m] || 0) + (p[b][m] || 0); return t }
  out.sheets.sales.team = team(out.sheets.sales.people, SALES); out.sheets.sales.metrics = SALES
  out.sheets.coaches.team = team(out.sheets.coaches.people, COACH); out.sheets.coaches.metrics = COACH
  out.sheets.concession.team = team(out.sheets.concession.people, CONC); out.sheets.concession.metrics = CONC
  return out
}

export const handler = async (event) => {
  const ctx = await requireUser(event)
  if (!ctx) return json(401, { error: 'Sign in required' })
  let body = {}
  try { body = JSON.parse(event.body || '{}') } catch {}
  const run = async () => { try { return await summary(ctx.sb) } catch (e) { return { connected: true, error: String(e.message || e) } } }
  return json(200, await cached(ctx.sb, 'sheets', run, { force: Boolean(body.force) }))
}
