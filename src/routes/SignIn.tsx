import { useState } from 'react'
import { Link, Navigate } from 'react-router-dom'
import { ArrowLeft, KeyRound, Mail, MailCheck } from 'lucide-react'
import type { Provider } from '@supabase/supabase-js'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { AuthLayout } from '@/features/auth/AuthLayout'
import { AuthError, NotConnected, ProviderButtons, Separator } from '@/features/auth/AuthParts'
import { SendEmailButton } from '@/features/auth/SendEmailButton'
import { useEmailCooldown } from '@/features/auth/emailCooldown'
import { useAuth } from '@/lib/auth'
import { emailDelivery, NO_RECOVERY_NOTE } from '@/lib/email'
import { usePreview } from '@/lib/preview'

/** Which way in is on screen. The providers are the front door. */
type Mode = 'choose' | 'password' | 'link'

export function SignIn() {
  const { session, signInWithProvider, signInWithPassword, signInWithMagicLink } = useAuth()
  const [mode, setMode] = useState<Mode>('choose')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [busy, setBusy] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [linkSent, setLinkSent] = useState(false)
  const preview = usePreview()
  const cooldown = useEmailCooldown(email)

  if (session || preview.active) return <Navigate to="/dashboard" replace />

  async function withProvider(p: Provider) {
    setBusy(p)
    setError(null)
    const { error } = await signInWithProvider(p)
    if (error) {
      setError(error)
      setBusy(null)
    }
  }

  async function submitPassword(e: React.FormEvent) {
    e.preventDefault()
    setBusy('password')
    setError(null)
    const { error } = await signInWithPassword(email, password)
    if (error) setError(error)
    setBusy(null)
  }

  async function submitLink(e: React.FormEvent) {
    e.preventDefault()
    if (cooldown.remaining > 0) return
    setBusy('link')
    setError(null)
    const { error } = await signInWithMagicLink(email)
    setBusy(null)
    if (error) return setError(error)
    // Only on a send that happened, so a failure does not cost a minute.
    cooldown.record()
    setLinkSent(true)
  }

  function back() {
    setMode('choose')
    setError(null)
    setLinkSent(false)
  }

  return (
    <AuthLayout
      title="Welcome back"
      subtitle="Sign in to pick up where you left off."
      footer={
        <>
          New here?{' '}
          <Link to="/sign-up" className="font-medium text-brand underline-offset-2 hover:underline">
            Create an account
          </Link>
        </>
      }
    >
      <AuthError message={error} />

      {mode === 'choose' && (
        <div className="mt-6 flex flex-col gap-2">
          <ProviderButtons verb="Continue with" busy={busy} onPick={withProvider} />

          <Separator>or</Separator>

          {/* One-time links are only offered when mail actually goes out. They
              were switched off for months and the page carried a notice
              apologising for it, which explained the absence of something
              nobody had been shown. Now they either work or they are not here. */}
          {emailDelivery && (
            <Button variant="ghost" size="md" fullWidth onClick={() => setMode('link')}>
              <Mail className="h-4 w-4" aria-hidden /> Email me a sign-in link
            </Button>
          )}

          <Button variant="ghost" size="md" fullWidth onClick={() => setMode('password')}>
            <KeyRound className="h-4 w-4" aria-hidden /> Use email and password
          </Button>
        </div>
      )}

      {mode === 'link' && (
        linkSent ? (
          <div className="mt-6 flex items-start gap-3 rounded-xl border border-border bg-surface p-4">
            <MailCheck className="mt-0.5 h-4 w-4 shrink-0 text-brand" aria-hidden />
            <div>
              <p className="text-[13.5px] font-medium text-text">Check your email</p>
              {/* Worded so it is true whether or not that address is
                  registered. Saying "we sent you a link" would answer
                  "does this person have an account here?" to anybody asking. */}
              <p className="mt-1 text-[12.5px] leading-relaxed text-text-muted">
                If there is an account for {email}, a link is on its way. It signs you in
                on this device and stops working once used.
              </p>
              <button
                type="button"
                onClick={back}
                className="mt-3 text-[12.5px] font-medium text-brand underline-offset-2 hover:underline"
              >
                Use another way in
              </button>
            </div>
          </div>
        ) : (
          <form onSubmit={submitLink} className="mt-6 flex flex-col gap-4">
            <Input
              label="Email"
              type="email"
              autoComplete="email"
              required
              autoFocus
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
            <p className="-mt-1 text-[12.5px] leading-relaxed text-text-subtle">
              No password needed. The link lasts an hour and works once.
            </p>
            <SendEmailButton address={email} busy={busy === 'link'} label="Email me a link" />
            <BackButton onClick={back} />
          </form>
        )
      )}

      {mode === 'password' && (
        <form onSubmit={submitPassword} className="mt-6 flex flex-col gap-4">
          <Input
            label="Email"
            type="email"
            autoComplete="email"
            required
            autoFocus
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
          <Input
            label="Password"
            type="password"
            required
            autoComplete="current-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />

          {/* A route back in, or an honest account of why there is not one.
              Both are better than the nothing that was here: somebody who set
              a password months ago and cannot remember it had no next step at
              all, on a page whose entire job is letting them in. */}
          {emailDelivery ? (
            <Link
              to="/forgot-password"
              className="-mt-1 self-start text-[13px] text-text-muted underline-offset-2 hover:text-text hover:underline"
            >
              Forgot your password?
            </Link>
          ) : (
            <p className="-mt-1 text-[12.5px] leading-relaxed text-text-subtle">
              {NO_RECOVERY_NOTE}
            </p>
          )}

          <Button type="submit" size="lg" fullWidth loading={busy === 'password'}>
            Sign in
          </Button>
          <BackButton onClick={back} />
        </form>
      )}

      <NotConnected>
        Sign-in needs a Supabase project. You can still look around — the preview is
        loaded with a full sample school year.
      </NotConnected>
    </AuthLayout>
  )
}

function BackButton({ onClick }: { onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="inline-flex items-center gap-1.5 self-center text-[13px] text-text-muted underline-offset-2 hover:text-text hover:underline"
    >
      <ArrowLeft className="h-3.5 w-3.5" aria-hidden /> All sign-in options
    </button>
  )
}
