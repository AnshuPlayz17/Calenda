/**
 * Database row shapes.
 *
 * Hand-written rather than generated so the comments explaining non-obvious
 * columns live with the types. Regenerate with `supabase gen types typescript`
 * if this drifts from the migrations.
 */
import type { PlainDate } from './events'

export type EventVisibility = 'private' | 'community'
export type EventStatus = 'draft' | 'pending' | 'approved' | 'rejected'
export type EventSource = 'manual' | 'pdf_import' | 'google' | 'suggestion'
export type WorkStatus = 'not_started' | 'in_progress' | 'completed'
export type WorkPriority = 'low' | 'normal' | 'high'

export type SchoolYear = {
  id: string
  label: string
  starts_on: PlainDate
  ends_on: PlainDate
  is_current: boolean
}

export type EventCategory = {
  id: string
  slug: string
  name: string
  /** A CSS custom property name, e.g. `cat-exam`, resolved via var(). */
  color_token: string
  icon: string | null
  sort_order: number
}

export type CalendarEvent = {
  id: string
  school_year_id: string
  category_id: string | null
  series_id: string | null
  owner_id: string

  title: string
  description: string | null
  location: string | null
  priority: number

  /**
   * All-day events carry only start_date/end_date and are timezone-free.
   * Timed events additionally carry start_at/end_at as real instants.
   */
  is_all_day: boolean
  start_date: PlainDate
  end_date: PlainDate
  start_at: string | null
  end_at: string | null

  visibility: EventVisibility
  status: EventStatus
  shared_with_parents: boolean

  approved_by: string | null
  approved_at: string | null
  review_note: string | null

  source: EventSource
  content_hash: string
  created_at: string
  updated_at: string
}

/** An event joined with its category, which is how the UI almost always wants it. */
export type EventWithCategory = CalendarEvent & {
  category: EventCategory | null
}

export type NewEventInput = {
  title: string
  description?: string | null
  location?: string | null
  categoryId: string | null
  isAllDay: boolean
  startDate: PlainDate
  endDate: PlainDate
  /** `HH:mm`, local to the user. Ignored when isAllDay. */
  startTime?: string | null
  endTime?: string | null
  visibility: EventVisibility
  priority: number
}
