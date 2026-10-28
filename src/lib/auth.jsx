import { createContext, useContext, useEffect, useState } from 'react'
import { supabase, configured } from './supabase'

const Ctx = createContext(null)

export function AuthProvider({ children }) {
  const [session, setSession] = useState(undefined)
  const [profile, setProfile] = useState(null)
  const [locations, setLocations] = useState([])

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

  const value = {
    session, profile, locations,
    user: session?.user || null,
    role: profile?.role || 'newhire',
    roles: [...new Set([profile?.role || 'newhire', ...(profile?.roles || [])])],
    locationId: profile?.location_id || null,
    refresh: () => loadProfile(session?.user),
    signOut: () => supabase.auth.signOut(),
  }
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>
}

export const useAuth = () => useContext(Ctx)
