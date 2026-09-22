import { useState } from 'react'
import { Check, Loader2 } from 'lucide-react'
import { Card, CardHeader } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { Reveal } from '@/features/auth/AuthParts'
import { emailDelivery } from '@/lib/email'
import { env } from '@/lib/env'
import { useAuth } from '@/lib/auth'
import { usePreview } from '@/lib/preview'
import { supabase } from '@/lib/supabase'

/**
 * How you get in, and how to change it.
 *
 * `AccountCard` is who you are; this is the credential. They were one card and
 * that card said email and password were not changeable here -- which was true
 * and was the wrong answer, for the reason already written about names and
 * roles: collecting something a person cannot correct is worse than not
 * collecting it, and an address is the one field where being unable to correct
 * it eventually locks somebody out.
 *
 * THE CURRENT PASSWORD IS ASKED FOR, AND SUPABASE DOES NOT REQUIRE IT
 *
 * `auth.updateUser({ password })` changes the password of whoever holds the
 * session, full stop. On an unlocked laptop in a school library that is one
 * form between a passer-by and somebody else's account, with the owner locked
 * out of it afterwards.
 *
 * Supabase has a project setting that requires a recent sign-in for this, and
 * it cannot be read from the client -- so relying on it would be relying on a
 * control this code cannot see. Instead the current password is verified here,
 * by signing in with it, before the new one is set. That holds whatever the
 * project setting says, which is the point.
 *
 * It is not offered at all to an account with no password. Somebody who signs
 * in with Google has no password to change, and a form that asks for a current
 * password they have never had is a form that cannot be completed.
 *
 * THE ADDRESS CHANGE IS GATED ON MAIL WORKING, AND SAYS WHAT WILL ARRIVE
 *
 * Supabase confirms an address change by email -- to both addresses, with the
 * default project settings, and the change does not apply until the links are
 * followed. While `emailDelivery` is false that is a form whose entire effect
 * is a message nobody receives, so it is not rendered.
 *
 * The copy says a link is coming and that nothing changes until it is
 * followed, because the failure this avoids is somebody seeing "Saved",
 * believing their address is changed, and discovering otherwise the next time
 * they need to get in.
 */
