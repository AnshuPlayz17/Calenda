import { useState } from 'react'
import { motion, useReducedMotion } from 'motion/react'
import { Check, Inbox, Pencil, X } from 'lucide-react'
import { Card } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'
import { EmptyState } from '@/components/ui/EmptyState'
import { Skeleton } from '@/components/ui/Skeleton'
import { categoryColor } from '@/components/ui/CategoryDot'
import { EventDialog } from '@/features/events/EventDialog'
import { usePendingReview, useReviewEvent } from '@/features/events/queries'
import { useSchoolYear } from '@/features/schoolYear/SchoolYearProvider'
import { agendaLabel } from '@/lib/datetime'
import { spanDays } from '@/lib/events'
import type { EventWithCategory } from '@/lib/types'

/**
 * The admin queue. A suggestion can be approved, declined with a reason, or
 * edited first -- editing then approving is one flow rather than two, because
 * "nearly right" is the common case.
 */
export function ReviewQueue() {
  const { current } = useSchoolYear()
  const { data: pending = [], isLoading } = usePendingReview(current?.id)
  const review = useReviewEvent()
  const reduce = useReducedMotion()

  const [editing, setEditing] = useState<EventWithCategory | null>(null)
  const [decliningId, setDecliningId] = useState<string | null>(null)
  const [note, setNote] = useState('')
  const [error, setError] = useState<string | null>(null)

  async function decide(id: string, action: 'approve' | 'reject', reason?: string) {
    setError(null)
    try {
      await review.mutateAsync({ id, action, note: reason })
      setDecliningId(null)
      setNote('')
    } catch (err) {
      setError(err instanceof Error ? err.message : "We couldn't record that decision.")
    }
  }

  if (isLoading) {
    return (
      <div className="flex flex-col gap-2">
        <Skeleton className="h-24 w-full rounded-xl" />
        <Skeleton className="h-24 w-full rounded-xl" />
      </div>
    )
  }

  if (pending.length === 0) {
    return (
      <Card>
        <EmptyState
          icon={Inbox}
          title="Nothing waiting for review"
          description="Suggestions from students and parents will queue up here."
        />
      </Card>
    )
  }

  return (
    <div className="flex flex-col gap-3">
      {error && (
        <p role="alert"
           className="rounded-lg border border-danger-border bg-danger-subtle px-3 py-2 text-[13px] text-danger">
          {error}
        </p>
      )}

      {pending.map((e, i) => {
        const days = spanDays(e.start_date, e.end_date)
        const declining = decliningId === e.id
        return (
          <motion.div
            key={e.id}
            initial={reduce ? false : { opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.3, delay: Math.min(i, 6) * 0.04, ease: [0.22, 1, 0.36, 1] }}
          >
            <Card className="p-4">
              <div className="flex items-start gap-3">
                <span
                  aria-hidden
                  className="mt-1 h-9 w-[3px] shrink-0 rounded-full"
                  style={{ background: categoryColor(e.category) }}
                />
                <div className="min-w-0 flex-1">
                  <p className="text-[14.5px] font-medium text-text">{e.title}</p>
                  <p className="mt-0.5 text-[12.5px] text-text-muted">
                    {agendaLabel(e.start_date)}
                    {days > 1 && ` – ${agendaLabel(e.end_date)}`}
                    {e.category && ` · ${e.category.name}`}
                    {e.location && ` · ${e.location}`}
                  </p>
                  {e.description && (
                    <p className="mt-1.5 text-[13px] leading-relaxed text-text-muted">
                      {e.description}
                    </p>
                  )}
                </div>
              </div>

              {declining ? (
                <div className="mt-3 flex flex-col gap-2 border-t border-border pt-3">
                  <label htmlFor={`note-${e.id}`} className="text-[12.5px] font-medium text-text">
                    Why are you declining this? The author will see it.
                  </label>
                  <input
                    id={`note-${e.id}`}
                    value={note}
                    onChange={(ev) => setNote(ev.target.value)}
                    placeholder="Already on the calendar under another name"
                    className="h-9 rounded-lg border border-border bg-surface px-3 text-[13px] text-text placeholder:text-text-subtle"
                    autoFocus
                  />
                  <div className="flex justify-end gap-2">
                    <Button variant="secondary" size="sm"
                            onClick={() => { setDecliningId(null); setNote('') }}>
                      Cancel
                    </Button>
                    <Button variant="danger" size="sm" loading={review.isPending}
                            onClick={() => void decide(e.id, 'reject', note.trim() || undefined)}>
                      Decline
                    </Button>
                  </div>
                </div>
              ) : (
                <div className="mt-3 flex flex-wrap justify-end gap-2 border-t border-border pt-3">
                  <Button variant="ghost" size="sm" onClick={() => setEditing(e)}>
                    <Pencil className="h-4 w-4" aria-hidden /> Edit first
                  </Button>
                  <Button variant="secondary" size="sm" onClick={() => setDecliningId(e.id)}>
                    <X className="h-4 w-4" aria-hidden /> Decline
                  </Button>
                  <Button size="sm" loading={review.isPending}
                          onClick={() => void decide(e.id, 'approve')}>
                    <Check className="h-4 w-4" aria-hidden /> Approve
                  </Button>
                </div>
              )}
            </Card>
          </motion.div>
        )
      })}

      <EventDialog open={editing !== null} onClose={() => setEditing(null)} event={editing} />
    </div>
  )
}
