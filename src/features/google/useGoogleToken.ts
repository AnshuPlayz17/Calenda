import { useCallback, useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { env } from '@/lib/env'

const CALENDAR_SCOPE = 'https://www.googleapis.com/auth/calendar.readonly'

/**
 * The Google access token for the current session, if there is one.
 *
 * Supabase returns `provider_token` alongside the session after an OAuth
 * sign-in. We read it, use it, and never copy it anywhere -- no refresh token
 * is requested and nothing Google-related is written to our database. When it
 * expires the user reconnects, which is one click.
 */
export function useGoogleToken() {
  const [token, setToken] = useState<string | null>(null)
  const [checking, setChecking] = useState(true)

  useEffect(() => {
    let active = true

    supabase.auth.getSession().then(({ data }) => {
      if (!active) return
      setToken(data.session?.provider_token ?? null)
      setChecking(false)
    })

    const { data: sub } = supabase.auth.onAuthStateChange((_e, session) => {
      setToken(session?.provider_token ?? null)
    })

    return () => {
      active = false
      sub.subscription.unsubscribe()
    }
  }, [])

  const connect = useCallback(async () => {
    const { error } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: {
        scopes: CALENDAR_SCOPE,
        redirectTo: `${env.baseUrl}#/settings`,
        queryParams: {
          // Force the consent screen so the calendar scope is actually granted
          // even when this Google account has signed in here before.
          prompt: 'consent',
          include_granted_scopes: 'true',
        },
      },
    })
    if (error) throw new Error("We couldn't connect your Google account. Please try again.")
  }, [])

  /** Called when Google rejects the token, so the UI can offer to reconnect. */
  const clear = useCallback(() => setToken(null), [])

  return { token, checking, connect, clear }
}
