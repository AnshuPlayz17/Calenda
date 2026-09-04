import { useMemo } from 'react'
import { motion, useReducedMotion } from 'motion/react'
import {
  WEEKDAY_LABELS, dayNumber, isSameMonth, monthGrid, todayPlain,
} from '@/lib/datetime'
import type { PlainDate } from '@/lib/events'
import type { EventWithCategory } from '@/lib/types'
import { EventChip } from './EventChip'
import { categoryColor } from '@/components/ui/CategoryDot'
import { cn } from '@/lib/cn'

const MAX_VISIBLE = 3

/** Buckets events onto every day they span, so a break shows across its range. */
function byDay(events: EventWithCategory[], days: PlainDate[]) {
  const map = new Map<PlainDate, EventWithCategory[]>(days.map((d) => [d, []]))
  for (const e of events) {
    for (const day of days) {
      if (day >= e.start_date && day <= e.end_date) map.get(day)!.push(e)
    }
  }
  return map
}

export function MonthView({
  anchor,
  events,
  onSelect,
  onSelectDay,
}: {
  anchor: PlainDate
  events: EventWithCategory[]
  onSelect: (e: EventWithCategory) => void
  onSelectDay: (d: PlainDate) => void
}) {
  const reduce = useReducedMotion()
  const days = useMemo(() => monthGrid(anchor), [anchor])
  const buckets = useMemo(() => byDay(events, days), [events, days])
  const today = todayPlain()

  return (
    <div className="overflow-hidden rounded-xl border border-border bg-surface">
      <div className="grid grid-cols-7 border-b border-border bg-surface-2">
        {WEEKDAY_LABELS.map((label) => (
          <div key={label} className="px-2 py-2 text-center label-caps">
            <span className="hidden sm:inline">{label}</span>
            <span className="sm:hidden">{label[0]}</span>
          </div>
        ))}
      </div>

      <motion.div
        key={anchor.slice(0, 7)}
        initial={reduce ? false : { opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 0.2 }}
        className="grid grid-cols-7"
      >
        {days.map((day, i) => {
          const dayEvents = buckets.get(day) ?? []
          const outside = !isSameMonth(day, anchor)
          const isToday = day === today
          const hidden = dayEvents.length - MAX_VISIBLE

          return (
            <div
              key={day}
              className={cn(
                'flex min-h-[64px] flex-col gap-0.5 border-b border-r border-border p-1.5',
                'sm:min-h-[112px]',
                i % 7 === 6 && 'border-r-0',
                i >= 35 && 'border-b-0',
                outside && 'bg-surface-2/45',
              )}
            >
              <button
                type="button"
                onClick={() => onSelectDay(day)}
                aria-label={`Events on ${day}`}
                className={cn(
                  'tabular mb-0.5 grid h-6 w-6 shrink-0 place-items-center self-start rounded-full',
                  'text-[12px] transition-colors duration-150 hover:bg-surface-3',
                  isToday && 'bg-brand font-semibold text-brand-contrast hover:bg-brand-hover',
                  !isToday && outside && 'text-text-subtle',
                  !isToday && !outside && 'text-text-muted',
                )}
              >
                {dayNumber(day)}
              </button>

              {/* A month cell is too narrow on a phone for a readable title --
                  it truncates to a single letter -- so small screens get
                  category dots and open the day to see the detail. */}
              <div className="flex flex-wrap gap-1 px-1 sm:hidden">
                {dayEvents.slice(0, 4).map((e) => (
                  <span
                    key={`dot-${day}-${e.id}`}
                    aria-hidden
                    className="h-1.5 w-1.5 rounded-full"
                    style={{ background: categoryColor(e.category) }}
                  />
                ))}
                {dayEvents.length > 0 && (
                  <span className="sr-only">{dayEvents.length} events</span>
                )}
              </div>

              <div className="hidden flex-col gap-0.5 sm:flex">
                {dayEvents.slice(0, MAX_VISIBLE).map((e) => (
                  <EventChip key={`${day}-${e.id}`} event={e} onSelect={onSelect} />
                ))}

                {hidden > 0 && (
                  <button
                    type="button"
                    onClick={() => onSelectDay(day)}
                    className="px-1.5 pt-0.5 text-left text-[10.5px] text-text-subtle hover:text-text"
                  >
                    {hidden} more
                  </button>
                )}
              </div>
            </div>
          )
        })}
      </motion.div>
    </div>
  )
}
