import { createContext, useContext, useEffect, useMemo, useState } from 'react'
import type { ReactNode } from 'react'
import type { Provider, Session, User } from '@supabase/supabase-js'
import { supabase } from './supabase'
import { env } from './env'

export type Role = 'student' | 'parent' | 'admin'

export type Profile = {
  id: string
  full_name: string | null
  avatar_url: string | null
  role: Role
  grade: string | null
  timezone: string
  onboarded_at: string | null
}

type AuthContextValue = {
  session: Session | null
  user: User | null
  profile: Profile | null
  /** True until the first session check resolves, so routes never flash. */
  loading: boolean
  isAdmin: boolean
  signInWithProvider: (provider: Provider) => Promise<{ error: string | null }>
  signInWithPassword: (email: string, password: string) => Promise<{ error: string | null }>
  signUpWithPassword: (email: string, password: string) => Promise<{ error: string | null }>
  signInWithMagicLink: (email: string) => Promise<{ error: string | null }>
  signOut: () => Promise<void>
  refreshProfile: () => Promise<void>
}

const AuthContext = createContext<AuthContextValue | null>(null)

/**
 * Auth errors are deliberately uniform. Distinguishing "no such account" from
 * "wrong password" tells an attacker which addresses are registered.
 */
const GENERIC_CREDENTIALS_ERROR = 'That email or password is incorrect.'

function friendlyError(message: string): string {
  const m = message.toLowerCase()
  if (m.includes('invalid login') || m.includes('invalid credentials')) {
    return GENERIC_CREDENTIALS_ERROR
  }
  if (m.includes('already registered') || m.includes('already been registered')) {
    // Same reasoning: do not confirm that an address exists.
    return 'Check your email to finish setting up your account.'
  }
  if (m.includes('rate limit') || m.includes('too many')) {
    return 'Too many attempts. Please wait a minute and try again.'
  }
  if (m.includes('not enabled') || m.includes('unsupported provider')) {
    return 'That sign-in method is not available yet.'
  }
  return 'Something went wrong signing you in. Please try again.'
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null)
  const [profile, setProfile] = useState<Profile | null>(null)
  const [loading, setLoading] = useState(true)

  async function loadProfile(userId: string) {
    const { data } = await supabase
      .from('profiles')
      .select('id, full_name, avatar_url, role, grade, timezone, onboarded_at')
      .eq('id', userId)
      .maybeSingle()
    setProfile((data as Profile) ?? null)
  }

  useEffect(() => {
    let active = true

    supabase.auth.getSession().then(({ data }) => {
      if (!active) return
      setSession(data.session)
      if (data.session?.user) void loadProfile(data.session.user.id)
      setLoading(false)
    })

    const { data: sub } = supabase.auth.onAuthStateChange((_event, next) => {
      setSession(next)
      if (next?.user) void loadProfile(next.user.id)
      else setProfile(null)
    })

    return () => {
      active = false
      sub.subscription.unsubscribe()
    }
  }, [])

  const value = useMemo<AuthContextValue>(() => {
    const redirectTo = `${env.baseUrl}#/auth/callback`

    return {
      session,
      user: session?.user ?? null,
      profile,
      loading,
      isAdmin: profile?.role === 'admin',

      async signInWithProvider(provider) {
        const { error } = await supabase.auth.signInWithOAuth({
          provider,
          options: { redirectTo },
        })
        return { error: error ? friendlyError(error.message) : null }
      },

      async signInWithPassword(email, password) {
        const { error } = await supabase.auth.signInWithPassword({ email, password })
        return { error: error ? friendlyError(error.message) : null }
      },

      async signUpWithPassword(email, password) {
        const { error } = await supabase.auth.signUp({
          email,
          password,
          options: { emailRedirectTo: redirectTo },
        })
        return { error: error ? friendlyError(error.message) : null }
      },

      async signInWithMagicLink(email) {
        const { error } = await supabase.auth.signInWithOtp({
          email,
          options: { emailRedirectTo: redirectTo },
        })
        return { error: error ? friendlyError(error.message) : null }
      },

      async signOut() {
        await supabase.auth.signOut()
        setProfile(null)
      },

      async refreshProfile() {
        if (session?.user) await loadProfile(session.user.id)
      },
    }
  }, [session, profile, loading])

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth() {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used inside AuthProvider')
  return ctx
}
