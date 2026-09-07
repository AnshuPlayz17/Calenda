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
  signUpWithPassword: (
    email: string,
    password: string,
    about?: { fullName: string; role: 'student' | 'parent' },
  ) => Promise<{ error: string | null }>
  signInWithMagicLink: (email: string) => Promise<{ error: string | null }>
  /** Sends a recovery link. Only reachable when `emailDelivery` is on. */
  resetPassword: (email: string) => Promise<{ error: string | null }>
  /** Sets a new password for whoever the current session belongs to. */
  updatePassword: (password: string) => Promise<{ error: string | null }>
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
  // Supabase enforces its own gap between emails to one address and reports it
  // as "For security purposes, you can only request this after 47 seconds",
  // which reads like an accusation for what is almost always someone pressing
  // a button twice. Same number, said plainly.
  const wait = /after (\d+) seconds?/.exec(message)
  if (wait) return `One is already on the way. You can ask again in ${wait[1]} seconds.`

  if (m.includes('rate limit') || m.includes('too many') || m.includes('email rate')) {
    return 'Too many requests just now. Please wait a minute and try again.'
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

      async signUpWithPassword(email, password, about) {
        const { data, error } = await supabase.auth.signUp({
          email,
          password,
          options: {
            emailRedirectTo: redirectTo,
            // The handle_new_user trigger reads full_name out of here, which is
            // how OAuth sign-ups get a name. Passing it means a password
            // sign-up arrives with one too, rather than being the only kind of
            // account the app can never greet by name.
            data: about ? { full_name: about.fullName } : undefined,
          },
        })
        if (error) return { error: friendlyError(error.message) }

        // Role is a second call on purpose. It cannot ride along in the signup
        // metadata, because that is user-controlled input the trigger copies
        // verbatim -- and role is the column is_admin() reads. It goes through
        // the profiles policy instead, which permits student and parent and
        // refuses admin. See 20260907000100.
        if (about && data.user) {
          await supabase.from('profiles')
            .update({ full_name: about.fullName, role: about.role })
            .eq('id', data.user.id)
        }
        return { error: null }
      },

      async signInWithMagicLink(email) {
        const { error } = await supabase.auth.signInWithOtp({
          email,
          options: {
            emailRedirectTo: redirectTo,
            // Never create an account from a sign-in form. Otherwise a typo in
            // an address silently registers a new empty account and the link
            // that arrives signs someone into it -- which looks like working
            // and is the opposite of what they asked for.
            shouldCreateUser: false,
          },
        })
        // An address with no account is reported as a refusal, and passing it
        // on would answer the question "is this person registered here?" to
        // anyone who asked -- the same disclosure the uniform credentials
        // error exists to prevent. From the caller's side the right behaviour
        // is identical to success: say a link is on its way, and send nothing.
        if (error && /signups not allowed|user not found/i.test(error.message)) {
          return { error: null }
        }
        return { error: error ? friendlyError(error.message) : null }
      },

      async resetPassword(email) {
        const { error } = await supabase.auth.resetPasswordForEmail(email, {
          // Hash-routed, so the recovery token has to land on the route that
          // knows what to do with it rather than on the landing page.
          redirectTo: `${env.baseUrl}#/reset-password`,
        })
        // Never distinguish a registered address from an unregistered one --
        // the same reason sign-in errors are uniform. The caller shows the
        // same confirmation either way.
        return { error: error ? friendlyError(error.message) : null }
      },

      async updatePassword(password) {
        const { error } = await supabase.auth.updateUser({ password })
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
