import type { Assignment, EventCategory, EventWithCategory } from '@/lib/types'
import type { PlainDate } from '@/lib/events'

/**
 * An assignment rendered as a calendar entry.
 *
 * Deliberately DERIVED at read time rather than materialised as a second row
 * in `events`. The spec asks that an assignment appear on the calendar without
 * being entered twice; writing a mirror row would satisfy that but then needs
 * keeping in step on every edit, status change and delete, and drifts the
 * moment one of those fails. Deriving it cannot drift, needs no sync code, and
 * leaves no orphans behind. (`assignments.event_id` therefore stays unused, as
 * does `google_event_map` -- both remain for a future that wants them.)
 */
export type CalendarItem = EventWithCategory & {
  /** Set when this row is a derived assignment rather than a real event. */
  assignmentId?: string
  assignmentStatus?: Assignment['status']
}

/** The local calendar day an instant falls on, without timezone drift. */
function localDay(iso: string): PlainDate {
  const d = new Date(iso)
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}` as PlainDate
}

export function assignmentToItem(
  assignment: Assignment & { className?: string },
  category: EventCategory | null,
): CalendarItem | null {
  if (!assignment.due_at) return null
  const day = localDay(assignment.due_at)

  return {
    id: `assignment:${assignment.id}`,
    school_year_id: '',
    category_id: category?.id ?? null,
    series_id: null,
    owner_id: assignment.owner_id,
    title: assignment.title,
    description: assignment.className ?? null,
    location: null,
    priority: assignment.priority === 'high' ? 2 : assignment.priority === 'low' ? 0 : 1,
    // Shown on its due day. An all-day deadline means end of that day, so it
    // still belongs to that day rather than spilling into the next.
    is_all_day: assignment.due_all_day,
    start_date: day,
    end_date: day,
    start_at: assignment.due_all_day ? null : assignment.due_at,
    end_at: assignment.due_all_day ? null : assignment.due_at,
    visibility: 'private',
    status: 'approved',
    shared_with_parents: assignment.shared_with_parents,
    approved_by: null,
    approved_at: null,
    review_note: null,
    source: 'manual',
    content_hash: '',
    created_at: assignment.created_at,
    updated_at: assignment.updated_at,
    category,
    assignmentId: assignment.id,
    assignmentStatus: assignment.status,
  }
}

/** Merges real events with derived assignments, in date order. */
export function mergeCalendarItems(
  events: EventWithCategory[],
  assignments: Array<Assignment & { className?: string }>,
  assignmentCategory: EventCategory | null,
): CalendarItem[] {
  const derived = assignments
    .map((a) => assignmentToItem(a, assignmentCategory))
    .filter((x): x is CalendarItem => x !== null)

  return [...events, ...derived].sort(
    (a, b) => a.start_date.localeCompare(b.start_date) || a.title.localeCompare(b.title),
  )
}
