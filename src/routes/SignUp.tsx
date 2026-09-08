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
type Step = 'choose' | 'credentials' | 'name' | 'details'
type Relation = 'mother' | 'father' | 'guardian' | 'other'

const RELATIONS: Relation[] = ['mother', 'father', 'guardian', 'other']

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
  // The email path is two steps, and that is a measurement rather than a
  // preference. Six fields plus a submit button do not fit a 700px window: the
  // harness found "Create account" 41px below the fold at 1280x700 and 123px
  // below at 375x667, with an input below it too. Padding could not buy that
  // back. Each step fits with room to spare, and the second step is the same
  // shape the first-run screen for OAuth users will need, since they never see
  // this form at all.
  //
  // Nothing is created until the end. Making the account after step one would
  // leave a nameless account behind every abandoned sign-up.
  const [step, setStep] = useState<Step>('choose')
  const [first, setFirst] = useState('')
  const [middle, setMiddle] = useState('')
  const [last, setLast] = useState('')
  const [school, setSchool] = useState('')
  const [inviteCode, setInviteCode] = useState('')
  const [heardFrom, setHeardFrom] = useState('')
  const [relation, setRelation] = useState<Relation>('mother')
  const [role, setRole] = useState<'student' | 'parent'>('student')
  const [grade, setGrade] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [busy, setBusy] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  if (session || preview.active) return <Navigate to="/dashboard" replace />

  function toAbout(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    // Checked before moving on, so a mismatch is caught on the step that
    // contains the fields rather than one screen later.
    if (password !== confirm) return setError("Those passwords don't match.")
    if (password.length < MIN_PASSWORD) {
      return setError(`Use at least ${MIN_PASSWORD} characters.`)
    }
    setStep('name')
  }

  function toDetails(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    setStep('details')
  }

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
    setBusy('password')
    const { error, warning } = await signUpWithPassword(email, password, {
      // One name, assembled from three boxes. Storing the parts separately
      // would need a migration and buy nothing the app uses -- it greets you by
      // your first name and shows your name to a linked parent. Only the first
      // is required: plenty of people have one name, and a required surname
      // turns them away at the door.
      fullName: [first, middle, last].map((p) => p.trim()).filter(Boolean).join(' '),
      role,
      // Neither of these is sent for the role it does not belong to. A parent
      // has no grade, and passing a field's last value because it was typed
      // before the answer changed would file a parent in year eleven.
      grade: role === 'student' ? grade.trim() : undefined,
      school: role === 'student' ? school.trim() : undefined,
      inviteCode: role === 'parent' ? inviteCode.trim() : undefined,
      relation: role === 'parent' ? relation : undefined,
      // Asked of everybody, because how somebody arrived does not depend on
      // which of the two they are.
      heardFrom: heardFrom.trim(),
    })
    setBusy(null)
    if (error) return setError(error)

    // The account exists at this point even if the invite code did not take,
    // so this goes on rather than stopping -- but it is said out loud on the
    // way, not swallowed.
    navigate('/welcome', { replace: true, state: warning ? { warning } : undefined })
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

      {step === 'choose' && (
        <div className="mt-6 flex flex-col gap-2">
          {/* The three promises that used to sit here are on the panel now,
              where they became four scenes of the real thing rather than four
              lines about it. On a phone the panel is not drawn at all, which is
              the correct trade: somebody who opened a sign-up page on a phone
              has already decided. */}
          <ProviderButtons verb="Sign up with" busy={busy} onPick={withProvider} />

          <Separator>or</Separator>

          <Button variant="ghost" size="md" fullWidth onClick={() => setStep('credentials')}>
            <Mail className="h-4 w-4" aria-hidden /> Use an email and password
          </Button>
        </div>
      )}

      {step === 'credentials' && (
        <form onSubmit={toAbout} className="mt-6 flex flex-col gap-4">
          <StepMark at={1} />
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
          {/* Not "Create account". Nothing is created by this press, and a
              button that names an action it does not perform is the reason
              people stop reading buttons. */}
          <Button type="submit" size="lg" fullWidth>Continue</Button>
          <BackLink onClick={() => { setStep('choose'); setError(null) }}>
            All sign-up options
          </BackLink>
        </form>
      )}

      {step === 'name' && (
        <form onSubmit={toDetails} className="mt-6 flex flex-col gap-4">
          <StepMark at={2} />
          <Input
            label="First name"
            autoComplete="given-name"
            required
            autoFocus
            value={first}
            onChange={(e) => setFirst(e.target.value)}
          />
          <Input
            label="Middle name"
            autoComplete="additional-name"
            value={middle}
            onChange={(e) => setMiddle(e.target.value)}
            hint="If you have one."
          />
          <Input
            label="Last name"
            autoComplete="family-name"
            value={last}
            onChange={(e) => setLast(e.target.value)}
          />

          <RolePicker value={role} onChange={setRole} />

          <Button type="submit" size="lg" fullWidth>Continue</Button>
          <BackLink onClick={() => { setStep('credentials'); setError(null) }}>
            Back
          </BackLink>
        </form>
      )}

      {step === 'details' && (
        <form onSubmit={submit} className="mt-6 flex flex-col gap-4">
          <StepMark at={3} />

          {role === 'student' ? (
            <>
              <Input
                label="Your school"
                value={school}
                onChange={(e) => setSchool(e.target.value)}
                // The honest version. Calenda has no school entity yet -- a
                // community event is visible to every account -- so a field
                // that looked like it filed you under a school would be
                // claiming something untrue. It is a text box rather than a
                // list of names for the same reason: a picker reads as "these
                // are supported".
                hint="Optional. Recorded for later — it does not change what you see yet."
              />
              <Input
                label="Grade"
                value={grade}
                onChange={(e) => setGrade(e.target.value)}
                hint="Optional. Only you and a parent you link with can see it."
              />
            </>
          ) : (
            <>
              <RelationPicker value={relation} onChange={setRelation} />
              <Input
                label="Your student's code"
                value={inviteCode}
                onChange={(e) => setInviteCode(e.target.value.toUpperCase())}
                // Eight characters, no 0/O/1/I, so it survives being read down
                // a phone. Uppercased as it is typed because the function
                // upper()s it anyway and a lowercase code that then works is
                // confusing to have typed.
                hint="Optional. They can make one in their settings, and you can add it any time."
                autoCapitalize="characters"
                spellCheck={false}
              />
            </>
          )}

          {/* Last, and optional, because it is the only question here that is
              for Calenda rather than for the person answering it. Free text
              rather than a list: with a handful of users an actual sentence is
              worth more than a bucket, and a list of five options is a guess at
              the answers before any have been collected.

              Only password sign-ups are ever asked -- somebody who signs up
              with Google never sees this form -- so it is a partial sample and
              should not be read as a count. */}
          <Input
            label="How did you hear about Calenda?"
            value={heardFrom}
            onChange={(e) => setHeardFrom(e.target.value)}
            hint="Optional."
          />

          <Button type="submit" size="lg" fullWidth loading={busy === 'password'}>
            Create account
          </Button>
          <BackLink onClick={() => { setStep('name'); setError(null) }}>
            Back
          </BackLink>
        </form>
      )}

      <NotConnected>
        Creating an account needs a Supabase project. You can still look around.
      </NotConnected>
    </AuthLayout>
  )
}

