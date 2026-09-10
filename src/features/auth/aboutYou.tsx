import { GraduationCap, Presentation, Users } from 'lucide-react'
import { Input } from '@/components/ui/Input'
import { SCHOOLS } from '@/data/schools'
import { OTHER_SCHOOL } from './schoolChoice'

/**
 * The questions Calenda asks about a person, wherever it asks them.
 *
 * There are two places and there will not be a third. The sign-up form asks
 * somebody creating an account with a password; the first-run screen asks
 * everybody who arrived through Google, GitHub or Discord and therefore never
 * saw that form. Both need the same answers stored the same way, and a copy in
 * each is how the two drift until a parent signing up one way has a relation
 * and the other way does not.
 */

export type Role = 'student' | 'parent' | 'teacher'
export type Relation = 'mother' | 'father' | 'guardian' | 'other'

const RELATIONS: Relation[] = ['mother', 'father', 'guardian', 'other']

/**
 * What the last step's marker says, per role.
 *
 * Here rather than in either screen, for the same reason the questions
 * themselves are: a copy in the sign-up form and a copy in first-run is how a
 * teacher signing up one way is told what the screen is about and the other way
 * is told they are about to enter their student's details.
 *
 * A map rather than a nested ternary, because the third role turned one into
 * two and a fourth would turn two into three.
 */
export const DETAIL_LABEL: Record<Role, string> = {
  student: 'Your school',
  parent: 'Your student',
  teacher: 'Your classes',
}

/**
 * Three answers now, so the labels lost their "I'm a".
 *
 * Two long labels fit one row; three do not, and the alternative was a
 * dropdown that hides two thirds of the question behind a tap. The legend
 * above already says "You are", so the pronoun was doing no work.
 */
const ROLES = [
  { id: 'student' as const, label: 'Student', Icon: GraduationCap },
  { id: 'parent' as const, label: 'Parent', Icon: Users },
  { id: 'teacher' as const, label: 'Teacher', Icon: Presentation },
]

/**
 * The shared look of a set of mutually exclusive answers.
 *
 * `compact` exists for a measured reason rather than a visual one. Unifying the
 * relation buttons to the role buttons' padding made them four pixels taller
 * each, and at two rows that put the parent branch's Back link three pixels
 * below the fold at 375x667. Four answers in two rows need less air per row
 * than two answers in one.
 */
function Choice({ on, name, value, onPick, compact, children }: {
  on: boolean
  name: string
  value: string
  onPick: () => void
  compact?: boolean
  children: React.ReactNode
}) {
  return (
    <label
      className={
        'flex cursor-pointer items-center gap-2 rounded-lg border px-3 text-[13.5px] transition-colors duration-150 '
        + (compact ? 'py-2 ' : 'py-2.5 ')
        + (on
          ? 'border-brand bg-brand-subtle font-medium text-text'
          : 'border-border text-text-muted hover:border-border-strong')
      }
    >
      <input
        type="radio"
        name={name}
        value={value}
        checked={on}
        onChange={onPick}
        className="sr-only"
      />
      {children}
    </label>
  )
}

/**
 * Student, parent or teacher.
 *
 * Buttons rather than a select: there are three answers and they fit on one
 * line, so a dropdown would hide two thirds of the question behind a tap.
 * Radios in a group, so arrow keys move between them and a screen reader
 * announces it as one question rather than three unrelated checkboxes.
 *
 * The value is stored in the same column `is_admin()` reads, which is why the
 * database accepts it only through `set_my_role()` and refuses `admin` by name.
 */
export function RolePicker({ value, onChange }: {
  value: Role
  onChange: (v: Role) => void
}) {
  return (
    <fieldset>
      <legend className="text-[13px] font-medium text-text">You are</legend>
      <div className="mt-1.5 grid grid-cols-3 gap-2">
        {ROLES.map((r) => (
          <Choice
            key={r.id}
            name="role"
            value={r.id}
            on={value === r.id}
            onPick={() => onChange(r.id)}
          >
            <r.Icon
              className={'h-4 w-4 shrink-0 ' + (value === r.id ? 'text-brand' : 'text-text-subtle')}
              aria-hidden
            />
            <span className="truncate">{r.label}</span>
          </Choice>
        ))}
      </div>
    </fieldset>
  )
}

/**
 * How a parent is related to their student.
 *
 * Four fixed answers rather than free text, because these are categories the
 * app may group by later and because "mum", "Mother" and "mom" are one answer
 * typed three ways. Stored on `parent_links` rather than the profile: the same
 * adult can be a mother to one student and a guardian to another.
 */
export function RelationPicker({ value, onChange }: {
  value: Relation
  onChange: (v: Relation) => void
}) {
  return (
    <fieldset>
      <legend className="text-[13px] font-medium text-text">You are their</legend>
      <div className="mt-1.5 grid grid-cols-2 gap-2">
        {RELATIONS.map((r) => (
          <Choice
            key={r}
            name="relation"
            value={r}
            on={value === r}
            onPick={() => onChange(r)}
            compact
          >
            <span className="mx-auto capitalize">{r}</span>
          </Choice>
        ))}
      </div>
    </fieldset>
  )
}

/**
 * Which school, from the list the landing page names.
 *
 * A list rather than a text box was asked for, and it carries a claim the
 * database cannot yet back: there is no school entity, so a `community` event
 * is still visible to every account and picking a name changes nothing about
 * what you see. The hint says so rather than letting the control imply
 * otherwise.
 *
 * The last option is not decoration. A required list of fifteen schools with no
 * way out is not a validation, it is a door shut on everybody else -- so
 * choosing it reveals a box and that box is required in its place.
 */
