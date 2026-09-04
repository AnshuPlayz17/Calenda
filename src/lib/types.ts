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

// ------------------------------------------------------------- classes ----

export type SchoolClass = {
  id: string
  owner_id: string
  school_year_id: string
  name: string
  /** e.g. ICS3U -- the primary matcher against Google Calendar titles. */
  course_code: string | null
  teacher: string | null
  room: string | null
  color_token: string | null
  is_archived: boolean
  archived_at: string | null
  shared_with_parents: boolean
  created_at: string
  updated_at: string
}

export type NewClassInput = {
  name: string
  courseCode?: string | null
  teacher?: string | null
  room?: string | null
  colorToken?: string | null
}

export type NotebookPage = {
  id: string
  class_id: string
  owner_id: string
  parent_page_id: string | null
  title: string
  icon: string | null
  /** TipTap document. Opaque here; the editor owns its shape. */
  content: unknown
  content_text: string
  position: number
  is_archived: boolean
  shared_with_parents: boolean
  created_at: string
  updated_at: string
}

export type Assignment = {
  id: string
  class_id: string
  owner_id: string
  title: string
  description: string | null
  due_at: string | null
  due_all_day: boolean
  priority: WorkPriority
  status: WorkStatus
  estimated_minutes: number | null
  /** The calendar event this assignment generated, so it appears once. */
  event_id: string | null
  completed_at: string | null
  shared_with_parents: boolean
  created_at: string
  updated_at: string
}

export type NewAssignmentInput = {
  title: string
  description?: string | null
  /** Local date; combined with dueTime unless dueAllDay. */
  dueDate: string | null
  dueTime?: string | null
  dueAllDay: boolean
  priority: WorkPriority
  status: WorkStatus
  estimatedMinutes?: number | null
}

export type Task = {
  id: string
  owner_id: string
  class_id: string | null
  title: string
  notes: string | null
  due_at: string | null
  priority: WorkPriority
  status: WorkStatus
  completed_at: string | null
  created_at: string
  updated_at: string
}

// ------------------------------------------------------- parent sharing ----

export type LinkStatus = 'pending' | 'accepted' | 'revoked'
export type ProfileRole = 'student' | 'parent' | 'admin'

export type ParentLink = {
  id: string
  parent_id: string
  student_id: string
  status: LinkStatus
  accepted_at: string | null
  created_at: string
  /** The other person in the link, from their profile. */
  other_name: string | null
  other_role: ProfileRole
}

/** Anything that can carry a shared_with_parents flag. */
export type Shareable = 'event' | 'class' | 'notebook_page' | 'assignment'

// --------------------------------------------------------- notifications ----

export type NotifyChannel = 'email' | 'web_push' | 'sms'

export type NotificationPreferences = {
  profile_id: string
  channels: NotifyChannel[]
  digest_daily: boolean
  digest_daily_at: string
  digest_weekly: boolean
  quiet_start: string | null
  quiet_end: string | null
}

export type CategoryPreference = {
  category_id: string
  enabled: boolean
  /** Minutes before the event. 1440 = a day, 60 = an hour. */
  offsets_minutes: number[]
}

export type QueuedReminder = {
  id: string
  subject_type: string
  subject_id: string
  channel: NotifyChannel
  offset_minutes: number
  scheduled_for: string
  state: 'pending' | 'sent' | 'failed' | 'skipped'
  sent_at: string | null
  /** Filled in by the client from the subject it points at. */
  subject_title?: string
}
