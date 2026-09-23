import { useEffect, useState } from 'react'
import { Check, Loader2 } from 'lucide-react'
import { Card, CardHeader } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { SCHOOLS } from '@/data/schools'
import { SchoolPicker } from '@/features/auth/aboutYou'
import { OTHER_SCHOOL, schoolValue } from '@/features/auth/schoolChoice'
import type { ChosenRole } from '@/features/auth/roleCopy'
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
 * School joined the editable list on 2026-09-22, for the reason the name and
 * the role are here at all: it is asked on the sign-up form and was correctable
 * nowhere, which is the same defect one field along. It renders only for a
 * student, because the sign-up form deliberately does not ask a teacher -- see
 * `asksSchool` below.
 *
 * Email moved OUT of this card rather than becoming editable in it. Changing
 * an address is an auth operation with a confirmation round trip and nothing
 * to do with the profile row this form writes, so it lives in `SignInCard`
 * with the password, which has the same shape.
 *
 * Time zone stays read-only and is the one field that should. It genuinely is
 * read from the device -- a claim this comment made one commit too early,
 * before anything in the app called resolvedOptions() and while every account
 * in the world still said America/Toronto. Offering a picker would be offering
 * a setting the app then overwrites on next load, so it says where the value
 * comes from instead.
 */
/**
 * The stored role, as one of the three the picker offers.
 *
 * `user_role` has a fourth value the picker does not and must not: an admin is
 * granted in SQL by somebody who already has the database, never chosen from a
 * radio. So an admin's radios show 'student' and the dirty check below excludes
 * them, or Save would sit permanently lit for the one account that must not use
 * it. Written once because it was two ternaries that had to agree, and the
 * second one silently filed a teacher as a student.
 */
function pickerRole(stored: string | undefined): ChosenRole {
  return stored === 'parent' || stored === 'teacher' ? stored : 'student'
}

export function AccountCard() {
  const { profile, user, refreshProfile } = useAuth()

  const [fullName, setFullName] = useState('')
  const [role, setRole] = useState<ChosenRole>('student')
  const [grade, setGrade] = useState('')
  // Two pieces of state for one stored value: which option is selected, and
  // what was typed when that option is "another school". `schoolValue()`
  // collapses them, the same way the sign-up form does.
  const [school, setSchool] = useState('')
  const [schoolOther, setSchoolOther] = useState('')
  const [busy, setBusy] = useState(false)
  const [saved, setSaved] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Seeded from the profile once it arrives, and again if it changes under us.
  useEffect(() => {
    if (!profile) return
    setFullName(profile.full_name ?? '')
    setRole(pickerRole(profile.role))
    setGrade(profile.grade ?? '')

    // A stored school that is not one of the fifteen came from the "another
    // school" box, so it goes back into that box rather than being silently
    // dropped by a select that has no option matching it. Getting this wrong
    // shows an empty picker to somebody who answered, and saving would then
    // erase the answer they could still see a moment ago.
    const stored = profile.school ?? ''
    if (stored === '') { setSchool(''); setSchoolOther('') }
    else if (SCHOOLS.some((s) => s.name === stored)) { setSchool(stored); setSchoolOther('') }
    else { setSchool(OTHER_SCHOOL); setSchoolOther(stored) }
  }, [profile])

  const isAdmin = profile?.role === 'admin'

  /**
   * School is a student's question and nobody else's.
   *
   * The sign-up form deliberately asks a teacher nothing on its last step, and
   * school is the reason: `profiles.school` is free text that nothing reads,
   * which is harmless beside a student's own record and an institutional claim
   * beside somebody who teaches. Rendering it here for a teacher would reopen
   * exactly the question that form refuses to ask. A parent is not asked
   * either -- the child's school is the child's answer, not theirs.
   */
  const asksSchool = role === 'student'
  const dirty = Boolean(profile) && (
    fullName !== (profile?.full_name ?? '')
    || grade !== (profile?.grade ?? '')
    || (asksSchool && schoolValue(school, schoolOther) !== (profile?.school ?? ''))
    // An admin's radios never match their stored role, so counting that as an
    // edit would leave Save permanently lit for them.
    || (!isAdmin && role !== pickerRole(profile?.role))
  )

  async function save(e: React.FormEvent) {
    e.preventDefault()
    if (!user) return
    setBusy(true)
    setError(null)
    setSaved(false)

    // Two calls, because role is not one of the columns a client may name in
    // an update -- see supabase/migrations/20260907000200. The granted fields
    // go through the table; the role goes through the function that guards it.
    const { error } = await supabase.from('profiles')
      .update({
        full_name: fullName.trim() || null,
        grade: grade.trim() || null,
        // Only sent where it is asked. A patch that always carried `school`
        // would blank a student's answer the moment they switched their role
        // to teacher and pressed Save, because the field is not rendered
        // there and its state would be empty.
        ...(asksSchool ? { school: schoolValue(school, schoolOther) || null } : {}),
      })
      .eq('id', user.id)

    // An admin is left alone. The radios here can only say student or parent,
    // so calling this for an admin would demote them for pressing Save on a
    // form they opened to fix a typo in their name.
    const roleError = profile?.role === 'admin' || role === profile?.role
      ? null
      : (await supabase.rpc('set_my_role', { new_role: role })).error

    setBusy(false)
    if (error || roleError) {
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
          <div className="mt-1.5 grid grid-cols-3 gap-2">
            {(['student', 'parent', 'teacher'] as const).map((r) => (
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
            // Said rather than hidden. The radios cannot represent admin, so
            // without this the card would look like it had quietly demoted
            // somebody the moment they opened it. Saving does not: the role
            // call is skipped entirely for an admin.
            <p className="mt-2 text-[12.5px] leading-relaxed text-text-subtle">
              This account is an administrator. That is set in the database, not
              here, and saving this form leaves it alone.
            </p>
          )}
        </div>

        <Input
          label="Grade"
          value={grade}
          onChange={(e) => { setGrade(e.target.value); setSaved(false) }}
          hint="Optional. Only you and a linked parent can see it."
        />

        {asksSchool && (
          <SchoolPicker
            required={false}
            value={school}
            other={schoolOther}
            onChange={(v) => { setSchool(v); setSaved(false) }}
            onOther={(v) => { setSchoolOther(v); setSaved(false) }}
          />
        )}

        <dl className="grid gap-x-8 gap-y-3 sm:grid-cols-2">
          <div>
            <dt className="label-caps">Time zone</dt>
            <dd className="mt-0.5 text-[13.5px] text-text">{profile?.timezone ?? '—'}</dd>
            <dd className="mt-0.5 text-[12px] leading-relaxed text-text-subtle">
              Read from this device. Reminders arrive at nine in your morning,
              wherever that is.
            </dd>
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
