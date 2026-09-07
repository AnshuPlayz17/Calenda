import { useEffect, useRef, useState } from 'react'
import { Link, Navigate, useNavigate } from 'react-router-dom'
import { Loader2 } from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { AuthLayout } from '@/features/auth/AuthLayout'
import { AuthError } from '@/features/auth/AuthParts'
import { readRecoveryCredentials, withoutCredentials } from '@/features/auth/recoveryToken'
import { useAuth } from '@/lib/auth'
import { supabase } from '@/lib/supabase'
import { emailDelivery } from '@/lib/email'

const MIN_PASSWORD = 8

/**
 * Where a recovery link lands.
 *
 * The link carries a credential in the address bar, and this page turns it into
 * a session before showing the form. supabase-js will usually have done that
 * already -- but usually is not good enough here, because it only reads two of
 * the three places a hash-routed app can receive one. See `recoveryToken.ts`
 * for which three and why.
 *
 * So the claim is done explicitly and the result is one of three states:
 * working on it, a form, or an honest account of a link that did not survive.
 * The middle one is the only one that can submit.
 *
 * This page must not redirect a signed-in reader away the way the other auth
 * pages do. Here, being signed in is the expected state rather than the
 * finished one -- the recovery link signs you in, and setting the password is
 * what is left.
 */
export function ResetPassword() {
  const { session, loading, updatePassword } = useAuth()
  const navigate = useNavigate()
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [claim, setClaim] = useState<'idle' | 'working' | 'failed'>('idle')

  // Effects run twice under StrictMode in development, and a recovery code is
  // single-use -- the second exchange fails and would report a good link as
  // dead. Claimed once per mount, by hand.
  const claimed = useRef(false)

  useEffect(() => {
    if (claimed.current) return
    claimed.current = true

    const found = readRecoveryCredentials(window.location.href)
    if (!found) return

    // Out of the address bar before anything else. It is one-use and expires
    // in an hour, but it should not be sitting in history while a password is
    // being typed underneath it.
    window.history.replaceState(
      null, '', withoutCredentials(window.location.href, '/reset-password'),
    )

    if (found.kind === 'error') {
      setClaim('failed')
      return
    }

    setClaim('working')
    const exchange = found.kind === 'code'
      ? supabase.auth.exchangeCodeForSession(found.code)
      : supabase.auth.setSession({
        access_token: found.accessToken,
        refresh_token: found.refreshToken,
      })

    void exchange.then(({ error }) => setClaim(error ? 'failed' : 'idle'))
  }, [])

  if (!emailDelivery) return <Navigate to="/sign-in" replace />

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    if (password !== confirm) return setError("Those passwords don't match.")
    if (password.length < MIN_PASSWORD) {
      return setError(`Use at least ${MIN_PASSWORD} characters.`)
    }

    setBusy(true)
    const { error } = await updatePassword(password)
    setBusy(false)
    if (error) return setError(error)
    navigate('/dashboard', { replace: true })
  }

  const mismatch = confirm.length > 0 && password !== confirm
  const working = loading || claim === 'working'
  // A link that expired, was already used, or was typed by hand leaves no
  // session behind. Say so rather than showing a form whose submit must fail.
  const dead = !working && !session

  return (
    <AuthLayout
      title={dead ? 'That link has expired' : 'Set a new password'}
      subtitle={dead
        ? 'Recovery links last an hour and work once.'
        : 'Choose something you have not used here before.'}
      footer={
        <Link to="/sign-in" className="font-medium text-brand underline-offset-2 hover:underline">
          Back to sign in
        </Link>
      }
    >
      <AuthError message={error} />

      {working ? (
        <p className="mt-6 flex items-center gap-2.5 text-[13px] text-text-muted" role="status">
          <Loader2 className="h-4 w-4 animate-spin text-brand" aria-hidden />
          Checking your link…
        </p>
      ) : dead ? (
        <div className="mt-6 rounded-xl border border-border bg-surface p-4">
          <p className="text-[13px] leading-relaxed text-text-muted">
            Ask for a new one and it will still be the same account. If you signed up
            with Google, GitHub or Discord, that button signs you in without any of
            this.
          </p>
          <Link
            to="/forgot-password"
            className="mt-3 inline-block text-[13px] font-medium text-brand underline-offset-2 hover:underline"
          >
            Send another link
          </Link>
        </div>
      ) : (
        <form onSubmit={submit} className="mt-6 flex flex-col gap-4">
          <Input
            label="New password"
            type="password"
            required
            autoFocus
            minLength={MIN_PASSWORD}
            autoComplete="new-password"
            hint={`At least ${MIN_PASSWORD} characters.`}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
          <Input
            label="Confirm new password"
            type="password"
            required
            autoComplete="new-password"
            error={mismatch ? "Those don't match." : undefined}
            value={confirm}
            onChange={(e) => setConfirm(e.target.value)}
          />
          <Button type="submit" size="lg" fullWidth loading={busy}>
            Save and sign in
          </Button>
        </form>
      )}
    </AuthLayout>
  )
}
