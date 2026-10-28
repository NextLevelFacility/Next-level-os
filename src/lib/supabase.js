import { createClient } from '@supabase/supabase-js'

const url = import.meta.env.VITE_SUPABASE_URL
const key = import.meta.env.VITE_SUPABASE_ANON_KEY

export const configured = Boolean(url && key)
export const supabase = configured ? createClient(url, key) : null

export const ROLES = {
  owner: 'Owner',
  operator: 'Operator',
  director: 'Director',
  coach: 'Coach',
  sales: 'Sales',
  frontdesk: 'Front desk',
  newhire: 'New hire',
}

export const isManager = (role) => role === 'owner' || role === 'operator'
export const isDirector = (role) => isManager(role) || role === 'director'
export const isCoach = (role) => isDirector(role) || role === 'coach'

export const FOCUS_AREAS = [
  'FIRST TOUCH', 'PASSING ACCURACY', 'SPEED OF PLAY', 'AGILITY / FOOTWORK',
  'SCANNING / AWARENESS', 'DECISION SPEED', 'COMPOSURE UNDER PRESSURE',
  'GAME IQ / TACTICAL', '1V1 ATTACKING', '1V1 DEFENDING', 'FINISHING', 'WEAK FOOT',
]

export const SESSION_TYPES = [
  'Semi-Private Technique', 'Speed & Performance', 'Private 1-on-1', 'Group Training',
  'Blueprint X', 'Homeschool Academy', 'Evaluation', 'Makeup',
]

export const PROGRAMS = [
  'Semi-Private Technique', 'Speed & Performance', 'Homeschool Academy', 'Blueprint X', 'Private 1-on-1', 'MFA Rush',
]

export const today = () => new Date().toISOString().slice(0, 10)
export const fmtDate = (d) => d ? new Date(d + (d.length === 10 ? 'T12:00:00' : '')).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' }) : ''
export const fmtTime = (t) => t ? new Date(t).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' }) : ''
export const hours = (ms) => (Math.max(0, ms) / 36e5).toFixed(1)
