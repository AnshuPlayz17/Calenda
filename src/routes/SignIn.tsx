import { useState } from 'react'
import { Navigate } from 'react-router-dom'
import { motion, useReducedMotion } from 'motion/react'
import { Mail, Sparkles } from 'lucide-react'
import type { Provider } from '@supabase/supabase-js'
import { Brand } from '@/components/Brand'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { ThemeToggle } from '@/components/ThemeToggle'
import { enabledProviders } from '@/lib/providers'
import { useAuth } from '@/lib/auth'
import { isConfigured } from '@/lib/env'
import { ProviderIcon } from '@/components/ProviderIcon'

type Mode = 'providers' | 'password' | 'magic'

export function SignIn() {
  const { session, signInWithProvider, signInWithPassword, signUpWithPassword, signInWithMagicLink } =
    useAuth()
  const [mode, setMode] = useState<Mode>('providers')
  const [isRegister, setIsRegister] = useState(false)
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [busy, setBusy] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [sent, setSent] = useState(false)
  const reduce = useReducedMotion()

  if (session) return <Navigate to="/" replace />

  async function withProvider(p: Provider) {
    setBusy(p); setError(null)
    const { error } = await signInWithProvider(p)
    if (error) { setError(error); setBusy(null) }
  }

  async function submitPassword(e: React.FormEvent) {
    e.preventDefault()
    setBusy('password'); setError(null)
    const { error } = isRegister
      ? await signUpWithPassword(email, password)
      : await signInWithPassword(email, password)
    if (error) setError(error)
    else if (isRegister) setSent(true)
    setBusy(null)
  }

  async function submitMagic(e: React.FormEvent) {
    e.preventDefault()
    setBusy('magic'); setError(null)
    const { error } = await signInWithMagicLink(email)
    if (error) setError(error)
    else setSent(true)
    setBusy(null)
  }

  return (
    <div className="grid min-h-dvh lg:grid-cols-[1fr_minmax(420px,44%)]">
      {/* Editorial panel. Hidden on small screens, where it would only push
          the actual task below the fold. */}
      <aside className="relative hidden flex-col justify-between overflow-hidden p-12 lg:flex"
             style={{ background: 'var(--blue-900)' }}>
        <div className="relative z-10">
          <Brand size="md" showSchool={false} className="[&_span]:text-white" />
        </div>

        <div className="relative z-10 max-w-[30ch]">
          <h1 className="font-display text-[42px] font-medium leading-[1.1] tracking-tight text-white">
            Your school, in one place.
          </h1>
          <p className="mt-4 text-[15px] leading-relaxed" style={{ color: 'var(--blue-200)' }}>
            Community events, your own calendar, class notebooks and every deadline —
            together, and organised the way you actually think about them.
          </p>
        </div>

        <p className="relative z-10 text-[12px]" style={{ color: 'var(--blue-300)' }}>
          A personal project. Not an official product of University of Toronto Schools.
        </p>

        {/* Ambient calendar grid, drawn rather than decorative imagery. */}
        <div aria-hidden className="pointer-events-none absolute inset-0 opacity-[0.07]">
          <svg width="100%" height="100%">
            <defs>
              <pattern id="grid" width="72" height="72" patternUnits="userSpaceOnUse">
                <path d="M72 0H0V72" fill="none" stroke="#fff" strokeWidth="1" />
              </pattern>
            </defs>
            <rect width="100%" height="100%" fill="url(#grid)" />
          </svg>
        </div>
      </aside>

      <main className="flex flex-col justify-center px-5 py-10 sm:px-10">
        <div className="absolute right-4 top-4"><ThemeToggle /></div>

        <motion.div
          initial={reduce ? false : { opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.45, ease: [0.22, 1, 0.36, 1] }}
          className="mx-auto w-full max-w-[380px]"
        >
          <div className="lg:hidden"><Brand size="md" /></div>

          <h2 className="mt-7 text-[22px] font-semibold tracking-tight text-text lg:mt-0">
            {isRegister ? 'Create your account' : 'Welcome back'}
          </h2>
          <p className="mt-1.5 text-[14px] text-text-muted">
            {isRegister
              ? 'Set up Calenda for the school year.'
              : 'Sign in to pick up where you left off.'}
          </p>

          {!isConfigured && (
            <div className="mt-5 rounded-lg border border-warning-border bg-warning-subtle px-4 py-3 text-[13px]"
                 style={{ color: 'var(--warning)' }}>
              <strong className="font-semibold">Not connected yet.</strong> Set
              {' '}<code className="font-mono text-[12px]">VITE_SUPABASE_URL</code> and
              {' '}<code className="font-mono text-[12px]">VITE_SUPABASE_ANON_KEY</code> to sign in.
            </div>
          )}

          {sent ? (
            <div className="mt-6 rounded-xl border border-border bg-surface p-5">
              <Mail className="h-5 w-5 text-brand" aria-hidden />
              <p className="mt-3 text-sm font-medium text-text">Check your email</p>
              <p className="mt-1 text-[13px] leading-relaxed text-text-muted">
                We sent a link to <span className="font-medium text-text">{email}</span>.
                Open it on this device to finish signing in.
              </p>
              <Button variant="ghost" size="sm" className="mt-3"
                      onClick={() => { setSent(false); setMode('providers') }}>
                Use a different method
              </Button>
            </div>
          ) : (
            <>
              {error && (
                <p role="alert"
                   className="mt-5 rounded-lg border border-danger-border bg-danger-subtle px-3.5 py-2.5 text-[13px] text-danger">
                  {error}
                </p>
              )}

              {mode === 'providers' && (
                <div className="mt-6 flex flex-col gap-2">
                  {enabledProviders.map((p) => (
                    <Button key={p.id} variant="secondary" size="lg" fullWidth
                            loading={busy === p.id}
                            onClick={() => void withProvider(p.id)}
                            className="justify-start">
                      <ProviderIcon provider={p.id} />
                      <span className="ml-1">Continue with {p.label}</span>
                    </Button>
                  ))}

                  <div className="my-3 flex items-center gap-3">
                    <hr className="flex-1 border-border" />
                    <span className="label-caps">or</span>
                    <hr className="flex-1 border-border" />
                  </div>

                  <Button variant="ghost" size="md" fullWidth onClick={() => setMode('magic')}>
                    <Sparkles className="h-4 w-4" aria-hidden /> Email me a sign-in link
                  </Button>
                  <Button variant="ghost" size="md" fullWidth onClick={() => setMode('password')}>
                    <Mail className="h-4 w-4" aria-hidden /> Use email and password
                  </Button>
                </div>
              )}

              {mode === 'password' && (
                <form onSubmit={submitPassword} className="mt-6 flex flex-col gap-4">
                  <Input label="Email" type="email" autoComplete="email" required
                         value={email} onChange={(e) => setEmail(e.target.value)} />
                  <Input label="Password" type="password" required minLength={8}
                         autoComplete={isRegister ? 'new-password' : 'current-password'}
                         hint={isRegister ? 'At least 8 characters.' : undefined}
                         value={password} onChange={(e) => setPassword(e.target.value)} />
                  <Button type="submit" size="lg" fullWidth loading={busy === 'password'}>
                    {isRegister ? 'Create account' : 'Sign in'}
                  </Button>
                  <div className="flex items-center justify-between text-[13px]">
                    <button type="button" onClick={() => setMode('providers')}
                            className="text-text-muted underline-offset-2 hover:text-text hover:underline">
                      Back
                    </button>
                    <button type="button" onClick={() => setIsRegister((v) => !v)}
                            className="text-brand underline-offset-2 hover:underline">
                      {isRegister ? 'I already have an account' : 'Create an account'}
                    </button>
                  </div>
                </form>
              )}

              {mode === 'magic' && (
                <form onSubmit={submitMagic} className="mt-6 flex flex-col gap-4">
                  <Input label="Email" type="email" autoComplete="email" required
                         hint="No password needed — we'll email you a link."
                         value={email} onChange={(e) => setEmail(e.target.value)} />
                  <Button type="submit" size="lg" fullWidth loading={busy === 'magic'}>
                    Send sign-in link
                  </Button>
                  <button type="button" onClick={() => setMode('providers')}
                          className="text-[13px] text-text-muted underline-offset-2 hover:text-text hover:underline">
                    Back
                  </button>
                </form>
              )}
            </>
          )}
        </motion.div>
      </main>
    </div>
  )
}
