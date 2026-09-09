import { useMemo, useState } from 'react'
import { GraduationCap, Pencil, Plus } from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { Card } from '@/components/ui/Card'
import { ConfirmDelete } from '@/components/ui/ConfirmDelete'
import { Input } from '@/components/ui/Input'
import { EmptyState } from '@/components/ui/EmptyState'
import { ErrorState } from '@/components/ui/ErrorState'
import { Skeleton } from '@/components/ui/Skeleton'
import { ShareToggle } from '@/features/parents/ShareToggle'
import {
  useCreateGrade, useDeleteGrade, useGrades, useUpdateGrade,
} from '@/features/grades/queries'
import { averageNote, averageOf, percentOf, scoreLabel } from './average'
import type { Grade } from '@/lib/types'
import { cn } from '@/lib/cn'

/**
 * Marks for one class.
 *
 * Every row starts private and is shared one at a time. That is not a setting
 * tucked away somewhere -- it is a toggle on each row, defaulting off, because
 * a student whose parent is linked should never discover that adding a mark
 * published it.
 */
export function GradesTab({ classId }: { classId: string }) {
  const { data: grades = [], isLoading, isError, refetch, isFetching } = useGrades(classId)
  const create = useCreateGrade(classId)
  const update = useUpdateGrade()
  const remove = useDeleteGrade()

  const [title, setTitle] = useState('')
  const [score, setScore] = useState('')
  const [outOf, setOutOf] = useState('')
  const [weight, setWeight] = useState('1')
  const [category, setCategory] = useState('')
  const [when, setWhen] = useState('')
  const [adding, setAdding] = useState(false)
  /**
   * The mark being corrected, or null while one is being added.
   *
   * One form for both. A mark typed wrong -- 84 for 48 -- was unfixable except
   * by deleting the row and typing it again, which loses the date and the
   * weight beside it and, if it was shared, silently unshares it. The fields
   * are identical either way, so a second form would be the same six inputs
   * kept in step by hand.
   */
  const [editing, setEditing] = useState<Grade | null>(null)

  const average = useMemo(() => averageOf(grades), [grades])
  const note = averageNote(average)

  function clear() {
    setTitle('')
    setScore('')
    setOutOf('')
    setWeight('1')
    setCategory('')
    setWhen('')
    setAdding(false)
    setEditing(null)
  }

  function edit(g: Grade) {
    setTitle(g.title)
    // Compared against null rather than falsiness: a score of 0 is a real
    // mark and `|| ''` would empty it on the way into the box.
    setScore(g.score === null ? '' : String(g.score))
    setOutOf(g.out_of === null ? '' : String(g.out_of))
    setWeight(String(g.weight ?? 1))
    setCategory(g.category ?? '')
    setWhen(g.recorded_on ?? '')
    setAdding(false)
    setEditing(g)
  }

  async function save(e: React.FormEvent) {
    e.preventDefault()
    if (!title.trim()) return
    const input = {
      title,
      // Empty is null, not zero. A test with no mark yet is the most common
      // row in a gradebook, and filing it as zero would be a lie the average
      // then repeats.
      score: score.trim() === '' ? null : Number(score),
      outOf: outOf.trim() === '' ? null : Number(outOf),
      weight: weight.trim() === '' ? 1 : Number(weight),
      category: category || null,
      recordedOn: when || null,
    }
    if (editing) await update.mutateAsync({ id: editing.id, input })
    else await create.mutateAsync(input)
    clear()
  }

  if (isLoading) return <Skeleton className="h-40 w-full rounded-xl" />
  if (isError) {
    return <ErrorState what="your marks" retrying={isFetching} onRetry={() => void refetch()} />
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          {average.percent !== null ? (
            <>
              <p className="font-display text-[28px] font-medium leading-none tracking-tight text-text">
                {average.percent}%
              </p>
              {/* The number and how it was reached, together. An average
                  without its working is a claim; with it, it is checkable --
                  which is this whole app's argument. */}
              {note && <p className="mt-1.5 text-[12.5px] text-text-muted">{note}</p>}
            </>
          ) : (
            <p className="text-[13.5px] text-text-muted">
              Nothing marked yet, so there is no average to show.
            </p>
          )}
        </div>
        {!adding && !editing && (
          <Button size="sm" onClick={() => { clear(); setAdding(true) }}>
            <Plus className="h-4 w-4" aria-hidden /> Add a mark
          </Button>
        )}
      </div>

      {(adding || editing) && (
        <Card className="p-4">
          <form onSubmit={save} className="flex flex-col gap-3">
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              <Input
                label="What for"
                required
                autoFocus
                placeholder="Unit 3 test"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
              />
              <Input
                label="Category"
                placeholder="Test, Quiz, Lab…"
                value={category}
                onChange={(e) => setCategory(e.target.value)}
              />
              <Input
                label="Date"
                type="date"
                value={when}
                onChange={(e) => setWhen(e.target.value)}
              />
              <Input
                label="Score"
                type="number"
                step="any"
                placeholder="Leave empty if not marked"
                value={score}
                onChange={(e) => setScore(e.target.value)}
              />
              <Input
                label="Out of"
                type="number"
                step="any"
                min="0.001"
                value={outOf}
                onChange={(e) => setOutOf(e.target.value)}
              />
              <Input
                label="Weight"
                type="number"
                step="any"
                min="0"
                value={weight}
                onChange={(e) => setWeight(e.target.value)}
                hint="2 counts double. 0 records it without counting."
              />
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <Button type="submit" size="sm" loading={create.isPending || update.isPending}>
                Save
              </Button>
              <Button type="button" size="sm" variant="secondary" onClick={clear}>
                Cancel
              </Button>
              {editing && (
                <p className="text-[12.5px] text-text-subtle">
                  Correcting “{editing.title}”. Sharing is unchanged.
                </p>
              )}
            </div>
          </form>
        </Card>
      )}

      {grades.length === 0 ? (
        <Card>
          <EmptyState
            icon={GraduationCap}
            title="No marks yet"
            description="Add one and Calenda works out the weighted average. Marks are private until you share them, one at a time."
          />
        </Card>
      ) : (
        <ul className="flex flex-col gap-1.5">
          {grades.map((g) => {
            const pct = percentOf(g)
            return (
              <li key={g.id}>
                <Card className="flex flex-wrap items-center gap-x-3 gap-y-2 px-4 py-3">
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[14px] font-medium text-text">
                      {g.title}
                    </span>
                    <span className="block truncate text-[12.5px] text-text-muted">
                      {[
                        g.category,
                        g.recorded_on,
                        g.weight !== 1 ? `weight ${g.weight}` : null,
                        // Said out loud. A mark a model read off a photograph
                        // is not the same kind of fact as one you typed.
                        g.source === 'report_card' ? 'from a report card' : null,
                      ].filter(Boolean).join(' · ') || 'No date'}
                    </span>
                  </span>

                  <span className="shrink-0 text-right">
                    <span className={cn(
                      'block tabular-nums text-[14px]',
                      g.score === null ? 'text-text-subtle' : 'font-medium text-text',
                    )}>
                      {scoreLabel(g)}
                    </span>
                    {pct !== null && (
                      <span className="block text-[12px] tabular-nums text-text-muted">{pct}%</span>
                    )}
                  </span>

                  <button
                    onClick={() => edit(g)}
                    aria-label={`Edit ${g.title}`}
                    className="grid h-7 w-7 shrink-0 place-items-center rounded-md text-text-subtle transition-colors duration-150 hover:bg-surface-2 hover:text-text"
                  >
                    <Pencil className="h-3.5 w-3.5" aria-hidden />
                  </button>

                  <ShareToggle
                    kind="grade"
                    id={g.id}
                    shared={g.shared_with_parents}
                    label={`The mark for “${g.title}”`}
                  />

                  <ConfirmDelete
                    what={`the mark for “${g.title}”`}
                    title="Delete this mark?"
                    detail={
                      g.shared_with_parents
                        ? 'It is shared with a linked parent, so it disappears from their view too.'
                        : undefined
                    }
                    pending={remove.isPending}
                    onConfirm={() => remove.mutateAsync(g.id)}
                  />
                </Card>
              </li>
            )
          })}
        </ul>
      )}
    </div>
  )
}
