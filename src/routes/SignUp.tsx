import { useState } from 'react'
import { Link, Navigate, useNavigate } from 'react-router-dom'
import { ArrowLeft, Mail } from 'lucide-react'
import type { Provider } from '@supabase/supabase-js'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { AuthLayout } from '@/features/auth/AuthLayout'
import { AuthError, NotConnected, ProviderButtons, Separator } from '@/features/auth/AuthParts'
import { useAuth } from '@/lib/auth'
import { usePreview } from '@/lib/preview'

const MIN_PASSWORD = 8

export function SignUp() {
  const { session, signInWithProvider, signUpWithPassword } = useAuth()
  const navigate = useNavigate()
  const preview = usePreview()

  // Same shape as sign-in: the providers are the front door and the email form
  // is behind one press. It was all on screen at once, and the result was that
  // at 1440x900 the "Create account" button -- the entire point of the page --
  // sat below the fold behind three promises, three provider buttons and three
  // inputs. Nothing was removed to fix it; what someone is not doing yet is
  // just not drawn yet.
  const [useEmail, setUseEmail] = useState(false)
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [busy, setBusy] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

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
    setError(null)

    // Checked here as well as by the input, so a mismatch is caught before a
    // round trip rather than after one.
    if (password !== confirm) return setError("Those passwords don't match.")
    if (password.length < MIN_PASSWORD) {
      return setError(`Use at least ${MIN_PASSWORD} characters.`)
    }

    setBusy('password')
    const { error } = await signUpWithPassword(email, password)
    setBusy(null)
    if (error) return setError(error)

    // Straight into the walkthrough. Email confirmation is off, so the account
    // is usable immediately and a "check your inbox" screen would be a lie.
    navigate('/welcome', { replace: true })
  }

  const mismatch = confirm.length > 0 && password !== confirm

  return (
    <AuthLayout
      title="Create your account"
      subtitle="It takes about a minute."
      footer={
        <>
          Already have an account?{' '}
          <Link to="/sign-in" className="font-medium text-brand underline-offset-2 hover:underline">
            Sign in
          </Link>
        </>
      }
      fineprint="Calenda is a personal project, not an official product of any school. Your notes and personal events are visible only to you."
    >
      <AuthError message={error} />

      {!useEmail ? (
        <div className="mt-6 flex flex-col gap-2">
          {/* The three promises that used to sit here are on the panel now,
              where they became four scenes of the real thing rather than four
              lines about it. On a phone the panel is not drawn at all, which is
              the correct trade: somebody who opened a sign-up page on a phone
              has already decided. */}
          <ProviderButtons verb="Sign up with" busy={busy} onPick={withProvider} />

          <Separator>or</Separator>

          <Button variant="ghost" size="md" fullWidth onClick={() => setUseEmail(true)}>
            <Mail className="h-4 w-4" aria-hidden /> Use an email and password
          </Button>
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
            minLength={MIN_PASSWORD}
            autoComplete="new-password"
            hint={`At least ${MIN_PASSWORD} characters.`}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
          <Input
            label="Confirm password"
            type="password"
            required
            autoComplete="new-password"
            error={mismatch ? "Those don't match." : undefined}
            value={confirm}
            onChange={(e) => setConfirm(e.target.value)}
          />
          <Button type="submit" size="lg" fullWidth loading={busy === 'password'}>
            Create account
          </Button>
          <button
            type="button"
            onClick={() => setUseEmail(false)}
            className="inline-flex items-center gap-1.5 self-center text-[13px] text-text-muted underline-offset-2 hover:text-text hover:underline"
          >
            <ArrowLeft className="h-3.5 w-3.5" aria-hidden /> All sign-up options
          </button>
        </form>
      )}

      <NotConnected>
        Creating an account needs a Supabase project. You can still look around.
      </NotConnected>
    </AuthLayout>
  )
}
