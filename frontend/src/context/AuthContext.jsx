import { createContext, useContext, useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'

const API = import.meta.env.VITE_API_URL
const AuthContext = createContext(null)

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null)
  const [profile, setProfile] = useState(null)
  const [session, setSession] = useState(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session: s } }) => {
      setSession(s)
      setUser(s?.user ?? null)
      setLoading(false)
    }).catch(() => {
      setLoading(false)
    })

    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      (_event, s) => {
        setSession(s)
        setUser(s?.user ?? null)
        setLoading(false)
      }
    )

    return () => subscription.unsubscribe()
  }, [])

  useEffect(() => {
    if (!user) {
      setProfile(null)
      return
    }
    fetch(`${API}/api/user/profile/${user.id}`)
      .then(res => res.ok ? res.json() : null)
      .then(data => setProfile(data ?? null))
      .catch(() => setProfile(null))
  }, [user])

  const refreshProfile = async () => {
    if (!user) return
    try {
      const res = await fetch(`${API}/api/user/profile/${user.id}`)
      const data = res.ok ? await res.json() : null
      setProfile(data ?? null)
    } catch {
      setProfile(null)
    }
  }

  const signOut = async () => {
    await supabase.auth.signOut()
    setUser(null)
    setSession(null)
    setProfile(null)
  }

  return (
    <AuthContext.Provider value={{ user, profile, session, loading, signOut, refreshProfile }}>
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth() {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used within AuthProvider')
  return ctx
}
