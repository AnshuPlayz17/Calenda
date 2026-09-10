import { useState } from 'react'
import { Check, LogOut } from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { Card, CardHeader } from '@/components/ui/Card'
import { ConfirmDelete } from '@/components/ui/ConfirmDelete'
import { Input } from '@/components/ui/Input'
import { useClasses } from '@/features/classes/queries'
import {
  useJoinGroup, useLeaveGroup, useMyGroups, useUpdateMyGroup,
} from '@/features/teaching/queries'
import { useSchoolYear } from '@/features/schoolYear/SchoolYearProvider'

/**
 * The student's side of a teaching group: joining one, and deciding what it
 * gets to see.
 *
 * In Settings rather than on its own page. Joining is something a person does
 * once a term; what it changes -- their calendar -- is somewhere else entirely,
 * and a page whose whole content is a text box is a page nobody finds twice.
 *
 * The two controls are deliberately in this order. Linking a class comes first
 * because sharing does nothing without it: the policy requires both, so a
 * sharing switch on its own would be a control that visibly does nothing, which
 * is worse than one that is not there.
 */
export function JoinedClassesCard() {
  const { current } = useSchoolYear()
  const { data: groups = [] } = useMyGroups()
  const { data: classes = [] } = useClasses(current?.id)
  const join = useJoinGroup()
  const update = useUpdateMyGroup()
  const leave = useLeaveGroup()

  const [code, setCode] = useState('')
  const [joined, setJoined] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    setJoined(null)
    try {
      const result = await join.mutateAsync(code.trim())
      setJoined(
        result.teacherName
          ? `You joined ${result.groupName}, taught by ${result.teacherName}.`
          : `You joined ${result.groupName}.`,
      )
      setCode('')
    } catch (err) {
      // The database raises a sentence written for a person. It is passed
      // through rather than replaced with something vaguer -- and it is the
      // same sentence for every failure, so it cannot confirm a guess.
      setError(err instanceof Error ? err.message : 'That did not work.')
    }
  }

  return (
    <Card>
      <CardHeader title="Classes you have joined" />
      <div className="px-5 pb-5">
        <form onSubmit={submit} className="flex flex-col gap-3">
          <Input
            label="Join code"
            value={code}
            onChange={(e) => setCode(e.target.value.toUpperCase())}
            maxLength={8}
            autoCapitalize="characters"
            autoComplete="off"
            className="font-mono tracking-[0.18em]"
            hint="Eight characters, from a teacher. Joining shows you their dates; it shares nothing of yours."
          />
          <div>
            <Button type="submit" size="sm" loading={join.isPending} disabled={code.trim().length !== 8}>
              Join
            </Button>
          </div>
        </form>

        {joined && (
          <p
            // Announced, not just shown. A form whose only feedback is a list
            // changing further down the page tells a screen reader nothing.
            role="status"
            className="mt-3 flex items-start gap-1.5 text-[13px] leading-relaxed text-text"
          >
            <Check className="mt-0.5 h-3.5 w-3.5 shrink-0 text-success" aria-hidden />
            {joined}
          </p>
        )}
        {error && (
          <p role="alert" className="mt-3 text-[13px] leading-relaxed text-danger">
            {error}
          </p>
        )}

        {groups.length > 0 && (
          <ul className="mt-5 divide-y divide-border">
            {groups.map((g) => (
              <li key={g.id} className="py-3 first:pt-0">
                <div className="flex min-w-0 items-start gap-3">
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-[13.5px] font-medium text-text">{g.group_name}</p>
                    <p className="truncate text-[12.5px] text-text-subtle">
                      {g.teacher_name ?? 'Your teacher'}
                      {g.subject ? ` · ${g.subject}` : ''}
                    </p>
                  </div>
                  <ConfirmDelete
                    what={g.group_name}
                    title="Leave this class?"
                    detail="Their dates and announcements stop appearing for you. Nothing of yours is deleted, and you can join again if you still have the code."
                    onConfirm={() => leave.mutateAsync(g.id)}
                    pending={leave.isPending}
                  />
                </div>

                <div className="mt-2.5 flex flex-col gap-2">
                  <label className="text-[12.5px] text-text-muted">
                    Your class for this
                    <select
                      value={g.class_id ?? ''}
                      onChange={(e) =>
                        update.mutate({ id: g.id, patch: { classId: e.target.value || null } })}
                      className="mt-1 h-9 w-full rounded-lg border border-border bg-surface px-2.5 text-[13px] text-text transition-colors duration-150 hover:border-border-strong focus:border-brand focus:outline-none"
                    >
                      <option value="">Not linked</option>
                      {classes.map((c) => (
                        <option key={c.id} value={c.id}>{c.name}</option>
                      ))}
                    </select>
                  </label>

                  <label className="flex items-start gap-2 text-[12.5px] leading-relaxed text-text-muted">
                    <input
                      type="checkbox"
                      checked={g.share_progress}
                      disabled={!g.class_id}
                      onChange={(e) =>
                        update.mutate({ id: g.id, patch: { shareProgress: e.target.checked } })}
                      className="mt-0.5 h-3.5 w-3.5 shrink-0 accent-[var(--brand)]"
                    />
                    <span>
                      Let this teacher see your marks for that class.
                      {!g.class_id && ' Link a class first — there is nothing to share yet.'}
                    </span>
                  </label>
                </div>
              </li>
            ))}
          </ul>
        )}

        {groups.length === 0 && (
          <p className="mt-4 flex items-center gap-1.5 text-[13px] text-text-muted">
            <LogOut className="h-3.5 w-3.5 shrink-0 rotate-180" aria-hidden />
            You have not joined any classes.
          </p>
        )}

        <p className="mt-4 text-[12px] leading-relaxed text-text-subtle">
          Marks stay private until you turn them on here, one class at a time, and turning
          them off takes them away again. A teacher can never turn this on for you.
        </p>
      </div>
    </Card>
  )
}
