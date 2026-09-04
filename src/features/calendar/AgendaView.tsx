import { useMemo } from 'react'
import { motion, useReducedMotion } from 'motion/react'
import { CalendarDays } from 'lucide-react'
import { agendaLabel, todayPlain } from '@/lib/datetime'
import { spanDays } from '@/lib/events'
import type { PlainDate } from '@/lib/events'
import type { EventWithCategory } from '@/lib/types'
import { categoryColor } from '@/components/ui/CategoryDot'
import { EmptyState } from '@/components/ui/EmptyState'
import { timeLabel } from '@/lib/datetime'
import { cn } from '@/lib/cn'

/**
 * A reading view rather than a grid: events grouped under the day they start,
 * in order. This is the view that answers "what's coming up".
 */
export function AgendaView({
  events,
  onSelect,
}: {
  events: EventWithCategory[]
  onSelect: (e: EventWithCategory) => void
}) {
  const reduce = useReducedMotion()
  const today = todayPlain()

  const groups = useMemo(() => {
    const map = new Map<PlainDate, EventWithCategory[]>()
    for (const e of [...events].sort((a, b) => a.start_date.localeCompare(b.start_date))) {
      const list = map.get(e.start_date) ?? []
      list.push(e)
      map.set(e.start_date, list)
    }
    return [...map.entries()]
  }, [events])

  if (groups.length === 0) {
    return (
      <div className="rounded-xl border border-border bg-surface">
        <EmptyState
          icon={CalendarDays}
          title="Nothing in this range"
          description="Try a different month, or clear your filters to see everything."
        />
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-1">
      {groups.map(([day, dayEvents], gi) => (
        <motion.section
          key={day}
          initial={reduce ? false : { opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.32, delay: Math.min(gi, 8) * 0.03, ease: [0.22, 1, 0.36, 1] }}
          className="grid grid-cols-[76px_1fr] gap-3 rounded-xl px-1 py-2 sm:grid-cols-[104px_1fr] sm:gap-5"
        >
          <div className="pt-1.5">
            <p
              className={cn(
                'text-[12.5px] font-medium tabular',
                day === today ? 'text-brand' : 'text-text-muted',
              )}
            >
              {day === today ? 'Today' : agendaLabel(day)}
            </p>
          </div>

          <div className="flex flex-col gap-1.5">
            {dayEvents.map((e) => {
              const days = spanDays(e.start_date, e.end_date)
              return (
                <button
                  key={e.id}
                  type="button"
                  onClick={() => onSelect(e)}
                  className={cn(
                    'group flex items-start gap-3 rounded-lg border border-border bg-surface',
                    'px-3.5 py-2.5 text-left transition-[border-color,background-color] duration-150',
                    'hover:border-border-strong hover:bg-surface-2',
                  )}
                  style={{ transitionTimingFunction: 'var(--ease-out)' }}
                >
                  <span
                    aria-hidden
                    className="mt-[3px] h-8 w-[3px] shrink-0 rounded-full"
                    style={{ background: categoryColor(e.category) }}
                  />
                  <span className="min-w-0 flex-1">
                    <span className="flex flex-wrap items-baseline gap-x-2">
                      <span className="text-[14px] font-medium text-text">{e.title}</span>
                      {days > 1 && (
                        <span className="label-caps">{days} days</span>
                      )}
                      {e.status === 'pending' && (
                        <span className="rounded-full border border-warning px-1.5 text-[10px] font-medium uppercase tracking-wide"
                              style={{ color: 'var(--warning)', background: 'var(--warning-subtle)' }}>
                          Pending
                        </span>
                      )}
                    </span>
                    {e.description && (
                      <span className="mt-0.5 block truncate text-[12.5px] text-text-muted">
                        {e.description}
                      </span>
                    )}
                  </span>
                  <span className="shrink-0 text-[12px] tabular text-text-subtle">
                    {e.is_all_day ? 'All day' : e.start_at ? timeLabel(e.start_at) : ''}
                  </span>
                </button>
              )
            })}
          </div>
        </motion.section>
      ))}
    </div>
  )
}
