import { CalendarDays, Plus } from 'lucide-react'
import { Dialog } from '@/components/ui/Dialog'
import { Button } from '@/components/ui/Button'
import { EmptyState } from '@/components/ui/EmptyState'
import { categoryColor } from '@/components/ui/CategoryDot'
import { agendaLabel, timeLabel } from '@/lib/datetime'
import { spanDays } from '@/lib/events'
import type { PlainDate } from '@/lib/events'
import type { EventWithCategory } from '@/lib/types'

/**
 * What a day actually contains. Opened by tapping a date -- previously that
 * jumped straight to creating an event, which meant a day full of events had
 * no way to be read on a phone, where cells show dots rather than titles.
 */
export function DayDialog({
  date,
  events,
  onClose,
  onSelect,
  onCreate,
}: {
  date: PlainDate | null
  events: EventWithCategory[]
  onClose: () => void
  onSelect: (e: EventWithCategory) => void
  onCreate: (d: PlainDate) => void
}) {
  const dayEvents = date
    ? events
        .filter((e) => e.start_date <= date && e.end_date >= date)
        .sort((a, b) => Number(a.is_all_day) - Number(b.is_all_day))
    : []

  return (
    <Dialog
      open={date !== null}
      onClose={onClose}
      title={date ? agendaLabel(date) : ''}
      description={
        dayEvents.length === 0
          ? 'Nothing scheduled'
          : `${dayEvents.length} ${dayEvents.length === 1 ? 'event' : 'events'}`
      }
      footer={
        <Button size="sm" onClick={() => date && onCreate(date)}>
          <Plus className="h-4 w-4" aria-hidden />
          Add event
        </Button>
      }
    >
      {dayEvents.length === 0 ? (
        <EmptyState
          icon={CalendarDays}
          title="A clear day"
          description="Nothing is scheduled. Add something and it will appear here."
        />
      ) : (
        <ul className="flex flex-col gap-1.5">
          {dayEvents.map((e) => {
            const days = spanDays(e.start_date, e.end_date)
            return (
              <li key={e.id}>
                <button
                  type="button"
                  onClick={() => onSelect(e)}
                  className="flex w-full items-start gap-3 rounded-lg border border-border px-3 py-2.5 text-left transition-colors duration-150 hover:border-border-strong hover:bg-surface-2"
                >
                  <span
                    aria-hidden
                    className="mt-0.5 h-7 w-[3px] shrink-0 rounded-full"
                    style={{ background: categoryColor(e.category) }}
                  />
                  <span className="min-w-0 flex-1">
                    <span className="block text-[13.5px] font-medium text-text">{e.title}</span>
                    {e.description && (
                      <span className="mt-0.5 block text-[12px] leading-snug text-text-muted">
                        {e.description}
                      </span>
                    )}
                  </span>
                  <span className="shrink-0 text-right text-[11.5px] tabular text-text-subtle">
                    {e.is_all_day
                      ? days > 1 ? `${days} days` : 'All day'
                      : e.start_at ? timeLabel(e.start_at) : ''}
                  </span>
                </button>
              </li>
            )
          })}
        </ul>
      )}
    </Dialog>
  )
}