/**
 * How a parent is related to their student.
 *
 * Four fixed answers rather than free text, because these are categories the
 * app may group by later, and because "mum" and "Mother" and "mom" are the
 * same answer typed three ways. Stored on the link rather than the profile:
 * the same adult can be a mother to one student and a guardian to another.
 */
function RelationPicker({ value, onChange }: {
  value: Relation
  onChange: (v: Relation) => void
}) {
  return (
    <fieldset>
      <legend className="text-[13px] font-medium text-text">You are their</legend>
      <div className="mt-1.5 grid grid-cols-2 gap-2">
        {RELATIONS.map((r) => (
          <label
            key={r}
            className={
              'flex cursor-pointer items-center justify-center rounded-lg border px-3 py-2 text-[13.5px] capitalize transition-colors duration-150 '
              + (value === r
                ? 'border-brand bg-brand-subtle font-medium text-text'
                : 'border-border text-text-muted hover:border-border-strong')
            }
          >
            <input
              type="radio"
              name="relation"
              value={r}
              checked={value === r}
              onChange={() => onChange(r)}
              className="sr-only"
            />
            {r}
          </label>
        ))}
      </div>
    </fieldset>
  )
}

/**
 * Which of the three steps this is.
 *
 * Two marks rather than the words "Step 1 of 2", because the count is the
 * whole message and the sentence is four times the height of it on a window
 * that has none to spare.
 */
function StepMark({ at }: { at: 1 | 2 | 3 }) {
  return (
    <div className="flex items-center gap-1.5" aria-label={`Step ${at} of 3`}>
      {[1, 2, 3].map((n) => (
        <span
          key={n}
          aria-hidden
          className={
            'block h-1 rounded-full transition-all duration-300 '
            + (n === at ? 'w-6 bg-brand' : 'w-3 bg-border')
          }
        />
      ))}
    </div>
  )
}

function BackLink({ onClick, children }: { onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="inline-flex items-center gap-1.5 self-center text-[13px] text-text-muted underline-offset-2 hover:text-text hover:underline"
    >
      <ArrowLeft className="h-3.5 w-3.5" aria-hidden /> {children}
    </button>
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
