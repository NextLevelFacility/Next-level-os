// Sales compensation and retention math, shared by the Sales board, Team → pay and the CEO page.
import { supabase } from './supabase'
import { callFn } from './api'

export const monthStart = (d = new Date()) => new Date(d.getFullYear(), d.getMonth(), 1).toISOString().slice(0, 10)
export const monthEnd = (d = new Date()) => new Date(d.getFullYear(), d.getMonth() + 1, 0).toISOString().slice(0, 10)

export const DEFAULT_COMP = { commission_pct: 12, churn_target_pct: 5, churn_bonus: 0, bonus_people: ['Abe', 'Vittorio'], active_members_manual: 0 }

export async function loadComp() {
  const { data } = await supabase.from('settings').select('value').eq('key', 'sales_comp').maybeSingle()
  return { ...DEFAULT_COMP, ...(data?.value || {}) }
}
export async function saveComp(value) {
  return supabase.from('settings').upsert({ key: 'sales_comp', value, updated_at: new Date().toISOString() }, { onConflict: 'key' })
}

// Retention for the current month: cancellations logged in the app (+ PushPress when connected) over active members.
export async function loadRetention(comp, { locationId = null, allLocations = false } = {}) {
  let q = supabase.from('sales_log').select('id, name, program, amount, note, log_date, user_id, profiles(full_name)').eq('kind', 'cancel').gte('log_date', monthStart()).lte('log_date', monthEnd()).order('created_at', { ascending: false })
  if (!allLocations && locationId) q = q.eq('location_id', locationId)
  const { data: cancels } = await q
  let pp = null
  try { pp = await callFn('pushpress-summary') } catch {}
  const ppConnected = pp?.connected && !pp?.error
  const active = ppConnected && pp.active != null ? pp.active : (Number(comp.active_members_manual) || 0)
  const ppCancels = ppConnected && pp.cancellations_month != null ? pp.cancellations_month : null
  const cancelCount = Math.max((cancels || []).length, ppCancels ?? 0)
  const churn = active > 0 ? cancelCount / active * 100 : null
  const target = Number(comp.churn_target_pct) || 5
  return {
    cancels: cancels || [], cancelCount, active, activeSource: ppConnected && pp.active != null ? 'PushPress' : 'manual',
    ppConnected, churn, target,
    onTrack: churn == null ? null : churn < target,
    lostMrr: (cancels || []).reduce((a, c) => a + (Number(c.amount) || 0), 0),
  }
}

export const commissionFor = (signed, person, comp) => signed * ((person?.pay_commission_pct ?? comp.commission_pct) / 100)
export const isBonusPerson = (person, comp) => (comp.bonus_people || []).some(n => (person?.full_name || '').toLowerCase().startsWith(String(n).toLowerCase()))
export const pct = (n) => n == null ? '—' : `${n.toFixed(1)}%`
