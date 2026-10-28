import { createContext, useContext, useEffect, useState } from 'react'
import { supabase, configured } from './supabase'

const Ctx = createContext(null)

export function AuthProvider({ children }) {
  const [session, setSession] = useState(undefined)
  const [profile, setProfile] = useState(null)
  const [locations, setLocations] = useState([])
  const [viewAs, setViewAsState] = useState(() => { try { return sessionStorage.getItem('nl-view-as') || '' } catch { return '' } })
  const setViewAs = (v) => { setViewAsState(v || ''); try { v ? sessionStorage.setItem('nl-view-as', v) : sessionStorage.removeItem('nl-view-as') } catch {} }

  async function loadProfile(user, attempt = 0) {
    if (!user) { setProfile(null); return }
    const { data } = await supabase.from('profiles').select('*').eq('id', user.id).maybeSingle()
    if (!data && attempt < 6) { setTimeout(() => loadProfile(user, attempt + 1), 1500); return }  // the sign-up trigger may still be creating it
    setProfile(data)
    const { data: locs } = await supabase.from('locations').select('*').order('name')
    setLocations(locs || [])
  }

  useEffect(() => {
    if (!configured) { setSession(null); return }
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session)
      loadProfile(data.session?.user)
    })
    const { data: sub } = supabase.auth.onAuthStateChange((_e, s) => {
      setSession(s)
      loadProfile(s?.user)
    })
    return () => sub.subscription.unsubscribe()
  }, [])

  const realRole = profile?.role || 'newhire'
  const realRoles = [...new Set([realRole, ...(profile?.roles || [])])]
  const previewing = realRole === 'owner' && Boolean(viewAs)
  const value = {
    session, profile, locations,
    user: session?.user || null,
    realRole, realRoles, viewAs, setViewAs, previewing,
    role: previewing ? viewAs.split('+')[0] : realRole,
    roles: previewing ? viewAs.split('+') : realRoles,
    locationId: profile?.location_id || null,
    refresh: () => loadProfile(session?.user),
    signOut: () => supabase.auth.signOut(),
  }
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>
}

export const useAuth = () => useContext(Ctx)
