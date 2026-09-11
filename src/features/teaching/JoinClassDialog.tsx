import { useState } from 'react'
import { Check, Link2, Plus } from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { Dialog } from '@/components/ui/Dialog'
import { Input } from '@/components/ui/Input'
import { useClasses, useCreateClass } from '@/features/classes/queries'
import { useJoinGroup, useMyGroups, useUpdateMyGroup } from '@/features/teaching/queries'
import { useSchoolYear } from '@/features/schoolYear/SchoolYearProvider'
import type { StudentGroup } from '@/lib/types'

/**
 * Joining a teacher's class, from the Classes page.
 *
 * It used to live only in Settings, which is where somebody goes to change
 * something rather than to start something. Asked for on 2026-09-11 after the
 * first real use: a code belongs where the classes are.
 *
 * Two steps, because joining answers one question and raises another. The
 * group is the teacher's; the class is yours; the database keeps them apart on
 * purpose and a member row may point at one of your own classes. That link is
 * what makes "the dates from this class" and "my notes for this subject" sit
 * beside each other -- and it is also what a teacher's view of your marks is
 * keyed on, so it is asked rather than assumed.
 */
export function JoinClassDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { current } = useSchoolYear()
  const { data: classes = [] } = useClasses(current?.id)
  const { refetch: refetchGroups } = useMyGroups()
  const join = useJoinGroup()
  const update = useUpdateMyGroup()
  const createClass = useCreateClass(current?.id)

  const [code, setCode] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [joined, setJoined] = useState<StudentGroup | null>(null)
  const [linked, setLinked] = useState<string | null>(null)

  function reset() {
    setCode('')
    setError(null)
    setJoined(null)
    setLinked(null)
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    try {
      const result = await join.mutateAsync(code.trim())
      // The membership row is what carries the link, and joinGroup returns the
      // class rather than the membership -- so the list is re-read and the new
      // one found by name. Newest wins, because somebody can be in two classes
      // a teacher named the same thing in different years.
      const { data: groups = [] } = await refetchGroups()
      const mine = [...groups]
        .filter((g) => g.group_name === result.groupName)
        .sort((a, b) => b.joined_at.localeCompare(a.joined_at))[0]
      if (!mine) {
        // Joined, but the membership could not be found to offer a link. Say so
        // and close rather than pretending the second step is unavailable --
        // the link can still be made from Settings.
        onClose()
        reset()
        return
      }
      setJoined(mine)
      setCode('')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'That did not work.')
    }
  }

  async function linkTo(classId: string) {
    if (!joined) return
    await update.mutateAsync({ id: joined.id, patch: { classId } })
    setLinked(classId)
  }

  async function createAndLink() {
    if (!joined) return
    const made = await createClass.mutateAsync({
      name: joined.group_name,
      // The teacher's own name, which the student would otherwise type in
      // themselves and spell differently.
      teacher: joined.teacher_name ?? null,
    })
    await linkTo(made.id)
  }

  /**
   * A class of the student's own that looks like the one they just joined.
   *
   * Compared on a trimmed, lower-cased name. Deliberately not fuzzier than
   * that: offering to link "Physics" to "Phys Ed" because they share four
   * letters would be the app making a decision it was not asked to make, and
   * nothing in Calenda merges anything without somebody saying so.
   */
  const match = joined
    ? classes.find((c) =>
        c.name.trim().toLowerCase() === joined.group_name.trim().toLowerCase())
    : undefined

  return (
    <Dialog
      open={open}
      onClose={() => { onClose(); reset() }}
      title={joined ? `You joined ${joined.group_name}` : 'Join a class'}
      description={
        joined
          ? undefined
          : 'Your teacher gives you an eight-character code. Joining shows you their dates; it shares nothing of yours.'
      }
    >
      {!joined && (
        <form onSubmit={submit} className="flex flex-col gap-4">
          <Input
            label="Join code"
            value={code}
            onChange={(e) => setCode(e.target.value.toUpperCase())}
            maxLength={8}
            autoFocus
            autoComplete="off"
            autoCapitalize="characters"
            className="font-mono tracking-[0.18em]"
          />
          {error && (
            <p role="alert" className="text-[13px] leading-relaxed text-danger">{error}</p>
          )}
          <div className="flex gap-2">
            <Button type="submit" loading={join.isPending} disabled={code.trim().length !== 8}>
              Join
            </Button>
            <Button type="button" variant="ghost" onClick={() => { onClose(); reset() }}>
              Cancel
            </Button>
          </div>
        </form>
      )}

      {joined && linked && (
        <div className="flex flex-col gap-4">
          <p className="flex items-start gap-2 text-[14px] leading-relaxed text-text">
            <Check className="mt-0.5 h-4 w-4 shrink-0 text-success" aria-hidden />
            Linked. Their dates are on your calendar, and your notes for this subject are
            in the class you picked.
          </p>
          <p className="text-[12.5px] leading-relaxed text-text-subtle">
            Your marks stay private. You can share them with this teacher from Settings,
            one class at a time.
          </p>
          <div>
            <Button onClick={() => { onClose(); reset() }}>Done</Button>
          </div>
        </div>
      )}

      {joined && !linked && (
        <div className="flex flex-col gap-4">
          <p className="text-[14px] leading-relaxed text-text">
            {joined.teacher_name
              ? `Taught by ${joined.teacher_name}. Their dates are on your calendar now.`
              : 'Their dates are on your calendar now.'}
          </p>

          {match ? (
            <>
              <p className="text-[13.5px] leading-relaxed text-text-muted">
                You already have a class called <strong className="font-medium text-text">{match.name}</strong>.
                Link them, and this teacher&apos;s dates sit beside your own notes for it.
              </p>
              <div className="flex flex-wrap gap-2">
                <Button loading={update.isPending} onClick={() => void linkTo(match.id)}>
                  <Link2 className="h-4 w-4" aria-hidden />
                  Link them
                </Button>
                <Button variant="ghost" onClick={() => { onClose(); reset() }}>
                  Not now
                </Button>
              </div>
            </>
          ) : (
            <>
              <p className="text-[13.5px] leading-relaxed text-text-muted">
                You have no class of your own for this yet. Making one gives you somewhere
                to keep notes, assignments and marks for it.
              </p>
              <div className="flex flex-wrap gap-2">
                <Button
                  loading={createClass.isPending || update.isPending}
                  onClick={() => void createAndLink()}
                >
                  <Plus className="h-4 w-4" aria-hidden />
                  Make &ldquo;{joined.group_name}&rdquo;
                </Button>
                {classes.length > 0 && (
                  <select
                    aria-label="Or link a class you already have"
                    defaultValue=""
                    onChange={(e) => { if (e.target.value) void linkTo(e.target.value) }}
                    className="h-10 rounded-lg border border-border bg-surface px-2.5 text-[13.5px] text-text transition-colors duration-150 hover:border-border-strong focus:border-brand focus:outline-none"
                  >
                    <option value="" disabled>Or link one you have…</option>
                    {classes.map((c) => (
                      <option key={c.id} value={c.id}>{c.name}</option>
                    ))}
                  </select>
                )}
                <Button variant="ghost" onClick={() => { onClose(); reset() }}>
                  Not now
                </Button>
              </div>
            </>
          )}
        </div>
      )}
    </Dialog>
  )
}
