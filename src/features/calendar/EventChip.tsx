import { categoryColor } from '@/components/ui/CategoryDot'
import { timeLabel } from '@/lib/datetime'
import type { EventWithCategory } from '@/lib/types'
import { cn } from '@/lib/cn'

/**
 * One event inside a month cell. A left colour bar carries the category and a
 * dashed border marks a pending suggestion, so status is legible without
 * reading any text.
 */
export function EventChip({
  event,
  onSelect,
  className,
}: {
  event: EventWithCategory
  onSelect?: (e: EventWithCategory) => void
  className?: string
}) {
  const pending = event.status === 'pending'

  return (
    <button
      type="button"
      onClick={() => onSelect?.(event)}
      title={event.title}
      className={cn(
        'group flex w-full items-center gap-1.5 rounded-[4px] py-[3px] pl-1.5 pr-1',
        'text-left text-[11.5px] leading-tight transition-colors duration-150',
        'hover:bg-surface-2',
        pending && 'opacity-75',
        className,
      )}
      style={{ transitionTimingFunction: 'var(--ease-out)' }}
    >
      <span
        aria-hidden
        className={cn('h-3 w-[3px] shrink-0 rounded-full', pending && 'opacity-60')}
        style={{ background: categoryColor(event.category) }}
      />
      {!event.is_all_day && event.start_at && (
        <span className="tabular shrink-0 text-[10.5px] text-text-subtle">
          {timeLabel(event.start_at).replace(':00', '')}
        </span>
      )}
      <span className="truncate text-text">{event.title}</span>
      {pending && <span className="sr-only">(awaiting approval)</span>}
    </button>
  )
}
