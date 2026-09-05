import { useState } from 'react'
import { motion, useReducedMotion } from 'motion/react'
import { CheckCircle2, Clock3, Lightbulb, Plus, XCircle } from 'lucide-react'
import { Card } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'
import { EmptyState } from '@/components/ui/EmptyState'
import { ErrorState } from '@/components/ui/ErrorState'
import { Skeleton } from '@/components/ui/Skeleton'
import { categoryColor } from '@/components/ui/CategoryDot'
import { EventDialog } from '@/features/events/EventDialog'
import { useMySuggestions } from '@/features/events/queries'
import { useSchoolYear } from '@/features/schoolYear/SchoolYearProvider'
import { agendaLabel } from '@/lib/datetime'
import { spanDays } from '@/lib/events'
import type { EventWithCategory } from '@/lib/types'
import { cn } from '@/lib/cn'

/**
 * What the author sees after suggesting a community event: where each one got
 * to, and why, if it was declined.
 *
 * Waiting first, because it is the only group you can still do anything about.
 */
const GROUPS = [
  {
    status: 'pending' as const,
    heading: 'Waiting for review',
    note: 'Only you can see these',
    Icon: Clock3,
    tone: 'warning',
  },
  {
    status: 'approved' as const,
    heading: 'On the shared calendar',
    note: 'Everyone can see these',
    Icon: CheckCircle2,
    tone: 'success',
  },
  {
    status: 'rejected' as const,
    heading: 'Not added',
    note: 'With the reason given',
    Icon: XCircle,
    tone: 'danger',
  },
]

export function SuggestionsPage() {
  const { current } = useSchoolYear()
  const { data: suggestions = [], isLoading, isError, refetch, isFetching } =
    useMySuggestions(current?.id)
  const [dialogOpen, setDialogOpen] = useState(false)
  const reduce = useReducedMotion()

  const rise = (i: number) =>
    reduce ? {} : {
      initial: { opacity: 0, y: 12 },
      animate: { opacity: 1, y: 0 },
      transition: { duration: 0.4, delay: i * 0.06, ease: [0.22, 1, 0.36, 1] as const },
    }

  const countOf = (s: string) => suggestions.filter((e) => e.status === s).length

  return (
    <div className="flex flex-col gap-6">
      <motion.header {...rise(0)} className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="font-display text-[30px] font-medium tracking-tight">Suggestions</h1>
          <p className="mt-1.5 max-w-[56ch] text-[15px] text-text-muted">
            Events you've put forward for everyone. An admin reviews each one before it
            reaches the shared calendar.
          </p>
        </div>
        <Button size="sm" onClick={() => setDialogOpen(true)}>
          <Plus className="h-4 w-4" aria-hidden />
          Suggest an event
        </Button>
      </motion.header>

      {isLoading ? (
        <div className="grid gap-3 sm:grid-cols-3">
          <Skeleton className="h-20 rounded-xl" />
          <Skeleton className="h-20 rounded-xl" />
          <Skeleton className="h-20 rounded-xl" />
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
        <>
          {/* Where everything stands, before any of the detail. */}
          <motion.div {...rise(1)} className="grid gap-3 sm:grid-cols-3">
            {GROUPS.map(({ status, heading, Icon, tone }) => (
              <div key={status} className="rounded-xl border border-border bg-surface px-4 py-3.5">
                <p className="label-caps flex items-center gap-1.5">
                  <Icon
                    className="h-3.5 w-3.5"
                    style={{ color: `var(--${tone})` }}
                    aria-hidden
                  />
                  {heading}
                </p>
                <p className="tabular mt-1 text-[24px] font-medium leading-none tracking-tight text-text">
                  {countOf(status)}
                </p>
              </div>
            ))}
          </motion.div>

          <div className="flex flex-col gap-7">
            {GROUPS.map(({ status, heading, note, tone }, groupIndex) => {
              const inGroup = suggestions.filter((e) => e.status === status)
              if (inGroup.length === 0) return null
              return (
                <motion.section key={status} {...rise(2 + groupIndex)}>
                  <div className="mb-2.5 flex items-baseline gap-2.5 border-b border-border pb-2">
                    <h2 className="text-[15px] font-medium text-text">{heading}</h2>
                    <span className="tabular text-[12.5px] text-text-subtle">{inGroup.length}</span>
                    <p className="ml-auto text-[12.5px] text-text-muted">{note}</p>
                  </div>

                  <div className="grid gap-2.5 sm:grid-cols-2 lg:grid-cols-3">
                    {inGroup.map((e) => (
                      <SuggestionCard key={e.id} event={e} tone={tone} />
                    ))}
                  </div>
                </motion.section>
              )
            })}
          </div>
        </>
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

function SuggestionCard({ event, tone }: { event: EventWithCategory; tone: string }) {
  const days = spanDays(event.start_date, event.end_date)

  return (
    <div className="flex flex-col overflow-hidden rounded-xl border border-border bg-surface">
      {/* A stripe rather than a badge: the status is the card's identity, and
          a colour along the edge says it without spending a line of text. */}
      <span aria-hidden className="h-1 w-full" style={{ background: `var(--${tone})` }} />

      <div className="flex flex-1 flex-col gap-2 p-3.5">
        <div className="flex items-start gap-2.5">
          <span
            aria-hidden
            className="mt-1 h-6 w-[3px] shrink-0 rounded-full"
            style={{ background: categoryColor(event.category) }}
          />
          <div className="min-w-0 flex-1">
            <p className="line-clamp-2 text-[13.5px] font-medium leading-snug text-text">
              {event.title}
            </p>
            <p className="tabular mt-1 text-[12px] text-text-muted">
              {agendaLabel(event.start_date)}
              {days > 1 && ` · ${days} days`}
            </p>
          </div>
        </div>

        {event.description && (
          <p className="line-clamp-2 text-[12.5px] leading-relaxed text-text-muted">
            {event.description}
          </p>
        )}

        {event.status === 'rejected' && event.review_note && (
          <p
            className={cn(
              'mt-auto rounded-lg border px-2.5 py-2 text-[12px] leading-relaxed',
            )}
            style={{
              borderColor: 'var(--danger-border)',
              background: 'var(--danger-subtle)',
              color: 'var(--danger)',
            }}
          >
            <strong className="font-semibold">Why: </strong>
            {event.review_note}
          </p>
        )}

        {event.status === 'pending' && (
          <p className="mt-auto text-[11.5px] text-text-subtle">
            Waiting for review — nobody else can see it yet.
          </p>
        )}
      </div>
    </div>
  )
}
