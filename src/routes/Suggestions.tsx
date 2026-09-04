import { useState } from 'react'
import { motion, useReducedMotion } from 'motion/react'
import { Lightbulb, Plus } from 'lucide-react'
import { Card } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'
import { EmptyState } from '@/components/ui/EmptyState'
import { ErrorState } from '@/components/ui/ErrorState'
import { Skeleton } from '@/components/ui/Skeleton'
import { StatusBadge } from '@/components/ui/StatusBadge'
import { categoryColor } from '@/components/ui/CategoryDot'
import { EventDialog } from '@/features/events/EventDialog'
import { useMySuggestions } from '@/features/events/queries'
import { useSchoolYear } from '@/features/schoolYear/SchoolYearProvider'
import { agendaLabel } from '@/lib/datetime'

/**
 * What the author sees after suggesting a community event: where each one got
 * to, and why, if it was declined.
 */
/**
 * Waiting, settled, turned down -- in that order, because the only one you can
 * still do anything about is the first.
 */
const GROUPS: Array<{ status: 'pending' | 'approved' | 'rejected'; heading: string; note: string }> = [
  { status: 'pending',  heading: 'Waiting for review', note: 'Only you can see these' },
  { status: 'approved', heading: 'On the shared calendar', note: 'Everyone can see these' },
  { status: 'rejected', heading: 'Not added',            note: 'With the reason given' },
]

export function SuggestionsPage() {
  const { current } = useSchoolYear()
  const { data: suggestions = [], isLoading, isError, refetch, isFetching } =
    useMySuggestions(current?.id)
  const [dialogOpen, setDialogOpen] = useState(false)
  const reduce = useReducedMotion()

  return (
    <div className="flex flex-col gap-6">
      <motion.header
        initial={reduce ? false : { opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4, ease: [0.22, 1, 0.36, 1] }}
        className="flex flex-wrap items-start justify-between gap-3"
      >
        <div>
          <h1 className="font-display text-[30px] font-medium tracking-tight">Suggestions</h1>
          <p className="mt-1.5 max-w-[56ch] text-[15px] text-text-muted">
            Events you've put forward for everyone. An admin reviews each one before it
            appears on the shared calendar.
          </p>
        </div>
        <Button size="sm" onClick={() => setDialogOpen(true)}>
          <Plus className="h-4 w-4" aria-hidden />
          Suggest an event
        </Button>
      </motion.header>

      {isLoading ? (
        <div className="flex flex-col gap-2">
          <Skeleton className="h-16 w-full rounded-xl" />
          <Skeleton className="h-16 w-full rounded-xl" />
        </div>
      ) : isError ? (
        <ErrorState what="your suggestions" retrying={isFetching} onRetry={() => void refetch()} />
      ) : suggestions.length === 0 ? (
        <Card>
          <EmptyState
            icon={Lightbulb}
            title="No suggestions yet"
            description="Know about a club meeting, game or performance the whole school would want? Put it forward and track it here."
            action={
              <Button size="sm" variant="secondary" onClick={() => setDialogOpen(true)}>
                Suggest an event
              </Button>
            }
          />
        </Card>
      ) : (
        <div className="flex flex-col gap-7">
          {GROUPS.map(({ status, heading, note }) => {
            const inGroup = suggestions.filter((e) => e.status === status)
            if (inGroup.length === 0) return null
            return (
              <section key={status}>
                <div className="mb-2.5 flex items-baseline gap-2.5 border-b border-border pb-2">
                  <h2 className="text-[15px] font-medium text-text">{heading}</h2>
                  <span className="tabular text-[12.5px] text-text-subtle">{inGroup.length}</span>
                  <p className="ml-auto text-[12.5px] text-text-muted">{note}</p>
                </div>
                <ul className="flex flex-col gap-2">
                  {inGroup.map((e, i) => (
                    <motion.li
                      key={e.id}
                      initial={reduce ? false : { opacity: 0, y: 8 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{
                        duration: 0.32,
                        delay: Math.min(i, 8) * 0.04,
                        ease: [0.22, 1, 0.36, 1],
                      }}
                    >
              <Card className="flex items-start gap-3 px-4 py-3.5">
                <span
                  aria-hidden
                  className="mt-1 h-8 w-[3px] shrink-0 rounded-full"
                  style={{ background: categoryColor(e.category) }}
                />
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="text-[14px] font-medium text-text">{e.title}</p>
                    <StatusBadge status={e.status} />
                  </div>
                  <p className="mt-0.5 text-[12.5px] text-text-muted">
                    {agendaLabel(e.start_date)}
                    {e.description ? ` · ${e.description}` : ''}
                  </p>
                  {e.status === 'rejected' && e.review_note && (
                    <p className="mt-2 rounded-lg border px-3 py-2 text-[12.5px]"
                       style={{
                         borderColor: 'var(--danger-border)',
                         background: 'var(--danger-subtle)',
                         color: 'var(--danger)',
                       }}>
                      <strong className="font-semibold">Why: </strong>{e.review_note}
                    </p>
                  )}
                  {e.status === 'pending' && (
                    <p className="mt-1 text-[12px] text-text-subtle">
                      Waiting for review. Only you can see it until it's approved.
                    </p>
                  )}
                </div>
              </Card>
                    </motion.li>
                  ))}
                </ul>
              </section>
            )
          })}
        </div>
      )}

      <EventDialog
        open={dialogOpen}
        onClose={() => setDialogOpen(false)}
        event={null}
        defaultVisibility="community"
      />
    </div>
  )
}
