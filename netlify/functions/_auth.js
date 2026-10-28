// Verifies the caller is a signed-in Next Level OS user. Returns the user or null.
const { createClient } = require('@supabase/supabase-js')

async function requireUser(event) {
  const auth = event.headers.authorization || event.headers.Authorization || ''
  const token = auth.replace(/^Bearer\s+/i, '')
  if (!token) return null
  const url = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL
  const key = process.env.VITE_SUPABASE_ANON_KEY || process.env.SUPABASE_ANON_KEY
  if (!url || !key) return null
  const sb = createClient(url, key, { global: { headers: { Authorization: `Bearer ${token}` } } })
  const { data, error } = await sb.auth.getUser(token)
  if (error || !data?.user) return null
  const { data: profile } = await sb.from('profiles').select('*').eq('id', data.user.id).single()
  return { user: data.user, profile, sb }
}

const json = (status, body) => ({ statusCode: status, headers: { 'content-type': 'application/json', 'cache-control': 'no-store' }, body: JSON.stringify(body) })

module.exports = { requireUser, json }
