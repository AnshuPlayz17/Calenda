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
    about?: { fullName: string; role: 'student' | 'parent'; grade?: string },
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
 * The zone this device is actually in.
 *
 * profiles.timezone defaults to 'America/Toronto' and, until now, nothing in
 * the app ever changed it -- there was no resolvedOptions() call anywhere in
 * the codebase. So every account in the world was Toronto, while the dispatcher
 * schedules reminders as `(start_date + time '09:00') at time zone pr.timezone`
 * and reads quiet hours in the same zone. A user in London was being sent their
 * "nine in the morning" reminder at two in the afternoon, and the landing page
 * has a whole chapter claiming otherwise.
 *
 * Read rather than asked. The browser already knows, a list of four hundred
 * zone names is a worse question than no question, and a wrong answer here is
 * invisible until a reminder arrives at the wrong time.
 */
export function deviceTimeZone(): string | null {
  try {
    const zone = Intl.DateTimeFormat().resolvedOptions().timeZone
    // An empty or missing value is possible on old engines; storing it would
    // make `at time zone` throw inside the dispatcher for that row.
    return zone && zone.includes('/') ? zone : null
  } catch {
    return null
  }
}

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

  /**
   * Load the profile, and keep its stored zone level with the device.
   *
   * The sync is inlined rather than a second function on purpose: as a
   * separate one it made this an unstable reference and the effects below
   * started reporting a missing dependency. One function, no chain.
   *
   * It runs on load rather than only at sign-up because the accounts that most
   * need it already exist -- every one of them says America/Toronto, the schema
   * default that nothing ever changed -- and because OAuth users never see the
   * sign-up form at all. It writes only when the two differ, so it is one
   * comparison on almost every load and a request on almost none.
   *
   * Following the device is the behaviour "nine in your morning" describes.
   * Settings says where the value comes from, so somebody who travels can see
   * why their reminders moved rather than wondering.
   */
  async function loadProfile(userId: string) {
    const { data } = await supabase
      .from('profiles')
      .select('id, full_name, avatar_url, role, grade, timezone, onboarded_at')
      .eq('id', userId)
      .maybeSingle()

    const loaded = (data as Profile) ?? null
    setProfile(loaded)
    if (!loaded) return

    const zone = deviceTimeZone()
    if (!zone || zone === loaded.timezone) return

    const { error } = await supabase.from('profiles')
      .update({ timezone: zone }).eq('id', loaded.id)
    if (!error) setProfile({ ...loaded, timezone: zone })
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

        // Role goes through set_my_role rather than an update, because the
        // role column is not granted to clients at all -- naming it in an
        // update is refused by Postgres before any policy runs. That function
        // is the one path through, and it refuses admin by name.
        // See 20260907000200.
        if (about && data.user) {
          await supabase.rpc('set_my_role', { new_role: about.role })
          await supabase.from('profiles')
            .update({
              full_name: about.fullName,
              grade: about.grade?.trim() || null,
              timezone: deviceTimeZone(),
            })
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
