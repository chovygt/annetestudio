import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from 'react'
import { supabase } from '../lib/supabaseClient'

const AuthContext = createContext(null)

export function AuthProvider({ children, initialAuthLinkError = null }) {
  const [session, setSession] = useState(null)
  const [profile, setProfile] = useState(null)
  const [loading, setLoading] = useState(true)
  const [authLinkError, setAuthLinkError] = useState(initialAuthLinkError)

  const clearAuthLinkError = useCallback(() => setAuthLinkError(null), [])

  const loadProfile = useCallback(async (userId) => {
    if (!userId) {
      setProfile(null)
      return
    }
    const { data, error } = await supabase
      .from('profiles')
      .select('id,email,nombre,role')
      .eq('id', userId)
      .maybeSingle()
    if (error) {
      console.error(error)
      setProfile(null)
      return
    }
    setProfile(data)
  }, [])

  useEffect(() => {
    let cancelled = false

    supabase.auth.getSession().then(({ data: { session: s } }) => {
      if (cancelled) return
      setSession(s)
      loadProfile(s?.user?.id).finally(() => {
        if (!cancelled) setLoading(false)
      })
    })

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, s) => {
      setSession(s)
      if (!s?.user?.id) {
        setProfile(null)
        setLoading(false)
        return
      }
      // Nunca poner loading=true aquí: SIGNED_IN, TOKEN_REFRESHED, etc. desmontan RequireAuth/Admin
      // y se cierran modales (p. ej. al volver de la cámara). Solo se refresca el perfil en segundo plano.
      void loadProfile(s.user.id)
    })

    return () => {
      cancelled = true
      subscription.unsubscribe()
    }
  }, [loadProfile])

  const signIn = useCallback(async (email, password) => {
    const { data, error } = await supabase.auth.signInWithPassword({
      email,
      password,
    })
    return { data, error }
  }, [])

  const signUp = useCallback(async (email, password, nombre) => {
    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: { data: { nombre: nombre || email.split('@')[0] } },
    })
    return { data, error }
  }, [])

  const signOut = useCallback(async () => {
    await supabase.auth.signOut()
    setProfile(null)
  }, [])

  const value = useMemo(
    () => ({
      session,
      user: session?.user ?? null,
      profile,
      loading,
      authLinkError,
      clearAuthLinkError,
      signIn,
      signUp,
      signOut,
      refreshProfile: () => loadProfile(session?.user?.id),
    }),
    [
      session,
      profile,
      loading,
      authLinkError,
      clearAuthLinkError,
      signIn,
      signUp,
      signOut,
      loadProfile,
    ]
  )

  return (
    <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
  )
}

// eslint-disable-next-line react-refresh/only-export-components -- useAuth
export function useAuth() {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth debe usarse dentro de AuthProvider')
  return ctx
}
