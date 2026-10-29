// Shared answer cache in Supabase (table api_cache). Every screen that asks for Square / PushPress / GHL numbers
// gets the last good answer instantly; one caller refreshes it when it's older than FRESH_MS.
export const FRESH_MS = 3 * 60 * 1000

export async function getCache(sb, key) {
  try {
    const { data } = await sb.from('api_cache').select('value, updated_at').eq('key', key).maybeSingle()
    if (!data) return null
    return { value: data.value, ageMs: Date.now() - new Date(data.updated_at).getTime() }
  } catch { return null }
}

export async function setCache(sb, key, value) {
  try { await sb.from('api_cache').upsert({ key, value, updated_at: new Date().toISOString() }, { onConflict: 'key' }) } catch {}
}

// Run `fetchFresh` unless the cache is fresh; on failure fall back to the stale cache rather than an empty screen.
export async function cached(sb, key, fetchFresh, { force = false } = {}) {
  const hit = await getCache(sb, key)
  if (hit && !force && hit.ageMs < FRESH_MS) return { ...hit.value, cached: true, asOf: hit.value.asOf }
  try {
    const fresh = await fetchFresh()
    if (fresh && fresh.connected && !fresh.error) await setCache(sb, key, fresh)
    else if (hit && fresh?.error) return { ...hit.value, stale: true, error: fresh.error }
    return fresh
  } catch (e) {
    if (hit) return { ...hit.value, stale: true, error: String(e.message || e) }
    throw e
  }
}
