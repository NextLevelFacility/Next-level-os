// Staff Files — every submission of the employee onboarding form on Jotform, one file per person. Owner only.
// Needs JOTFORM_API_KEY in Netlify env vars (Jotform → Settings → API → Create New Key, "Read Access").
// Optional: JOTFORM_STAFF_FORM_ID (otherwise the newest form with "onboarding" or "employee" in its title is used),
//           JOTFORM_API_BASE (https://eu-api.jotform.com or https://hipaa-api.jotform.com if the account lives there).
// Photos and documents are not sent here — the page asks jotform-file for each one, so they never sit anywhere public.
import { requireUser, json } from './_auth.js'

const BASE = () => (process.env.JOTFORM_API_BASE || 'https://api.jotform.com').replace(/\/$/, '')
const KEY = () => (process.env.JOTFORM_API_KEY || '').trim()

async function jf(path) {
  const r = await fetch(`${BASE()}${path}${path.includes('?') ? '&' : '?'}limit=1000`, { headers: { APIKEY: KEY() } })
  const d = await r.json().catch(() => ({}))
  if (!r.ok || (d.responseCode && d.responseCode !== 200)) { const e = new Error(d.message || `Jotform responded ${r.status}`); e.status = r.status; throw e }
  return d.content
}

export const isOwner = (ctx) => ctx?.profile?.role === 'owner' || (ctx?.profile?.roles || []).includes('owner')

const SKIP = new Set(['control_head', 'control_button', 'control_text', 'control_pagebreak', 'control_collapse', 'control_divider', 'control_image', 'control_captcha', 'control_widget_spacer'])
const FILE_TYPES = new Set(['control_fileupload', 'control_signature', 'control_camera'])
const isFileUrl = (s) => typeof s === 'string' && /^https:\/\/[^/]*jotform\.(com|us|eu)\/(uploads|widget-uploads)\//i.test(s)

// Turns one Jotform answer into plain text (or a list of file links).
function value(a) {
  const ans = a.answer
  if (ans == null || ans === '') return null
  if (FILE_TYPES.has(a.type) || (Array.isArray(ans) && ans.every(isFileUrl)) || isFileUrl(ans)) {
    const files = (Array.isArray(ans) ? ans : [ans]).filter(isFileUrl)
    return files.length ? { files } : null
  }
  if (a.prettyFormat) return String(a.prettyFormat).replace(/<br\s*\/?>/gi, '\n').replace(/<[^>]+>/g, '').trim() || null
  if (typeof ans === 'object') return Object.values(ans).filter(v => v !== '' && v != null).map(v => typeof v === 'object' ? Object.values(v).join(' ') : v).join(' ').trim() || null
  return String(ans).trim() || null
}

// Long agreement paragraphs become their heading ("CONFIDENTIALITY & NON-DISCLOSURE"); the answer (signature / checkbox) stays.
function shortLabel(t) {
  const x = String(t).replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim()
  if (x.length <= 90) return x
  const head = x.split(/\s[-–—]\s/)[0]
  return head.length <= 70 ? head : x.slice(0, 60).trim() + '…'
}

const pick = (fields, re) => fields.find(f => re.test(f.label) && typeof f.value === 'string')?.value || ''

export const handler = async (event) => {
  const ctx = await requireUser(event)
  if (!ctx) return json(401, { error: 'Sign in required' })
  if (!isOwner(ctx)) return json(403, { error: 'Owner only' })
  if (!KEY()) return json(200, { connected: false, hint: 'Add JOTFORM_API_KEY in Netlify → Environment variables (Jotform → Settings → API → Create New Key).' })

  try {
    // 1) Which form
    let formId = (process.env.JOTFORM_STAFF_FORM_ID || '260464354317052').trim(), formTitle = ''   // default: Employee Onboarding Form
    const forms = await jf('/user/forms?orderby=created_at')
    if (formId) formTitle = (forms || []).find(f => String(f.id) === formId)?.title || ''
    else {
      const match = (forms || []).filter(f => f.status !== 'DELETED' && /onboard|employee|new hire|staff/i.test(f.title || ''))
      if (!match.length) return json(200, { connected: true, error: 'No onboarding form found. Add JOTFORM_STAFF_FORM_ID in Netlify (the number in the form URL).', forms: (forms || []).filter(f => f.status !== 'DELETED').map(f => ({ id: f.id, title: f.title })).slice(0, 40) })
      match.sort((a, b) => Number(b.count || 0) - Number(a.count || 0)); formId = String(match[0].id); formTitle = match[0].title
    }

    // 2) Every submission → one person
    const subs = await jf(`/form/${formId}/submissions?orderby=created_at`)
    const people = (subs || []).filter(s => s.status !== 'DELETED').map(s => {
      const fields = Object.entries(s.answers || {})
        .map(([qid, a]) => ({ qid, order: Number(a.order) || 0, label: shortLabel(a.text || a.name || ''), type: a.type, value: SKIP.has(a.type) ? null : value(a) }))
        .filter(f => f.value != null && f.label)
        .sort((a, b) => a.order - b.order)
      const files = fields.filter(f => f.value.files)
      const photo = files.find(f => /photo|picture|headshot|selfie|image/i.test(f.label) && !/license|licence|\bid\b|passport|card/i.test(f.label))?.value.files[0]
        || files.flatMap(f => f.value.files).find(u => /\.(jpe?g|png|webp|heic)(\?|$)/i.test(u) && !/sign/i.test(u)) || null
      const first = pick(fields, /first\s*name/i), last = pick(fields, /last\s*name/i)
      const name = pick(fields, /^(full\s*)?name$|your name|employee name/i) || [first, last].filter(Boolean).join(' ') || `Submission ${s.id}`
      return {
        id: s.id, submittedAt: s.created_at, name: name.replace(/\s+/g, ' ').trim(),
        role: pick(fields, /job title|position|role/i), email: pick(fields, /e-?mail/i), phone: pick(fields, /phone|cell|mobile/i),
        photo, fields,
      }
    }).sort((a, b) => a.name.localeCompare(b.name))

    return json(200, { connected: true, formId, formTitle, people, asOf: new Date().toISOString() })
  } catch (e) {
    const hint = e.status === 401 ? ' — check JOTFORM_API_KEY (and JOTFORM_API_BASE if your account is on the EU or HIPAA server).' : ''
    return json(200, { connected: true, error: String(e.message || e) + hint })
  }
}
