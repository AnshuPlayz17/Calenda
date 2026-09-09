import { useState } from 'react'
import { Link, Navigate, useNavigate, useSearchParams } from 'react-router-dom'
import { Eye, EyeOff, Mail } from 'lucide-react'
import type { Provider } from '@supabase/supabase-js'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { AuthLayout } from '@/features/auth/AuthLayout'
import {
  AuthError, BackLink, NotConnected, ProviderButtons, Separator, StepMark,
} from '@/features/auth/AuthParts'
import {
  HeardFrom, ParentFields, RolePicker, StudentFields,
} from '@/features/auth/aboutYou'
import { schoolValue } from '@/features/auth/schoolChoice'
import type { Relation, Role } from '@/features/auth/aboutYou'
import { useAuth, SIGN_UP_BLOCKED } from '@/lib/auth'
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

const STEPS: Step[] = ['choose', 'credentials', 'name', 'details']

/** The step the address is asking for, or the first one if it is asking for
 *  something that is not a step. */
function readStep(raw: string | null): Step {
  return STEPS.includes(raw as Step) ? (raw as Step) : 'choose'
}

/**
 * What the top of the page says on each step.
 *
 * It said "Create your account / It takes about a minute." on all four, which
 * is the largest text on the page carrying no information after the first
 * screen -- and on the two steps that ask questions rather than credentials it
 * was actively unhelpful, because the reason for the questions is the one thing
 * somebody deciding whether to answer them wants.
 *
 * Every one of these is one line at the column's 380px, checked rather than
 * assumed. A subtitle that wraps to two costs 22px on the step that had the
 * least room to give -- the last one is already the tallest screen here, and
 * the reason its gaps are 4px tighter than every other step's.
 */
