import { useState } from 'react'
import { Link, Navigate } from 'react-router-dom'
import { Mail, Wrench } from 'lucide-react'
import type { Provider } from '@supabase/supabase-js'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { AuthLayout } from '@/features/auth/AuthLayout'
import { enabledProviders } from '@/lib/providers'
import { useAuth } from '@/lib/auth'
import { isConfigured } from '@/lib/env'
import { usePreview } from '@/lib/preview'
import { ProviderIcon } from '@/components/ProviderIcon'

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
      {!isConfigured && (
        <div className="mt-5 rounded-xl border border-border bg-surface p-4">
          <p className="text-[13.5px] font-medium text-text">Not connected yet</p>
          <p className="mt-1 text-[12.5px] leading-relaxed text-text-muted">
            Sign-in needs a Supabase project. You can still look around — the preview
            is loaded with the real 2026–27 school calendar.
          </p>
          <Button size="sm" className="mt-3" onClick={preview.enter}>
            Explore the preview
          </Button>
        </div>
      )}

      {error && (
        <p
          role="alert"
          className="mt-5 rounded-lg border border-danger-border bg-danger-subtle px-3.5 py-2.5 text-[13px] text-danger"
        >
          {error}
        </p>
      )}

      {!usePassword ? (
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
              <span className="ml-1">Continue with {p.label}</span>
            </Button>
          ))}

          <div className="my-3 flex items-center gap-3">
            <hr className="flex-1 border-border" />
            <span className="label-caps">or</span>
            <hr className="flex-1 border-border" />
          </div>

          <Button variant="ghost" size="md" fullWidth onClick={() => setUsePassword(true)}>
            <Mail className="h-4 w-4" aria-hidden /> Use email and password
          </Button>

          {/* Sign-in links are switched off rather than left to fail silently.
              Delivery depends on an email sender that is not set up yet, so the
              button looked like it worked and nothing ever arrived. */}
          <div className="mt-2 flex items-start gap-2.5 rounded-lg border border-border bg-surface-2 px-3.5 py-3">
            <Wrench className="mt-0.5 h-4 w-4 shrink-0 text-text-subtle" aria-hidden />
            <p className="text-[12.5px] leading-relaxed text-text-muted">
              <span className="font-medium text-text">Email sign-in links are off.</span>{' '}
              We're fixing this — use Google or a password for now.
            </p>
          </div>
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
          <Button type="submit" size="lg" fullWidth loading={busy === 'password'}>
            Sign in
          </Button>
          <button
            type="button"
            onClick={() => setUsePassword(false)}
            className="text-[13px] text-text-muted underline-offset-2 hover:text-text hover:underline"
          >
            Back
          </button>
        </form>
      )}
    </AuthLayout>
  )
}
