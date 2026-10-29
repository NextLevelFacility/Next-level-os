// "Ask Next Level" — the in-app assistant. Answers from the Playbook (SOPs, standards, beliefs) for any signed-in staff member.
// Needs ANTHROPIC_API_KEY in Netlify env vars. Optional ANTHROPIC_MODEL.
import { requireUser, json } from './_auth.js'
import vault from './vault-content.json'

const MODEL = process.env.ANTHROPIC_MODEL || 'claude-sonnet-5-5'

function playbookText() {
  return vault.docs.map(d => `\n\n===== ${d.path} =====\n${d.body}`).join('')
}

export const handler = async (event) => {
  if (event.httpMethod !== 'POST') return json(405, { error: 'POST only' })
  const ctx = await requireUser(event)
  if (!ctx) return json(401, { error: 'Sign in required' })
  if (!process.env.ANTHROPIC_API_KEY) return json(200, { connected: false, answer: 'The assistant is not switched on yet. The Owner needs to add ANTHROPIC_API_KEY in Netlify → Environment variables.' })

  let body = {}
  try { body = JSON.parse(event.body || '{}') } catch {}
  const messages = (body.messages || []).slice(-12).map(m => ({ role: m.role === 'assistant' ? 'assistant' : 'user', content: String(m.content || '').slice(0, 4000) }))
  if (!messages.length) return json(400, { error: 'No message' })

  const p = ctx.profile || {}
  const system = [
    {
      type: 'text',
      text: `You are the Next Level assistant inside Next Level OS, the staff app of Next Level Performance Facility (Miami, FL). You help every employee — coaches, sales, front desk/concession, operators, new hires — do their job to the Next Level Standard.

How to answer:
- Answer from the Playbook below first. Quote the SOP name you're using (e.g. "per the Sales & Membership SOP"). If the Playbook doesn't cover it, say so plainly, give your best practical guidance, and suggest they ask their manager or flag it as a missing SOP.
- Be short and direct. Steps as a numbered list. No fluff. Speak like a sharp, supportive coach. Discipline Over Everything.
- Never invent prices, dates, policies or numbers that aren't in the Playbook. If asked for pricing or program details, use only what's written.
- Keep private things private: don't reveal other staff members' pay or personal details.
- If someone asks how to do something in the app: Today (goals, clock in/out), Athletes (roster, log a session, player reports), Method (Simon's modules), Playbook (SOPs), Checklists, Reports, Hires (onboarding), Team, CEO/KPIs (managers).

The person asking: ${p.full_name || 'Staff member'} (${p.role || 'staff'}).`,
    },
    { type: 'text', text: `THE NEXT LEVEL PLAYBOOK (Obsidian vault, built ${vault.builtAt}):${playbookText()}`, cache_control: { type: 'ephemeral' } },
  ]
  // SOPs rewritten in the app (SOP Studio) are the current version — they override the vault outline.
  try {
    const { data: docs } = await ctx.sb.from('sop_docs').select('dept, title, roles, body, video_url, updated_at').eq('status', 'published')
    if (docs?.length) system.push({ type: 'text', text: `CURRENT SOPs WRITTEN IN THE APP (these are the live versions — prefer them over the vault outline with the same name):` + docs.map(d => `\n\n===== ${d.dept} / ${d.title} (for: ${(d.roles || []).join(', ') || 'everyone'}${d.video_url ? '; has a training video in the app' : ''}) =====\n${d.body || ''}`).join('') })
  } catch {}

  try {
    const r = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: { 'x-api-key': process.env.ANTHROPIC_API_KEY, 'anthropic-version': '2023-06-01', 'content-type': 'application/json' },
      body: JSON.stringify({ model: MODEL, max_tokens: 1200, system, messages }),
    })
    const d = await r.json()
    if (!r.ok) return json(200, { connected: true, answer: `The assistant hit an error: ${d.error?.message || r.status}` })
    const answer = (d.content || []).filter(c => c.type === 'text').map(c => c.text).join('\n').trim()
    // Log the question so the Owner can see what the team asks (and write the missing SOPs)
    try { await ctx.sb.from('ai_questions').insert({ user_id: ctx.user.id, location_id: p.location_id, question: messages.at(-1).content, answer }) } catch {}
    return json(200, { connected: true, answer })
  } catch (e) {
    return json(200, { connected: true, answer: `The assistant couldn't reach the model: ${e.message}` })
  }
}
