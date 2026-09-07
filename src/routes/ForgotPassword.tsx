import { useState } from 'react'
import { Link, Navigate } from 'react-router-dom'
import { MailCheck } from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { AuthLayout } from '@/features/auth/AuthLayout'
import { AuthError } from '@/features/auth/AuthParts'
import { useAuth } from '@/lib/auth'
import { emailDelivery } from '@/lib/email'

/**
 * Ask for a recovery link.
 *
 * Unreachable while `emailDelivery` is off, and it redirects rather than
 * rendering a form that would do nothing -- somebody who types the URL by hand
 * should land somewhere that works, not on a page that accepts an address and
 * silently drops it.
 */
export function ForgotPassword() {
  const { session, resetPassword } = useAuth()
  const [email, setEmail] = useState('')
  const [busy, setBusy] = useState(false)
  const [sent, setSent] = useState(false)
  const [error, setError] = useState<string | null>(null)

  if (!emailDelivery) return <Navigate to="/sign-in" replace />
  if (session) return <Navigate to="/dashboard" replace />

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    setBusy(true)
    setError(null)
    const { error } = await resetPassword(email)
    setBusy(false)
    if (error) return setError(error)
    setSent(true)
  }

  return (
    <AuthLayout
      title="Reset your password"
      subtitle="We'll email you a link that signs you in and lets you set a new one."
      footer={
        <Link to="/sign-in" className="font-medium text-brand underline-offset-2 hover:underline">
          Back to sign in
        </Link>
      }
    >
      <AuthError message={error} />

      {sent ? (
        // Worded so it is true whether or not that address has an account.
        // Confirming which addresses are registered is the same disclosure the
        // uniform sign-in errors exist to avoid.
        <div className="mt-6 flex items-start gap-3 rounded-xl border border-border bg-surface p-4">
          <MailCheck className="mt-0.5 h-4 w-4 shrink-0 text-brand" aria-hidden />
          <div>
            <p className="text-[13.5px] font-medium text-text">Check your email</p>
            <p className="mt-1 text-[12.5px] leading-relaxed text-text-muted">
              If there is an account for {email}, a link is on its way. It expires in an
              hour, and using it signs you straight in.
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
          <Button type="submit" size="lg" fullWidth loading={busy}>
            Send the link
          </Button>
        </form>
      )}
    </AuthLayout>
  )
}
