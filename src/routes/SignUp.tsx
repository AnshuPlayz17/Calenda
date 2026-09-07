import { useState } from 'react'
import { Link, Navigate, useNavigate } from 'react-router-dom'
import { ArrowLeft, GraduationCap, Mail, Users } from 'lucide-react'
import type { Provider } from '@supabase/supabase-js'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { AuthLayout } from '@/features/auth/AuthLayout'
import { AuthError, NotConnected, ProviderButtons, Separator } from '@/features/auth/AuthParts'
import { useAuth } from '@/lib/auth'
import { usePreview } from '@/lib/preview'

const MIN_PASSWORD = 8

/**
 * Who is signing up, in the only two answers that are a statement about
 * yourself rather than a claim on anything.
 *
 * It decides what the app shows -- a parent sees linked students rather than
 * their own classes -- and it is stored in the same column is_admin() reads,
 * which is why the database refuses anything but these two from a signed-in
 * user. See supabase/migrations/20260907000100.
 */
const ROLES = [
  { id: 'student' as const, label: "I'm a student", Icon: GraduationCap },
  { id: 'parent' as const, label: "I'm a parent", Icon: Users },
]

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
  const [fullName, setFullName] = useState('')
  const [role, setRole] = useState<'student' | 'parent'>('student')
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
    const { error } = await signUpWithPassword(email, password, {
      fullName: fullName.trim(),
      role,
    })
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
            label="Your name"
            autoComplete="name"
            required
            autoFocus
            value={fullName}
            onChange={(e) => setFullName(e.target.value)}
          />

          <RolePicker value={role} onChange={setRole} />

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

/**
 * Two buttons rather than a select.
 *
 * There are exactly two answers and both fit on one line, so a dropdown would
 * hide half the question behind a tap and tell the reader nothing about what
 * the alternatives are. Radios in a group, so a keyboard moves between them
 * with the arrow keys and a screen reader announces it as one question.
 */
function RolePicker({ value, onChange }: {
  value: 'student' | 'parent'
  onChange: (v: 'student' | 'parent') => void
}) {
  return (
    <fieldset>
      <legend className="text-[13px] font-medium text-text">You are</legend>
      <div className="mt-1.5 grid grid-cols-2 gap-2">
        {ROLES.map((r) => {
          const on = value === r.id
          return (
            <label
              key={r.id}
              className={
                'flex cursor-pointer items-center gap-2 rounded-lg border px-3 py-2.5 text-[13.5px] transition-colors duration-150 '
                + (on
                  ? 'border-brand bg-brand-subtle font-medium text-text'
                  : 'border-border text-text-muted hover:border-border-strong')
              }
            >
              <input
                type="radio"
                name="role"
                value={r.id}
                checked={on}
                onChange={() => onChange(r.id)}
                className="sr-only"
              />
              <r.Icon
                className={'h-4 w-4 shrink-0 ' + (on ? 'text-brand' : 'text-text-subtle')}
                aria-hidden
              />
              {r.label}
            </label>
          )
        })}
      </div>
    </fieldset>
  )
}
