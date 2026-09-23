import { useState } from 'react'
import { AlertTriangle, Loader2 } from 'lucide-react'
import { Card, CardHeader } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { useAuth } from '@/lib/auth'
import { usePreview } from '@/lib/preview'
import { supabase } from '@/lib/supabase'

/**
 * Deleting the account, and saying what that costs before it is pressed.
 *
 * The privacy policy used to say there was no button for this and to write to
 * an address instead. That was the honest thing to say while it was true --
 * claiming a right to erasure with no mechanism is the fake-feature failure
 * this project forbids -- but it was the only place the document admitted a
 * missing control, and the document is the reason this exists.
 *
 * WHAT MAKES IT DELIBERATE RATHER THAN GUARDED
 *
 * Three presses, and each one is a different kind of act. The first opens this
 * up; the second is typing your own address, which cannot be done by accident
 * and cannot be done by somebody who wandered onto an unlocked laptop without
 * knowing whose it is; the third is the button. A checkbox saying "I
 * understand" would be one click on top of another click, which is a speed
 * bump rather than a decision.
 *
 * WHAT IT LISTS IS READ FROM NOWHERE, AND THAT IS A LIMITATION
 *
 * The list below is written out rather than counted from the account. Counting
 * would be better -- "41 events, 3 classes, 2 report cards" is a real answer
 * and this is a category list -- but it would be six queries to render a card
 * most people will never open, and a count that is wrong is worse than a list
 * that is general. It is honest about being a list of kinds.
 *
 * PREVIEW HAS NO ACCOUNT TO DELETE
 *
 * Every audit this project runs enters through preview, because that is the
 * only way into the app from a container that cannot reach Supabase. A button
 * that renders there and silently does nothing is exactly the shape of defect
 * those audits exist to catch, so it says why instead.
 */
export function DeleteAccountCard() {
  const { user, signOut } = useAuth()
  const preview = usePreview()

  const [open, setOpen] = useState(false)
  const [typed, setTyped] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const email = user?.email ?? ''
  // Trimmed and case-folded: an address is not case-sensitive in the half that
  // matters here, and a phone keyboard capitalises the first letter of
  // everything. Refusing a correctly-typed address over an autocapital would
  // be the app inventing an obstacle.
  const matches = email.length > 0 && typed.trim().toLowerCase() === email.toLowerCase()

  async function remove() {
    if (!matches || busy) return
    setBusy(true)
    setError(null)

    const { data, error: invokeError } = await supabase.functions
      .invoke<{ deleted?: boolean; message?: string }>('calenda-delete-account')

    // The function's own sentence, not a generic apology. It names the step it
    // got to -- listing files, deleting files, deleting the account -- and
    // whether the account still exists, which is the only thing the reader
    // actually needs to know at this moment.
    if (invokeError) {
      const context = (invokeError as { context?: Response }).context
      let said: string | null = null
      try {
        const body = await context?.json() as { message?: unknown } | undefined
        if (typeof body?.message === 'string') said = body.message
      } catch {
        said = null
      }
      setBusy(false)
      setError(said ?? 'Your account was not deleted. Please try again, or write to the address on the privacy page.')
      return
    }

    // Asked rather than assumed. A 200 with `deleted` absent would mean the
    // function answered something this screen does not understand, and
    // reporting that as a deletion is this project's oldest bug -- a success
    // signal that is not downstream of the success.
    if (!data?.deleted) {
      setBusy(false)
      setError('Your account was not deleted. Please try again, or write to the address on the privacy page.')
      return
    }

    // The session is for a user that no longer exists. Signing out clears it
    // locally; without this the app holds a token whose every request now
    // fails, which reads as the app breaking rather than as the account being
    // gone.
    await signOut()
    window.location.hash = '#/'
  }

  return (
    <Card>
      <CardHeader title="Delete this account" />

      <div className="flex flex-col gap-4 px-5 pb-5">
        <p className="max-w-[62ch] text-[13.5px] leading-relaxed text-text-muted">
          This removes the account and everything attached to it — your classes and
          notes, your calendar and assignments, your marks and any report cards you
          uploaded, your reminders, and any link with a parent. It cannot be undone,
          and there is no copy kept.
        </p>

        <p className="max-w-[62ch] text-[13.5px] leading-relaxed text-text-muted">
          If you want to keep your dates, export them first — the calendar has an
          export button that writes a file your device can read. Nothing here does
          that for you.
        </p>

        {preview.active ? (
          <p className="text-[13px] leading-relaxed text-text-subtle">
            You're looking at preview mode, which has sample data and no account
            behind it. There is nothing here to delete.
          </p>
        ) : !open ? (
          <div>
            <Button variant="secondary" onClick={() => setOpen(true)}>
              Delete this account
            </Button>
          </div>
        ) : (
          <div className="flex flex-col gap-3 rounded-lg border border-danger/40 bg-danger/5 p-4">
            <p className="flex items-start gap-2 text-[13.5px] leading-relaxed text-text">
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-danger" aria-hidden />
              <span>
                Type <strong className="font-medium">{email || 'your email address'}</strong> to
                confirm. This is the last step.
              </span>
            </p>

            <Input
              label="Your email address"
              autoComplete="off"
              autoCapitalize="none"
              spellCheck={false}
              value={typed}
              onChange={(e) => { setTyped(e.target.value); setError(null) }}
            />

            {error && (
              <p role="alert" className="text-[13px] leading-relaxed text-danger">{error}</p>
            )}

            <div className="flex flex-wrap items-center gap-3">
              <Button variant="danger" disabled={!matches || busy} onClick={remove}>
                {busy ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : null}
                {busy ? 'Deleting…' : 'Delete my account permanently'}
              </Button>
              <Button
                variant="ghost"
                disabled={busy}
                onClick={() => { setOpen(false); setTyped(''); setError(null) }}
              >
                Keep my account
              </Button>
            </div>
          </div>
        )}
      </div>
    </Card>
  )
}
