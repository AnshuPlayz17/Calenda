import { useState } from 'react'
import { Link, Navigate, useNavigate } from 'react-router-dom'
import { Check } from 'lucide-react'
import type { Provider } from '@supabase/supabase-js'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { AuthLayout } from '@/features/auth/AuthLayout'
import { enabledProviders } from '@/lib/providers'
import { useAuth } from '@/lib/auth'
import { isConfigured } from '@/lib/env'
import { usePreview } from '@/lib/preview'
import { ProviderIcon } from '@/components/ProviderIcon'

const MIN_PASSWORD = 8

/** What you get, in the order it matters -- not a feature list. */
const PROMISES = [
  'Every school date already in it, imported from the PDF',
  'Your own Google Calendar alongside it, read-only',
  'A workspace per class: notes, assignments, deadlines',
]

export function SignUp() {
  const { session, signInWithProvider, signUpWithPassword } = useAuth()
  const navigate = useNavigate()
  const preview = usePreview()

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
      subtitle="Set up Calenda for the school year. It takes about a minute."
      footer={
        <>
          Already have an account?{' '}
          <Link to="/sign-in" className="font-medium text-brand underline-offset-2 hover:underline">
            Sign in
          </Link>
        </>
      }
    >
      {!isConfigured && (
        <div className="mt-5 rounded-xl border border-border bg-surface p-4">
          <p className="text-[13.5px] font-medium text-text">Not connected yet</p>
          <p className="mt-1 text-[12.5px] leading-relaxed text-text-muted">
            Creating an account needs a Supabase project. You can still look around.
          </p>
          <Button size="sm" className="mt-3" onClick={preview.enter}>
            Explore the preview
          </Button>
        </div>
      )}

      <ul className="mt-5 flex flex-col gap-2">
        {PROMISES.map((line) => (
          <li key={line} className="flex items-start gap-2.5 text-[13px] text-text-muted">
            <Check className="mt-0.5 h-4 w-4 shrink-0 text-brand" aria-hidden />
            {line}
          </li>
        ))}
      </ul>

      {error && (
        <p
          role="alert"
          className="mt-5 rounded-lg border border-danger-border bg-danger-subtle px-3.5 py-2.5 text-[13px] text-danger"
        >
          {error}
        </p>
      )}

      {enabledProviders.length > 0 && (
        <>
          <div className="mt-6 flex flex-col gap-2">
            {enabledProviders.map((p) => (
              <Button
                key={p.id}
                variant="secondary"
                size="lg"
                fullWidth
                loading={busy === p.id}
                onClick={() => void withProvider(p.id)}
                className="justify-start"
              >
                <ProviderIcon provider={p.id} />
                <span className="ml-1">Sign up with {p.label}</span>
              </Button>
            ))}
          </div>

          <div className="my-4 flex items-center gap-3">
            <hr className="flex-1 border-border" />
            <span className="label-caps">or use an email</span>
            <hr className="flex-1 border-border" />
          </div>
        </>
      )}

      <form onSubmit={submit} className="flex flex-col gap-4">
        <Input
          label="Email"
          type="email"
          autoComplete="email"
          required
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
      </form>

      <p className="mt-4 text-[12px] leading-relaxed text-text-subtle">
        Calenda is a personal project, not an official product of University of Toronto
        Schools. Your notes and personal events are visible only to you.
      </p>
    </AuthLayout>
  )
}
