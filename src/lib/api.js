import { supabase } from './supabase'

// Calls a Netlify function with the signed-in user's token.
export async function callFn(name, body) {
  const { data } = await supabase.auth.getSession()
  const token = data?.session?.access_token
  const r = await fetch(`/.netlify/functions/${name}`, {
    method: body ? 'POST' : 'GET',
    headers: { 'content-type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  })
  const text = await r.text()
  try { return JSON.parse(text) } catch { return { error: text || `HTTP ${r.status}` } }
}

export const money = (n) => (n == null || isNaN(n)) ? '—' : '$' + Number(n).toLocaleString(undefined, { maximumFractionDigits: 0 })
