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

/** Everything the sign-up form collects beyond an address and a password. */
export type SignUpDetails = {
  fullName: string
  role: 'student' | 'parent'
  /** Students only. A parent has no grade and none is sent for them. */
  grade?: string
  /** Free text, self-declared, and nothing reads it yet. See 20260907000300. */
  school?: string
  /** How they found Calenda. Asked once, never shown back, optional. */
  heardFrom?: string
  /** Parents only: a code from their student, and how they are related. */
  inviteCode?: string
  relation?: 'mother' | 'father' | 'guardian' | 'other'
}

/** The same answers, from the first-run screen rather than the sign-up form. */
export type FirstRunAnswers = Omit<SignUpDetails, 'fullName'> & { fullName: string }

type AuthContextValue = {
  session: Session | null
  user: User | null
  profile: Profile | null
  /** True until the first session check resolves, so routes never flash. */
  loading: boolean
  /**
   * True once the profile fetch has *finished*, whatever it found.
   *
   * Distinct from `profile !== null`, which cannot tell "not here yet" from
   * "no row I can read" -- and that ambiguity was a hole. `loading` went false
   * the moment the session resolved while the profile was still in flight, so
   * the first-run gate saw a null profile, fell through, and rendered the
   * dashboard to somebody who had never been asked anything. This is what the
   * gate waits for instead.
   */
  profileReady: boolean
  isAdmin: boolean
  signInWithProvider: (provider: Provider) => Promise<{ error: string | null }>
  signInWithPassword: (email: string, password: string) => Promise<{ error: string | null }>
  signUpWithPassword: (
    email: string,
    password: string,
    about?: SignUpDetails,
    // `warning` is for something that went wrong *after* the account existed --
    // an invite code that did not take. It is not an error: refusing to sign
    // somebody in over a typo in an optional field would be the worse outcome,
    // and every one of these is fixable in Settings. But a parent who typed a
    // code needs to be told it did not work, so it cannot be swallowed either.
  ) => Promise<{ error: string | null; warning?: string | null }>
  signInWithMagicLink: (email: string) => Promise<{ error: string | null }>
  /** Sends a recovery link. Only reachable when `emailDelivery` is on. */
  resetPassword: (email: string) => Promise<{ error: string | null }>
  /** Sets a new password for whoever the current session belongs to. */
  updatePassword: (password: string) => Promise<{ error: string | null }>
  /**
   * Records the answers from the first-run screen and marks the account set up.
   *
   * The same writer the sign-up form uses, because the two screens must store
   * the same answers the same way. Returns a warning rather than an error for
   * an invite code that did not take: the account already exists either way.
   */
  completeFirstRun: (answers: FirstRunAnswers) => Promise<{ warning: string | null }>
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

/**
 * What a sign-up gets when the address is already in use.
 *
 * It used to say "Check your email to finish setting up your account", which
 * was written when confirmation mail was expected. Confirmation is off, so
 * nothing was ever sent: somebody who already had an account was told to go and
 * wait for a message that does not exist, and never learned that signing in was
 * the answer.
 *
 * This says neither "that address is taken" nor "that address is free" -- it is
 * true whichever it is, which keeps the sign-up form from answering "is this
 * person registered here?" to anyone who asks. The sign-up page renders a link
 * to sign-in beneath it, which is the actual next step either way.
 */
export const SIGN_UP_BLOCKED = 'That did not work. If you already have an account, sign in instead.'

function friendlyError(message: string): string {
  const m = message.toLowerCase()
  if (m.includes('invalid login') || m.includes('invalid credentials')) {
    return GENERIC_CREDENTIALS_ERROR
  }
  if (m.includes('already registered') || m.includes('already been registered')) {
    // Same reasoning as the credentials error: do not confirm that an address
    // exists. See SIGN_UP_BLOCKED for why the old wording was worse than vague.
    return SIGN_UP_BLOCKED
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

/**
 * Everything the form collected, written after the account exists.
 *
 * Deliberately several calls rather than one, because the columns live behind
 * different doors. role is not granted to clients at all and goes through
 * set_my_role; the invite is redeemed by a definer function so a parent never
 * gains read access to the invites table; the rest are plain columns on the
 * profile. Trying to do it in one statement is what shipped broken before --
 * naming an ungranted column makes Postgres refuse the whole update, taking
 * the name down with it.
 *
 * Failures here do not fail the sign-up. The account exists by this point and
 * every one of these is correctable in Settings; refusing to sign somebody in
 * because their invite code had a typo would be the worse outcome. The one
 * exception is the code itself, which is reported, because a parent who typed
 * it needs to know it did not take.
 */
async function applyDetails(userId: string, about: SignUpDetails): Promise<string | null> {
  await supabase.rpc('set_my_role', { new_role: about.role })

  await supabase.from('profiles')
    .update({
      full_name: about.fullName,
      grade: about.grade?.trim() || null,
      school: about.school?.trim() || null,
      heard_from: about.heardFrom?.trim() || null,
      timezone: deviceTimeZone(),
      // Stamped here, which is what stops the first-run screen asking a person
      // who has just answered all of this on the sign-up form. The column
      // existed from the first migration and nothing had ever written it.
      onboarded_at: new Date().toISOString(),
    })
    .eq('id', userId)

  if (about.role !== 'parent' || !about.inviteCode?.trim()) return null

  const { data, error } = await supabase.rpc('redeem_parent_invite', {
    invite_code: about.inviteCode.trim(),
  })
  if (error) {
    // The function raises with a sentence written for a person -- "That code is
    // not valid. Ask for a new one." -- so it is passed through rather than
    // replaced with something vaguer.
    return error.message
  }

  // The relation is set afterwards rather than by widening the redeem
  // function. Adding a parameter to a definer function does not preserve its
  // existing call sites -- it makes them ambiguous -- and the function already
  // returns the student it linked, so there is nothing to add.
  const studentId = (data as { out_student_id: string }[] | null)?.[0]?.out_student_id
  if (studentId && about.relation) {
    await supabase.from('parent_links')
      .update({ relation: about.relation })
      .eq('parent_id', userId)
      .eq('student_id', studentId)
  }
  return null
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null)
  const [profile, setProfile] = useState<Profile | null>(null)
  const [loading, setLoading] = useState(true)
  const [profileReady, setProfileReady] = useState(false)

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
    // Set even when the row came back empty. "We looked and found nothing" is
    // an answer; the gate must not wait forever on a profile that will never
    // arrive, or an unreadable row would lock somebody out of the whole app.
    setProfileReady(true)
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
      else setProfileReady(true)
      setLoading(false)
    })

    const { data: sub } = supabase.auth.onAuthStateChange((_event, next) => {
      setSession(next)
      if (next?.user) {
        // A different person is signing in, so what is known about the last one
        // is not an answer about this one.
        setProfileReady(false)
        void loadProfile(next.user.id)
      } else {
        setProfile(null)
        setProfileReady(true)
      }
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
      profileReady,
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
        const warning = about && data.user
          ? await applyDetails(data.user.id, about)
          : null
        return { error: null, warning }
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

      async completeFirstRun(answers) {
        if (!session?.user) return { warning: null }
        const warning = await applyDetails(session.user.id, answers)
        await loadProfile(session.user.id)
        return { warning }
      },

      async signOut() {
        await supabase.auth.signOut()
        setProfile(null)
      },

      async refreshProfile() {
        if (session?.user) await loadProfile(session.user.id)
      },
    }
  }, [session, profile, loading, profileReady])

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth() {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used inside AuthProvider')
  return ctx
}
