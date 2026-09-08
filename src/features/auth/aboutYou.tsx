import { GraduationCap, Users } from 'lucide-react'
import { Input } from '@/components/ui/Input'

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

export type Role = 'student' | 'parent'
export type Relation = 'mother' | 'father' | 'guardian' | 'other'

const RELATIONS: Relation[] = ['mother', 'father', 'guardian', 'other']

const ROLES = [
  { id: 'student' as const, label: "I'm a student", Icon: GraduationCap },
  { id: 'parent' as const, label: "I'm a parent", Icon: Users },
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
 * Student or parent.
 *
 * Two buttons rather than a select: there are exactly two answers and both fit
 * on one line, so a dropdown would hide half the question behind a tap. Radios
 * in a group, so arrow keys move between them and a screen reader announces it
 * as one question rather than two unrelated checkboxes.
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
      <div className="mt-1.5 grid grid-cols-2 gap-2">
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
            {r.label}
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

/** School and grade. Rendered only for a student; a parent has neither. */
export function StudentFields({ school, grade, onSchool, onGrade }: {
  school: string
  grade: string
  onSchool: (v: string) => void
  onGrade: (v: string) => void
}) {
  return (
    <>
      <Input
        label="Your school"
        value={school}
        onChange={(e) => onSchool(e.target.value)}
        // The honest version. Calenda has no school entity yet -- a community
        // event is visible to every account -- so a field implying it filed you
        // under a school would be claiming something untrue. A text box rather
        // than a list for the same reason: a picker reads as "these are
        // supported", and those names belong on the landing page.
        hint="Optional. Recorded for later — it does not change what you see yet."
      />
      <Input
        label="Grade"
        value={grade}
        onChange={(e) => onGrade(e.target.value)}
        hint="Optional. Only you and a parent you link with can see it."
      />
    </>
  )
}

/** The relation, and the code that links a parent to their student. */
export function ParentFields({ relation, code, onRelation, onCode }: {
  relation: Relation
  code: string
  onRelation: (v: Relation) => void
  onCode: (v: string) => void
}) {
  return (
    <>
      <RelationPicker value={relation} onChange={onRelation} />
      <Input
        label="Your student's code"
        value={code}
        // Uppercased as it is typed, because redeem_parent_invite upper()s it
        // anyway and a lowercase code that then works is confusing to have
        // typed. Eight characters with no 0/O/1/I, so it survives being read
        // down a phone.
        onChange={(e) => onCode(e.target.value.toUpperCase())}
        hint="Optional. They can make one in their settings, and you can add it any time."
        autoCapitalize="characters"
        spellCheck={false}
      />
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
      value={value}
      onChange={(e) => onChange(e.target.value)}
      hint="Optional."
    />
  )
}
