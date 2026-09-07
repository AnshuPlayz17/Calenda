import { useState } from 'react'
import { Link, Navigate, useNavigate } from 'react-router-dom'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { AuthLayout } from '@/features/auth/AuthLayout'
import { AuthError } from '@/features/auth/AuthParts'
import { useAuth } from '@/lib/auth'
import { emailDelivery } from '@/lib/email'

const MIN_PASSWORD = 8

/**
 * Where a recovery link lands.
 *
 * Following the link puts a real session in place before this route renders --
 * Supabase's client reads the token out of the URL and signs the person in --
 * so the only thing left to do is set the new password. That is also why the
 * page must not redirect a signed-in reader away the way the other auth pages
 * do: here, being signed in is the expected state rather than the finished one.
 */
export function ResetPassword() {
  const { session, loading, updatePassword } = useAuth()
  const navigate = useNavigate()
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

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

  // A link that has expired, or an address bar somebody typed into, leaves no
  // session behind. Say so rather than showing a form whose submit would fail.
  const expired = !loading && !session

  return (
    <AuthLayout
      title="Set a new password"
      subtitle={expired
        ? 'That link is no longer valid.'
        : 'Choose something you have not used here before.'}
      footer={
        <Link to="/sign-in" className="font-medium text-brand underline-offset-2 hover:underline">
          Back to sign in
        </Link>
      }
    >
      <AuthError message={error} />

      {expired ? (
        <p className="mt-6 rounded-xl border border-border bg-surface p-4 text-[13px] leading-relaxed text-text-muted">
          Recovery links expire an hour after they are sent, and each one works once.
          Ask for a new one and it will still be the same account.
        </p>
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