export function SchoolPicker({ value, other, onChange, onOther }: {
  value: string
  other: string
  onChange: (v: string) => void
  onOther: (v: string) => void
}) {
  return (
    <div>
      <label htmlFor="school" className="text-[13px] font-medium text-text">School</label>
      <select
        id="school"
        required
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="mt-1.5 h-11 w-full rounded-lg border border-border bg-surface px-3 text-[14px] text-text transition-colors duration-150 hover:border-border-strong focus:border-brand focus:outline-none"
      >
        <option value="" disabled>Choose your school</option>
        {SCHOOLS.map((s) => (
          <option key={s.name} value={s.name}>{s.name}</option>
        ))}
        <option value={OTHER_SCHOOL}>Another school</option>
      </select>

      {value === OTHER_SCHOOL && (
        <div className="mt-3">
          <Input
            label="Which school?"
            required
            value={other}
            onChange={(e) => onOther(e.target.value)}
          />
        </div>
      )}

      <p className="mt-1.5 text-[12.5px] text-text-subtle">
        Recorded for later — it does not change what you see yet.
      </p>
    </div>
  )
}

/** School and grade. Rendered only for a student; a parent has neither. */
export function StudentFields({ school, schoolOther, grade, onSchool, onSchoolOther, onGrade }: {
  school: string
  schoolOther: string
  grade: string
  onSchool: (v: string) => void
  onSchoolOther: (v: string) => void
  onGrade: (v: string) => void
}) {
  return (
    <>
      <SchoolPicker
        value={school}
        other={schoolOther}
        onChange={onSchool}
        onOther={onSchoolOther}
      />
      <Input
        label="Grade"
        required
        value={grade}
        onChange={(e) => onGrade(e.target.value)}
        hint="Only you and a parent you link with can see it."
      />
    </>
  )
}

/**
 * The relation, and the code that links a parent to their student.
 *
 * The code is required, with one way past it, and that is not a loophole. It
 * comes from the student's own settings, so a parent who signs up first cannot
 * produce one however willing they are -- requiring it outright would not
 * validate anything, it would deadlock every parent whose child has not made an
 * account yet. Saying so explicitly is a real answer; leaving the field blank
 * is not.
 */
export function ParentFields({ relation, code, noCode, onRelation, onCode, onNoCode }: {
  relation: Relation
  code: string
  noCode: boolean
  onRelation: (v: Relation) => void
  onCode: (v: string) => void
  onNoCode: (v: boolean) => void
}) {
  return (
    <>
      <RelationPicker value={relation} onChange={onRelation} />
      {!noCode && (
      <Input
        label="Your student's code"
        required
        value={code}
        // Uppercased as it is typed, because redeem_parent_invite upper()s it
        // anyway and a lowercase code that then works is confusing to have
        // typed. Eight characters with no 0/O/1/I, so it survives being read
        // down a phone.
        onChange={(e) => onCode(e.target.value.toUpperCase())}
        hint="Eight characters, from their settings."
        autoCapitalize="characters"
        spellCheck={false}
      />
      )}

      {/* One line, not two. At 375px the longer wording wrapped and pushed the
          Back link thirteen pixels below the fold. "I'll add it later" was the
          half that could go: the hint under the field already says so. */}
      <label className="flex items-center gap-2.5 text-[13px] leading-relaxed text-text-muted">
        <input
          type="checkbox"
          checked={noCode}
          onChange={(e) => onNoCode(e.target.checked)}
          className="h-4 w-4 shrink-0 rounded border-border"
        />
        I don't have a code yet
      </label>
    </>
  )
}

/**
 * How somebody found Calenda.
 *
 * Free text rather than a list of five options, because a list is a guess at
 * the answers before any have been collected, and with a handful of users a
 * sentence is worth more than a bucket. Never shown back to the person who
 * wrote it, which is why it is not in Settings.
 */
export function HeardFrom({ value, onChange }: {
  value: string
  onChange: (v: string) => void
}) {
  return (
    <Input
      label="How did you hear about Calenda?"
      required
      value={value}
      onChange={(e) => onChange(e.target.value)}
      hint="A sentence is fine."
    />
  )
}

/**
 * What a teacher is told, and what they are not asked.
 *
 * They are asked nothing. A school name is the obvious third question and it is
 * the one question this app must not ask a teacher: `profiles.school` is free
 * text that nothing reads, harmless beside a student's own record and quite
 * different beside somebody who teaches -- "Teacher at <school>" is an
 * institutional claim, and the rule this project keeps is that Calenda is never
 * implied to be any school's product. A subject is not asked either, because a
 * teacher makes a class next and names it there; asking twice is how the two
 * end up disagreeing.
 *
 * So this step says what happens next instead. It is a real step rather than a
 * skipped one because the sign-up form promises three and arriving at a screen
 * that is missing is worse than arriving at a short one.
 */
export function TeacherFields() {
  return (
    <div className="rounded-lg border border-border bg-surface-subtle p-4">
      <p className="text-[13.5px] font-medium text-text">Next: make a class</p>
      <p className="mt-1.5 text-[13px] leading-relaxed text-text-muted">
        You will get an eight-character code to give your students. Anyone with the
        code can join, and you can change it or close it at any time.
      </p>
      <p className="mt-2.5 text-[12.5px] leading-relaxed text-text-subtle">
        A class here is not connected to any school&apos;s systems. Students join
        because you gave them the code, and they choose what they share back.
      </p>
    </div>
  )
}
