import { useMemo } from 'react'
import { WEEKDAY_LABELS, dayNumber, todayPlain, weekGrid } from '@/lib/datetime'
import type { PlainDate } from '@/lib/events'
import type { EventWithCategory } from '@/lib/types'
import { EventChip } from './EventChip'
import { cn } from '@/lib/cn'

/**
 * Seven columns, one per day. Deliberately not an hour grid: 48 of the 49
 * school events are all-day, so an hour grid would be almost entirely empty.
 */
export function WeekView({
  anchor,
  events,
  onSelect,
}: {
  anchor: PlainDate
  events: EventWithCategory[]
  onSelect: (e: EventWithCategory) => void
}) {
  const days = useMemo(() => weekGrid(anchor), [anchor])
  const today = todayPlain()

  const buckets = useMemo(() => {
    const map = new Map<PlainDate, EventWithCategory[]>(days.map((d) => [d, []]))
    for (const e of events) {
      for (const day of days) {
        if (day >= e.start_date && day <= e.end_date) map.get(day)!.push(e)
      }
    }
    return map
  }, [events, days])

  return (
    <div className="overflow-x-auto rounded-xl border border-border bg-surface">
      <div className="grid min-w-[680px] grid-cols-7">
        {days.map((day, i) => {
          const isToday = day === today
          return (
            <div
              key={day}
              className={cn(
                'flex min-h-[320px] flex-col gap-1 border-r border-border p-2',
                i === 6 && 'border-r-0',
                isToday && 'bg-brand-subtle/40',
              )}
            >
              <div className="mb-1 flex items-baseline gap-1.5 px-1">
                <span className="label-caps">{WEEKDAY_LABELS[i]}</span>
                <span
                  className={cn(
                    'tabular text-[15px] font-medium',
                    isToday ? 'text-brand' : 'text-text',
                  )}
                >
                  {dayNumber(day)}
                </span>
              </div>
              {(buckets.get(day) ?? []).map((e) => (
                <EventChip key={`${day}-${e.id}`} event={e} onSelect={onSelect} />
              ))}
            </div>
          )
        })}
      </div>
    </div>
  )
}
