import { useEffect, useState } from 'react'
import { Navigate, useNavigate } from 'react-router-dom'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { AuthLayout } from '@/features/auth/AuthLayout'
import { AuthError, BackLink, StepMark } from '@/features/auth/AuthParts'
import {
  HeardFrom, ParentFields, RolePicker, StudentFields, TeacherFields,
} from '@/features/auth/aboutYou'
import { DETAIL_LABEL } from '@/features/auth/roleCopy'
import { schoolValue } from '@/features/auth/schoolChoice'
import type { Relation } from '@/features/auth/aboutYou'
import type { ChosenRole } from '@/features/auth/roleCopy'
import { useAuth } from '@/lib/auth'

/**
 * The questions somebody who signed in with Google was never asked.
 *
 * OAuth users never see the sign-up form -- they press one button and arrive
 * signed in -- so everything that form collects was missing for them, and they
 * are most of the accounts. `handle_new_user()` copies a name out of the
 * provider's metadata, so that much arrives; everything else did not. Every one
 * of them was silently a student, with no school, no grade, and no way to say
 * they were a parent.
 *
 * Two steps rather than the sign-up form's three, because the credentials step
 * has already happened by definition and the name usually has too.
 *
 * WHY IT IS A ROUTE AND NOT A DIALOG
 *
 * It survives a refresh, it can be linked to, and it cannot be dismissed by
 * pressing escape -- which matters, because being dismissed is exactly what a
 * question nobody wants to answer will be. The gate in RequireAuth sends
 * anybody without `onboarded_at` here, so closing the tab and coming back
 * lands in the same place rather than skipping it.
 */
export function FirstRun() {
  const { session, profile, loading, completeFirstRun } = useAuth()
  const navigate = useNavigate()

  const [step, setStep] = useState<'name' | 'details'>('name')
  const [fullName, setFullName] = useState('')
  const [role, setRole] = useState<ChosenRole>('student')
  const [school, setSchool] = useState('')
  const [grade, setGrade] = useState('')
  const [relation, setRelation] = useState<Relation>('mother')
  const [code, setCode] = useState('')
  const [noCode, setNoCode] = useState(false)
  const [schoolOther, setSchoolOther] = useState('')
  const [heardFrom, setHeardFrom] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Seeded from whatever the provider gave. One box rather than the sign-up
  // form's three, and that difference is deliberate: there is an existing value
  // here, and splitting "Ana María Ruiz Delgado" into three boxes to show it
  // back would guess wrong and make the reader fix a mess the app invented. At
  // sign-up there is nothing to split, so three boxes structure the question.
  useEffect(() => {
    if (profile?.full_name) setFullName(profile.full_name)
  }, [profile?.full_name])

  if (loading) return null
  if (!session) return <Navigate to="/sign-in" replace />
  // Somebody who has already answered should never be able to reach this by
  // typing the address, or they would be asked their school twice.
  if (profile?.onboarded_at) return <Navigate to="/dashboard" replace />

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    setBusy(true)
    setError(null)

    const { warning } = await completeFirstRun({
      fullName: fullName.trim(),
      role,
      grade: role === 'student' ? grade.trim() : undefined,
      school: role === 'student' ? schoolValue(school, schoolOther) : undefined,
      inviteCode: role === 'parent' && !noCode ? code.trim() : undefined,
      relation: role === 'parent' ? relation : undefined,
      heardFrom: heardFrom.trim(),
    })

    setBusy(false)
    // Same as the sign-up form: a code that did not take is carried and said
    // rather than swallowed, and it never blocks the way in.
    navigate('/welcome', { replace: true, state: warning ? { warning } : undefined })
  }


  /**
   * Whether the last step has everything it asks for.
   *
   * The browser's own `required` handles most of this, and this is the belt to
   * that pair of braces: it disables the button so the state is visible before
   * anybody presses anything, and it covers the two controls `required` cannot
   * -- a select whose real answer lives in a second box, and a code that is
   * required unless the person has said they cannot get one yet.
   */
  const detailsReady =
    role === 'student'
      ? Boolean(schoolValue(school, schoolOther) && grade.trim() && heardFrom.trim())
      : role === 'parent'
        ? Boolean((noCode || code.trim()) && heardFrom.trim())
        // A teacher is asked nothing here but the one question that is for
        // Calenda rather than for them.
        : Boolean(heardFrom.trim())

  const greeting = fullName.trim().split(' ')[0]

  return (
    <AuthLayout
      title={step === 'name' ? 'One more thing' : `Thanks${greeting ? `, ${greeting}` : ''}`}
      // Both one line at 380px, like the sign-up form's. This screen cannot be
      // measured from the dev container -- it needs a signed-in session, and
      // Supabase is unreachable from here -- so it is kept the same height as
      // the sign-up step it mirrors, which can be, rather than left to guess.
      subtitle={step === 'name'
        ? 'You are signed in. Two short steps to go.'
        : 'These decide what Calenda shows you.'}
      // Same treatment as the sign-up form, because this is the sign-up form
      // for everybody who arrived through a provider. Two steps rather than
      // three: the credentials step already happened by definition.
      stepKey={step}
      announce={`Step ${step === 'name' ? 1 : 2} of 2`}
    >
      <AuthError message={error} />

      {step === 'name' ? (
        <form
          onSubmit={(e) => { e.preventDefault(); setStep('details') }}
          className="mt-6 flex flex-col gap-4"
        >
          <StepMark at={1} of={2} label="Your name" />
          <Input
            label="Your name"
            autoComplete="name"
            required
            autoFocus
            value={fullName}
            onChange={(e) => setFullName(e.target.value)}
            hint="From your account. Change it if it is not what you go by."
          />

          <RolePicker value={role} onChange={setRole} />

          <Button type="submit" size="lg" fullWidth>Continue</Button>
        </form>
      ) : (
        // gap-3 for the same reason as sign-up's last step: it is the tallest
        // screen here and the parent branch is the tallest version of it.
        <form onSubmit={submit} className="mt-6 flex flex-col gap-3">
          <StepMark at={2} of={2} label={DETAIL_LABEL[role]} />

          {role === 'student' && (
            <StudentFields
              school={school}
              schoolOther={schoolOther}
              grade={grade}
              onSchool={setSchool}
              onSchoolOther={setSchoolOther}
              onGrade={setGrade}
            />
          )}
          {role === 'parent' && (
            <ParentFields
              relation={relation}
              code={code}
              noCode={noCode}
              onRelation={setRelation}
              onCode={setCode}
              onNoCode={setNoCode}
            />
          )}
          {role === 'teacher' && <TeacherFields />}

          <HeardFrom value={heardFrom} onChange={setHeardFrom} />

          <Button type="submit" size="lg" fullWidth loading={busy} disabled={!detailsReady}>
            Finish setting up
          </Button>
          <BackLink onClick={() => setStep('name')}>Back</BackLink>
        </form>
      )}
    </AuthLayout>
  )
}
