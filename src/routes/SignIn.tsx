import { useState } from 'react'
import { Link, Navigate } from 'react-router-dom'
import { ArrowLeft, Mail } from 'lucide-react'
import type { Provider } from '@supabase/supabase-js'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { AuthLayout } from '@/features/auth/AuthLayout'
import { AuthError, NotConnected, ProviderButtons, Separator } from '@/features/auth/AuthParts'
import { useAuth } from '@/lib/auth'
import { emailDelivery, NO_RECOVERY_NOTE } from '@/lib/email'
import { usePreview } from '@/lib/preview'

export function SignIn() {
  const { session, signInWithProvider, signInWithPassword } = useAuth()
  const [usePassword, setUsePassword] = useState(false)
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [busy, setBusy] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const preview = usePreview()

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

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    setBusy('password')
    setError(null)
    const { error } = await signInWithPassword(email, password)
    if (error) setError(error)
    setBusy(null)
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

      {!usePassword ? (
        <div className="mt-6 flex flex-col gap-2">
          <ProviderButtons verb="Continue with" busy={busy} onPick={withProvider} />

          <Separator>or</Separator>

          <Button variant="ghost" size="md" fullWidth onClick={() => setUsePassword(true)}>
            <Mail className="h-4 w-4" aria-hidden /> Use email and password
          </Button>

          {/* What used to be here was a notice explaining that email sign-in
              links are switched off. It sat directly under the button offering
              the alternative, and it apologised for the absence of something
              the reader had not been shown and could not miss. The links being
              off is true and stays true; it just is not news. */}
        </div>
      ) : (
        <form onSubmit={submit} className="mt-6 flex flex-col gap-4">
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
          <button
            type="button"
            onClick={() => setUsePassword(false)}
            className="inline-flex items-center gap-1.5 self-center text-[13px] text-text-muted underline-offset-2 hover:text-text hover:underline"
          >
            <ArrowLeft className="h-3.5 w-3.5" aria-hidden /> All sign-in options
          </button>
        </form>
      )}

      <NotConnected>
        Sign-in needs a Supabase project. You can still look around — the preview is
        loaded with a full sample school year.
      </NotConnected>
    </AuthLayout>
  )
}
