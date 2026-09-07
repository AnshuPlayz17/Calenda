import { useEffect, useState } from 'react'
import { Check, Loader2 } from 'lucide-react'
import { Card, CardHeader } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { useAuth } from '@/lib/auth'
import { supabase } from '@/lib/supabase'

/**
 * Who you are, and the ability to correct it.
 *
 * This card used to be a definition list -- four labels and four read-only
 * values, one of which said "Not set" for every account created with a
 * password, because nothing in the app had ever asked for a name and nothing
 * could set one. The sign-up form asks now, which makes the absence of an edit
 * screen worse rather than better: a typo made once at sign-up would have been
 * permanent.
 *
 * Email and time zone stay read-only. Changing an address is an auth operation
 * with its own confirmation flow, and the time zone is read from the browser
 * rather than chosen -- inventing a picker for it would be offering a setting
 * that the app then overrides.
 */
export function AccountCard() {
  const { profile, user, refreshProfile } = useAuth()

  const [fullName, setFullName] = useState('')
  const [role, setRole] = useState<'student' | 'parent'>('student')
  const [grade, setGrade] = useState('')
  const [busy, setBusy] = useState(false)
  const [saved, setSaved] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Seeded from the profile once it arrives, and again if it changes under us.
  useEffect(() => {
    if (!profile) return
    setFullName(profile.full_name ?? '')
    setRole(profile.role === 'parent' ? 'parent' : 'student')
    setGrade(profile.grade ?? '')
  }, [profile])

  const dirty = Boolean(profile) && (
    fullName !== (profile?.full_name ?? '')
    || role !== (profile?.role === 'parent' ? 'parent' : 'student')
    || grade !== (profile?.grade ?? '')
  )

  async function save(e: React.FormEvent) {
    e.preventDefault()
    if (!user) return
    setBusy(true)
    setError(null)
    setSaved(false)

    const { error } = await supabase.from('profiles')
      .update({
        full_name: fullName.trim() || null,
        role,
        grade: grade.trim() || null,
      })
      .eq('id', user.id)

    setBusy(false)
    if (error) {
      // The policy refuses rather than explains, which is correct of it. An
      // admin editing their own row here keeps their role; nobody else can
      // reach a value the policy would refuse, because the control only offers
      // the two it allows.
      setError('That could not be saved. Please try again.')
      return
    }

    await refreshProfile()
    setSaved(true)
  }

  return (
    <Card>
      <CardHeader title="Account" />

      <form onSubmit={save} className="flex flex-col gap-4 px-5 pb-5">
        <Input
          label="Name"
          autoComplete="name"
          value={fullName}
          onChange={(e) => { setFullName(e.target.value); setSaved(false) }}
          hint="Used to greet you, and shown to a parent you are linked with."
        />

        <div>
          <span className="text-[13px] font-medium text-text">You are</span>
          <div className="mt-1.5 grid grid-cols-2 gap-2">
            {(['student', 'parent'] as const).map((r) => (
              <label
                key={r}
                className={
                  'flex cursor-pointer items-center justify-center rounded-lg border px-3 py-2 text-[13.5px] capitalize transition-colors duration-150 '
                  + (role === r
                    ? 'border-brand bg-brand-subtle font-medium text-text'
                    : 'border-border text-text-muted hover:border-border-strong')
                }
              >
                <input
                  type="radio"
                  name="account-role"
                  value={r}
                  checked={role === r}
                  onChange={() => { setRole(r); setSaved(false) }}
                  className="sr-only"
                />
                {r}
              </label>
            ))}
          </div>
          {profile?.role === 'admin' && (
            // Shown rather than hidden. An admin who edits this card would
            // otherwise silently demote themselves by saving a form whose
            // radios cannot represent the role they hold.
            <p className="mt-2 text-[12.5px] leading-relaxed text-warning">
              This account is an administrator. Saving here sets it to
              {' '}{role}{' '}and gives up that access.
            </p>
          )}
        </div>

        <Input
          label="Grade"
          value={grade}
          onChange={(e) => { setGrade(e.target.value); setSaved(false) }}
          hint="Optional. Only you and a linked parent can see it."
        />

        <dl className="grid gap-x-8 gap-y-3 sm:grid-cols-2">
          <div>
            <dt className="label-caps">Email</dt>
            <dd className="mt-0.5 truncate text-[13.5px] text-text">{user?.email ?? '—'}</dd>
          </div>
          <div>
            <dt className="label-caps">Time zone</dt>
            <dd className="mt-0.5 text-[13.5px] text-text">{profile?.timezone ?? '—'}</dd>
          </div>
        </dl>

        {error && (
          <p role="alert" className="text-[13px] text-danger">{error}</p>
        )}

        <div className="flex items-center gap-3">
          <Button type="submit" disabled={!dirty || busy}>
            {busy ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : null}
            Save changes
          </Button>
          {saved && !dirty && (
            <span className="flex items-center gap-1.5 text-[13px] text-success" role="status">
              <Check className="h-4 w-4" aria-hidden /> Saved
            </span>
          )}
        </div>
      </form>
    </Card>
  )
}
