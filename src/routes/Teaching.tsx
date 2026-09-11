import { useState } from 'react'
import { Link } from 'react-router-dom'
import { Plus, Presentation, Users } from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { Card } from '@/components/ui/Card'
import { EmptyState } from '@/components/ui/EmptyState'
import { ErrorState } from '@/components/ui/ErrorState'
import { Input } from '@/components/ui/Input'
import { Skeleton } from '@/components/ui/Skeleton'
import { useCreateTeachingGroup, useTeachingGroups } from '@/features/teaching/queries'
import { useSchoolYear } from '@/features/schoolYear/SchoolYearProvider'
import { useDraft } from '@/lib/draft'

/**
 * The classes this account teaches.
 *
 * Deliberately a different page from Classes rather than a tab inside it. A
 * student's class is their notebook and their marks; a teaching group is a
 * roster and a set of dates other people read. Somebody who is both -- a
 * teaching assistant, a student teacher -- has two of each, and putting them in
 * one list would mean every row needing a badge explaining which kind it is.
 */
export function Teaching() {
  const { current } = useSchoolYear()
  const { data: groups = [], isLoading, isError, refetch } = useTeachingGroups(current?.id)
  const create = useCreateTeachingGroup(current?.id)
  // Kept across leaving the screen. Typing half a class name, clicking
  // something in the sidebar and coming back to an empty form is losing
  // somebody's work to a component unmounting -- an implementation detail they
  // have no way to know about. Reported from real use on the first day anybody
  // made a class for a real reason.
  const draft = useDraft('calenda.newclass', { name: '', subject: '', room: '' })
  const [adding, setAdding] = useState(false)

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    if (!draft.value.name.trim()) return
    await create.mutateAsync(draft.value)
    draft.clear()
    setAdding(false)
  }

  return (
    <div className="mx-auto w-full max-w-[1100px] px-4 py-6 sm:px-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold tracking-tight text-text">Classes you teach</h1>
          <p className="mt-1 max-w-[62ch] text-[13px] leading-relaxed text-text-muted">
            A class here is not connected to any school&apos;s systems. Students join with a
            code you give them, and choose for themselves what they share back.
          </p>
        </div>
        {!adding && (
          <Button onClick={() => setAdding(true)}>
            <Plus className="h-4 w-4" aria-hidden />
            {draft.value.name.trim() ? 'Finish your class' : 'New class'}
          </Button>
        )}
      </div>

      {adding && (
        <Card className="mt-5 p-5">
          <form onSubmit={submit} className="flex flex-col gap-4">
            <Input
              label="Name"
              required
              autoFocus
              placeholder="Physics 11"
              value={draft.value.name}
              onChange={(e) => draft.set('name', e.target.value)}
              hint="What your students call it. They will see this."
            />
            <div className="grid gap-4 sm:grid-cols-2">
              <Input
                label="Subject"
                value={draft.value.subject}
                onChange={(e) => draft.set('subject', e.target.value)}
              />
              <Input
                label="Room"
                value={draft.value.room}
                onChange={(e) => draft.set('room', e.target.value)}
              />
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <Button type="submit" loading={create.isPending} disabled={!draft.value.name.trim()}>
                Make the class
              </Button>
              {/* Hiding the form is not discarding what is in it. Cancel closes
                  the panel and the draft survives; Discard is the one that
                  throws typing away, and it says so. */}
              <Button type="button" variant="ghost" onClick={() => setAdding(false)}>
                Cancel
              </Button>
              <Button
                type="button"
                variant="ghost"
                className="text-text-subtle"
                onClick={() => { draft.clear(); setAdding(false) }}
              >
                Discard
              </Button>
            </div>
          </form>
        </Card>
      )}

      {isLoading && (
        <div className="mt-5 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <Skeleton className="h-28" />
          <Skeleton className="h-28" />
        </div>
      )}

      {isError && (
        <div className="mt-5">
          <ErrorState what="your classes" onRetry={() => refetch()} />
        </div>
      )}

      {!isLoading && !isError && groups.length === 0 && !adding && (
        <div className="mt-5">
          <EmptyState
            icon={Presentation}
            title="No classes yet"
            description="Make one, then give your students the code it comes with."
            action={<Button onClick={() => setAdding(true)}>New class</Button>}
          />
        </div>
      )}

      {groups.length > 0 && (
        // min-w-0 on the grid children, because a grid item defaults to
        // min-width: auto and refuses to shrink below its content -- which is
        // what scrolled the dashboard sideways at 375px.
        <ul className="mt-5 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {groups.map((g) => (
            <li key={g.id} className="min-w-0">
              <Link
                to={`/teaching/${g.id}`}
                className="surface-card block min-w-0 p-5 transition-colors duration-150 hover:border-border-strong"
              >
                <p className="truncate text-[15px] font-semibold tracking-tight text-text">
                  {g.name}
                </p>
                <p className="mt-0.5 truncate text-[13px] text-text-muted">
                  {[g.subject, g.room].filter(Boolean).join(' · ') || 'No subject set'}
                </p>
                <p className="mt-3 flex items-center gap-1.5 text-[12.5px] text-text-subtle">
                  <Users className="h-3.5 w-3.5 shrink-0" aria-hidden />
                  {g.member_count === 1 ? '1 student' : `${g.member_count} students`}
                  {/* Said here rather than only on the detail page: "why has
                      nobody joined" is answered by the class being closed, and
                      that is invisible from a list that only shows a count. */}
                  {!g.join_code && ' · closed to new students'}
                </p>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
