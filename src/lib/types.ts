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
/**
 * The things that carry a `shared_with_parents` column.
 *
 * NOT the database's `shareable` enum, despite the name, and the difference
 * matters. That enum is for the `shares` table -- per-person share links --
 * and adding a value to it is a migration with a documented trap attached.
 * This union only ever picks a table to flip a boolean on, so 'grade' can be
 * here while `shareable` deliberately has no 'grade' in it: a mark is not a
 * document you hand to a named person, it is either visible to a linked parent
 * or it is not.
 */
export type Shareable =
  'event' | 'class' | 'notebook_page' | 'assignment' | 'grade' | 'file'

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
  /**
   * ISO weekdays the quiet window applies to, 1 = Monday .. 7 = Sunday.
   * Empty means every day, so a window set before days existed keeps working.
   */
  quiet_days: number[]
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

// ===================================================== added 2026-09-09 ====

// ---------------------------------------------------------- timetable -----

/**
 * One slot in the week when a class meets.
 *
 * Exactly one of `day_of_week` and `cycle_day` is set -- the database enforces
 * that, so the union is real rather than a convention. `day_of_week` is 0 for
 * Sunday, matching `Date.prototype.getDay()`, so nothing between Postgres and
 * the grid has to convert and nothing can be off by one.
 */
export type ClassMeeting = {
  id: string
  class_id: string
  owner_id: string
  day_of_week: number | null
  cycle_day: number | null
  /** 'HH:MM:SS' as Postgres returns a `time`. */
  starts_at: string
  ends_at: string
  /** Overrides the class's room for this slot only. */
  room: string | null
  /** The school's own word for the slot: "Period 3", "Block A". */
  label: string | null
  created_at: string
  updated_at: string
}

export type NewMeetingInput = {
  dayOfWeek?: number | null
  cycleDay?: number | null
  startsAt: string
  endsAt: string
  room?: string | null
  label?: string | null
}

/** A meeting with the class it belongs to, which is how it is always shown. */
export type MeetingWithClass = ClassMeeting & {
  className: string
  courseCode: string | null
  classRoom: string | null
  colorToken: string | null
}

// ------------------------------------------------------------- grades -----

/**
 * A mark.
 *
 * `score` and `out_of` stay separate on purpose: 17/20 is more information
 * than 85%, and the percentage is computed for display and never stored.
 * `letter` sits alongside them because some report cards give only "Level 3",
 * and inventing a number for that would be making data up. Any of the three
 * may be null -- an unmarked row is a real and useful thing.
 */
export type Grade = {
  id: string
  owner_id: string
  class_id: string
  assignment_id: string | null
  title: string
  score: number | null
  out_of: number | null
  letter: string | null
  weight: number
  category: string | null
  term: string | null
  recorded_on: string | null
  notes: string | null
  /** 'manual' or 'report_card'. Shown, because they are not equally trusted. */
  source: 'manual' | 'report_card'
  shared_with_parents: boolean
  created_at: string
  updated_at: string
}

export type NewGradeInput = {
  title: string
  score?: number | null
  outOf?: number | null
  letter?: string | null
  weight?: number
  category?: string | null
  term?: string | null
  recordedOn?: string | null
  notes?: string | null
  assignmentId?: string | null
}

// ------------------------------------------------------- report cards -----

export type ReportCardStatus =
  'uploaded' | 'decoding' | 'decoded' | 'failed' | 'applied'

export type ReportCard = {
  id: string
  owner_id: string
  school_year_id: string | null
  storage_path: string
  original_name: string | null
  mime_type: string | null
  byte_size: number | null
  term: string | null
  status: ReportCardStatus
  error: string | null
  decode_consent_at: string | null
  decoded_at: string | null
  applied_at: string | null
  created_at: string
  updated_at: string
}

/**
 * One line a model read off a report card, before anybody has agreed with it.
 *
 * `decision` starts 'pending' for every line however confident the model was.
 * Nothing here becomes a `Grade` until the student says so.
 */
export type ReportCardLine = {
  id: string
  report_card_id: string
  owner_id: string
  course_name: string | null
  course_code: string | null
  teacher: string | null
  mark: number | null
  out_of: number | null
  letter: string | null
  term: string | null
  remark: string | null
  /** 0..1, the model's own claim about itself. Shown; never acted on alone. */
  confidence: number | null
  raw: unknown
  matched_class_id: string | null
  decision: 'pending' | 'accept' | 'skip'
  /** Set once accepted, which is what makes applying twice a no-op. */
  grade_id: string | null
  created_at: string
  updated_at: string
}

// --------------------------------------------------------- attachments ----

export type Attachment = {
  id: string
  class_id: string
  owner_id: string
  storage_path: string
  filename: string
  mime_type: string
  size_bytes: number
  shared_with_parents: boolean
  created_at: string
}

// ---------------------------------------------------------------- chat ----

export type ChatThread = {
  id: string
  owner_id: string
  title: string
  created_at: string
  updated_at: string
}

/** What an answer was based on, so the reader can go and check it. */
export type ChatSource = {
  kind: 'event' | 'assignment' | 'task' | 'note' | 'class' | 'grade'
  id: string
  title: string
}

export type ChatMessage = {
  id: string
  thread_id: string
  owner_id: string
  role: 'user' | 'assistant'
  content: string
  sources: ChatSource[]
  error: string | null
  created_at: string
}

// ------------------------------------------------------------ teaching ----

/**
 * A class as the teacher of it sees it: one row that many students join.
 *
 * Deliberately not a `SchoolClass`. That is a student's own row -- their
 * notebook, their marks, their name for the subject -- and folding the two
 * together would put a teacher's roster inside a student's record or a
 * student's notes inside a teacher's.
 */
export type TeachingGroup = {
  id: string
  owner_id: string
  school_year_id: string
  name: string
  subject: string | null
  room: string | null
  color_token: string | null
  /** Null means closed: members stay, nobody new can join. */
  join_code: string | null
  is_archived: boolean
  created_at: string
  /** Current members. Counted on read rather than stored, so it cannot drift. */
  member_count: number
}

/** One student in a teacher's roster. */
export type GroupMember = {
  id: string
  group_id: string
  student_id: string
  student_name: string | null
  /** The student's own class they linked, if any. Only they can set it. */
  class_id: string | null
  /** Off until the student turns it on, for this group only. */
  share_progress: boolean
  joined_at: string
}

/** A membership as the student sees it. */
export type StudentGroup = {
  id: string
  group_id: string
  group_name: string
  subject: string | null
  teacher_name: string | null
  class_id: string | null
  share_progress: boolean
  joined_at: string
}

export type GroupAnnouncement = {
  id: string
  group_id: string
  group_name: string
  body: string
  /** Whether reminders were queued. A fact about what happened, not a plan. */
  notified: boolean
  created_at: string
}

/**
 * What a teacher can see of one student's work, which is only ever the marks
 * for the class that student linked and only while they are sharing.
 *
 * `marks` is the count the average was computed from, so the screen can show
 * its working rather than a bare number -- the same rule the student's own
 * grades tab follows.
 */
export type GroupProgress = {
  student_id: string
  student_name: string | null
  sharing: boolean
  marks: number
  /** Percent, or null when nothing is marked yet. Never zero for "unmarked". */
  average: number | null
}