const HEADINGS: Record<Step, { title: string; subtitle: string }> = {
  choose: {
    title: 'Create your account',
    subtitle: 'It takes about a minute.',
  },
  credentials: {
    title: 'Create your account',
    subtitle: 'An email and a password to sign in with.',
  },
  name: {
    title: 'Who you are',
    subtitle: 'Your name, and which of the two you are.',
  },
  details: {
    title: 'Last step',
    subtitle: 'These decide what Calenda shows you.',
  },
}

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
  // The step lives in the address rather than in state, and that is a bug fix
  // rather than a preference. It was state, so the browser's own Back button --
  // the one a phone puts under your thumb -- left the form entirely and took
  // three screens of typing with it. Now Back is what it looks like: a step
  // back. The Back links in the form use the same history, so the two agree.
  const [params, setParams] = useSearchParams()
  const step = readStep(params.get('step'))
  const setStep = (next: Step) => {
    setParams(next === 'choose' ? {} : { step: next })
  }
  const [first, setFirst] = useState('')
  const [middle, setMiddle] = useState('')
  const [last, setLast] = useState('')
  const [school, setSchool] = useState('')
  const [inviteCode, setInviteCode] = useState('')
  const [noCode, setNoCode] = useState(false)
  const [schoolOther, setSchoolOther] = useState('')
  const [heardFrom, setHeardFrom] = useState('')
  const [relation, setRelation] = useState<Relation>('mother')
  const [role, setRole] = useState<Role>('student')
  const [grade, setGrade] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [busy, setBusy] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [reveal, setReveal] = useState(false)

  // A refresh, or a link somebody kept, can land on a later step with an empty
  // form behind it -- the fields are state and state does not survive either.
  // Sending them back to the start is the only honest option: the alternative
  // is a "create account" button over three blank screens.
  //
  // Only the steps *after* credentials, which is where those two are typed. The
  // first version of this checked every step and bounced the reader off step
  // one the instant they reached it, because email and password are empty there
  // by definition. The probe caught it; a person would have seen a button that
  // did nothing.
  if ((step === 'name' || step === 'details') && !email && !password) {
    return <Navigate to="/sign-up" replace />
  }

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
      school: role === 'student' ? schoolValue(school, schoolOther) : undefined,
      inviteCode: role === 'parent' && !noCode ? inviteCode.trim() : undefined,
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


  /**
   * Whether the last step has everything it asks for.
   *
   * The browser's own `required` handles most of this, and this is the belt to
   * that pair of braces: it disables the button so the state is visible before
   * anybody presses anything, and it covers the two controls `required` cannot
   * -- a select whose real answer lives in a second box, and a code that is
   * required unless the person has said they cannot get one yet.
   */
  const detailsReady = role === 'student'
    ? Boolean(schoolValue(school, schoolOther) && grade.trim() && heardFrom.trim())
    : Boolean((noCode || inviteCode.trim()) && heardFrom.trim())

  const mismatch = confirm.length > 0 && password !== confirm

  const { title, subtitle } = HEADINGS[step]

  return (
    <AuthLayout
      title={title}
      subtitle={subtitle}
      // Each step arrives rather than being swapped in between two frames, and
      // the change is announced from outside the part that is re-keyed.
      stepKey={step}
      announce={step === 'choose' ? '' : `Step ${STEPS.indexOf(step)} of 3`}
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
      {error === SIGN_UP_BLOCKED && (
        <p className="mt-2 text-[13px] text-text-muted">
          <Link to="/sign-in" className="font-medium text-brand underline-offset-2 hover:underline">
            Go to sign in
          </Link>
        </p>
      )}

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
          <StepMark at={1} of={3} label="How you sign in" />
          <Input
            label="Email"
            type="email"
            autoComplete="email"
            required
            autoFocus
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
          {/* One toggle for both boxes, not one each. They are the same secret
              typed twice, so revealing one and not the other tells the reader
              nothing they can use -- and two eye buttons in a column reads as
              two separate settings. */}
          <Reveal on={reveal} onToggle={() => setReveal((v) => !v)}>
            <Input
              label="Password"
              type={reveal ? 'text' : 'password'}
              required
              minLength={MIN_PASSWORD}
              autoComplete="new-password"
              hint={`At least ${MIN_PASSWORD} characters.`}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
          </Reveal>
          <Input
            label="Confirm password"
            type={reveal ? 'text' : 'password'}
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
          <StepMark at={2} of={3} label="Your name" />
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
            // The one field still optional, and it is optional because the
            // request said "if applicable". Plenty of people have no middle
            // name, and requiring one would stop them signing up.
            hint="If you have one."
          />
          <Input
            label="Last name"
            autoComplete="family-name"
            required
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
        // gap-3 rather than gap-4, on this step alone. It is the tallest -- a
        // four-option fieldset, two fields and a checkbox -- and at 375x667 the
        // Back link sat thirteen pixels below the fold. Six gaps at four pixels
        // less is twenty-four, which clears it without taking a field out or
        // disturbing the steps that already fit.
        <form onSubmit={submit} className="mt-6 flex flex-col gap-3">
          <StepMark at={3} of={3} label={role === 'student' ? 'Your school' : 'Your student'} />

          {role === 'student' ? (
            <StudentFields
              school={school}
              schoolOther={schoolOther}
              grade={grade}
              onSchool={setSchool}
              onSchoolOther={setSchoolOther}
              onGrade={setGrade}
            />
          ) : (
            <ParentFields
              relation={relation}
              code={inviteCode}
              noCode={noCode}
              onRelation={setRelation}
              onCode={setInviteCode}
              onNoCode={setNoCode}
            />
          )}

          {/* Last, and optional, because it is the only question here that is
              for Calenda rather than for the person answering it. */}
          <HeardFrom value={heardFrom} onChange={setHeardFrom} />

          <Button
            type="submit"
            size="lg"
            fullWidth
            loading={busy === 'password'}
            disabled={!detailsReady}
          >
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
 * A reveal button sitting on the password box it belongs to.
 *
 * Three password entries were typed blind. On a phone, with a password manager
 * not involved, that is the most common reason a sign-up is abandoned halfway:
 * a typo you cannot see, twice.
 *
 * A wrapper rather than a prop on Input, because Input is shared with every
 * other form in the app and only this page has two boxes holding one secret.
 */
function Reveal({ on, onToggle, children }: {
  on: boolean
  onToggle: () => void
  children: React.ReactNode
}) {
  return (
    <div className="relative">
      {children}
      <button
        type="button"
        onClick={onToggle}
        aria-pressed={on}
        aria-label={on ? 'Hide password' : 'Show password'}
        className="absolute right-2 top-[26px] grid h-9 w-9 place-items-center rounded-lg text-text-subtle transition-colors duration-150 hover:bg-surface-2 hover:text-text"
      >
        {on ? <EyeOff className="h-4 w-4" aria-hidden /> : <Eye className="h-4 w-4" aria-hidden />}
      </button>
    </div>
  )
}