export function SignInCard() {
  const { user } = useAuth()
  const preview = usePreview()

  const [email, setEmail] = useState('')
  const [emailBusy, setEmailBusy] = useState(false)
  const [emailSent, setEmailSent] = useState(false)
  const [emailError, setEmailError] = useState<string | null>(null)

  const [current, setCurrent] = useState('')
  const [next, setNext] = useState('')
  const [again, setAgain] = useState('')
  const [reveal, setReveal] = useState(false)
  const [pwBusy, setPwBusy] = useState(false)
  const [pwSaved, setPwSaved] = useState(false)
  const [pwError, setPwError] = useState<string | null>(null)

  /**
   * Which ways this account can sign in.
   *
   * `identities` is one row per linked provider. An account created with a
   * password has an `email` identity; one created through Google has a
   * `google` one and no password anywhere. Reading `app_metadata.provider`
   * instead would give only the most recent, which is wrong for anybody who
   * has both.
   */
  const providers = (user?.identities ?? []).map((i) => i.provider)
  const hasPassword = providers.includes('email')
  const currentEmail = user?.email ?? ''

  async function changeEmail(e: React.FormEvent) {
    e.preventDefault()
    const wanted = email.trim()
    if (!wanted || emailBusy) return
    setEmailBusy(true)
    setEmailError(null)
    setEmailSent(false)

    const { error } = await supabase.auth.updateUser(
      { email: wanted },
      // Where the link lands. `env.baseUrl` carries the repository subpath and
      // the hash goes on the end, because this app is hash-routed and a
      // redirect without one is read by the router as a path that does not
      // exist. Supabase silently substitutes the Site URL for anything not on
      // the allow list, which is how a correct project still delivers a link
      // that goes nowhere.
      { emailRedirectTo: `${env.baseUrl}#/settings` },
    )

    setEmailBusy(false)
    if (error) {
      setEmailError(error.message)
      return
    }
    setEmailSent(true)
    setEmail('')
  }

  async function changePassword(e: React.FormEvent) {
    e.preventDefault()
    if (pwBusy) return
    if (next.length < 8) {
      setPwError('Use at least 8 characters.')
      return
    }
    if (next !== again) {
      setPwError('Those two do not match.')
      return
    }
    setPwBusy(true)
    setPwError(null)
    setPwSaved(false)

    // Verified, not assumed. This is the whole reason the current password is
    // asked for; skipping it would make the field decoration.
    const { error: wrong } = await supabase.auth.signInWithPassword({
      email: currentEmail,
      password: current,
    })
    if (wrong) {
      setPwBusy(false)
      setPwError('That is not your current password.')
      return
    }

    const { error } = await supabase.auth.updateUser({ password: next })
    setPwBusy(false)
    if (error) {
      setPwError(error.message)
      return
    }
    setCurrent('')
    setNext('')
    setAgain('')
    setPwSaved(true)
  }

  if (preview.active) {
    return (
      <Card>
        <CardHeader title="Signing in" />
        <p className="px-5 pb-5 text-[13px] leading-relaxed text-text-subtle">
          You're looking at preview mode, which has sample data and no account
          behind it. There is nothing here to change.
        </p>
      </Card>
    )
  }

  return (
    <Card>
      <CardHeader title="Signing in" />

      <div className="flex flex-col gap-6 px-5 pb-5">
        <div>
          <p className="text-[13.5px] leading-relaxed text-text-muted">
            You sign in with{' '}
            <strong className="font-medium text-text">
              {providers.length === 0
                ? 'this address'
                : providers.map((p) => (p === 'email' ? 'an email and password' : p)).join(' and ')}
            </strong>
            {currentEmail ? <>, as {currentEmail}.</> : '.'}
          </p>
        </div>

        {emailDelivery && (
          <form onSubmit={changeEmail} className="flex flex-col gap-3 border-t border-border pt-5">
            <Input
              label="New email address"
              type="email"
              autoComplete="email"
              value={email}
              onChange={(e) => { setEmail(e.target.value); setEmailSent(false); setEmailError(null) }}
              hint="We'll send a link to confirm it. Nothing changes until you follow it — your current address keeps working until then."
            />
            {emailError && <p role="alert" className="text-[13px] text-danger">{emailError}</p>}
            <div className="flex items-center gap-3">
              <Button type="submit" variant="secondary" disabled={!email.trim() || emailBusy}>
                {emailBusy ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : null}
                Send the confirmation
              </Button>
              {emailSent && (
                <span role="status" className="flex items-center gap-1.5 text-[13px] text-success">
                  <Check className="h-4 w-4" aria-hidden /> Check your inbox
                </span>
              )}
            </div>
          </form>
        )}

        {hasPassword ? (
          <form onSubmit={changePassword} className="flex flex-col gap-3 border-t border-border pt-5">
            <Input
              label="Current password"
              type="password"
              autoComplete="current-password"
              value={current}
              onChange={(e) => { setCurrent(e.target.value); setPwSaved(false); setPwError(null) }}
            />

            {/* One toggle for two boxes: they hold the same secret typed
                twice, so revealing one and not the other tells the reader
                nothing, and two eye buttons in a column read as two separate
                settings. */}
            <Reveal on={reveal} onToggle={() => setReveal((v) => !v)}>
              <Input
                label="New password"
                type={reveal ? 'text' : 'password'}
                autoComplete="new-password"
                value={next}
                onChange={(e) => { setNext(e.target.value); setPwSaved(false); setPwError(null) }}
                hint="At least 8 characters."
              />
            </Reveal>
            <Input
              label="New password again"
              type={reveal ? 'text' : 'password'}
              autoComplete="new-password"
              value={again}
              onChange={(e) => { setAgain(e.target.value); setPwSaved(false); setPwError(null) }}
            />

            {pwError && <p role="alert" className="text-[13px] text-danger">{pwError}</p>}

            <div className="flex items-center gap-3">
              <Button
                type="submit"
                variant="secondary"
                disabled={pwBusy || !current || !next || !again}
              >
                {pwBusy ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : null}
                Change password
              </Button>
              {pwSaved && (
                <span role="status" className="flex items-center gap-1.5 text-[13px] text-success">
                  <Check className="h-4 w-4" aria-hidden /> Changed
                </span>
              )}
            </div>
          </form>
        ) : (
          <p className="border-t border-border pt-5 text-[13px] leading-relaxed text-text-subtle">
            This account has no password — you sign in through a provider, which
            holds it. There is nothing to change here.
          </p>
        )}
      </div>
    </Card>
  )
}
