// Streams one uploaded file (photo, ID, signature, document) from Jotform to the signed-in Owner.
// Only Jotform upload URLs are allowed, and the API key never leaves the server.
import { requireUser, json } from './_auth.js'
import { isOwner } from './jotform-staff.js'

const ALLOWED = /^https:\/\/([a-z0-9-]+\.)*jotform\.(com|us|eu)\/(uploads|widget-uploads)\//i

export const handler = async (event) => {
  const ctx = await requireUser(event)
  if (!ctx) return json(401, { error: 'Sign in required' })
  if (!isOwner(ctx)) return json(403, { error: 'Owner only' })
  const url = event.queryStringParameters?.url || ''
  if (!ALLOWED.test(url)) return json(400, { error: 'Not a Jotform upload' })
  const key = (process.env.JOTFORM_API_KEY || '').trim()
  try {
    let r = await fetch(url, { headers: key ? { APIKEY: key } : {}, redirect: 'follow' })
    if (!r.ok && key) r = await fetch(url + (url.includes('?') ? '&' : '?') + 'apiKey=' + encodeURIComponent(key), { redirect: 'follow' })
    if (!r.ok) return json(r.status, { error: `Jotform responded ${r.status}` })
    const type = r.headers.get('content-type') || 'application/octet-stream'
    if (/text\/html/i.test(type)) return json(403, { error: 'Jotform asked for a sign-in for this file' })
    const buf = Buffer.from(await r.arrayBuffer())
    if (buf.length > 5.5 * 1024 * 1024) return json(413, { error: 'File too large to preview — open it in Jotform' })
    return { statusCode: 200, isBase64Encoded: true, headers: { 'content-type': type, 'cache-control': 'private, no-store' }, body: buf.toString('base64') }
  } catch (e) {
    return json(502, { error: String(e.message || e) })
  }
}
