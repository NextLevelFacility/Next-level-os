import { createClient } from '@supabase/supabase-js'

const url = import.meta.env.VITE_SUPABASE_URL
const key = import.meta.env.VITE_SUPABASE_ANON_KEY

export const configured = Boolean(url && key)
export const supabase = configured ? createClient(url, key) : null

export const ROLES = {
  owner: 'Owner',
  operator: 'Operator',
  coach: 'Coach',
  sales: 'Sales',
  frontdesk: 'Front desk',
  newhire: 'New hire',
}

export const isManager = (role) => role === 'owner' || role === 'operator'
