/**
 * The app talks to this interface, never to Supabase directly.
 *
 * Two implementations exist: the real Supabase one, and an in-memory preview
 * seeded with the actual 2026-27 school calendar. The preview is selected only
 * when Supabase is unconfigured, so the app is usable and demonstrable before
 * a project exists -- and the UI never learns which one it is talking to.
 */
import type {
  Assignment, CalendarEvent, EventCategory, EventWithCategory, NewAssignmentInput,
  CategoryPreference, NewClassInput, NewEventInput, NotebookPage, NotificationPreferences,
  ParentLink, QueuedReminder, SchoolClass, SchoolYear, Shareable, Task,
} from '@/lib/types'
import type { PlainDate } from '@/lib/events'

export type EventFilters = {
  schoolYearId: string
  /** Inclusive date window. Events overlapping it at all are returned. */
  from: PlainDate
  to: PlainDate
  categoryIds?: string[]
  /** 'all' | 'community' | 'personal' */
  scope?: 'all' | 'community' | 'personal'
  /**
   * Where the events came from: the school calendar PDF, your own Google
   * calendar, a suggestion, or typed in by hand. Empty or absent means all.
   */
  sources?: Array<'manual' | 'pdf_import' | 'google' | 'suggestion'>
  search?: string
}

export type ReviewAction = 'approve' | 'reject'

export type ImportOptions = {
  /**
   * Google events keep their origin's privacy: they belong to the person who
   * imported them and are never published to the community. Only an admin
   * importing the school calendar creates community events.
   */
  visibility: 'private' | 'community'
  source: 'pdf_import' | 'google'
}

/** A resolved import row, ready to be written. */
export type ImportWrite = {
  title: string
  description: string | null
  startDate: PlainDate
  endDate: PlainDate
  categorySlug: string
  /** Set when replacing or merging into an event that already exists. */
  replacesEventId?: string
}

export interface DataSource {
  readonly kind: 'supabase' | 'preview'
  listSchoolYears(): Promise<SchoolYear[]>
  listCategories(): Promise<EventCategory[]>
  listEvents(filters: EventFilters): Promise<EventWithCategory[]>
  createEvent(input: NewEventInput, schoolYearId: string): Promise<CalendarEvent>
  updateEvent(id: string, input: NewEventInput): Promise<CalendarEvent>
  deleteEvent(id: string): Promise<void>

  /** Community events this user submitted, in any status. */
  listMySuggestions(schoolYearId: string): Promise<EventWithCategory[]>
  /** Everything awaiting review. Admin only -- RLS enforces that. */
  listPendingReview(schoolYearId: string): Promise<EventWithCategory[]>
  reviewEvent(id: string, action: ReviewAction, note?: string): Promise<void>
  /** Everything already in this school year, for duplicate comparison. */
  listAllForYear(schoolYearId: string): Promise<EventWithCategory[]>
  importEvents(
    writes: ImportWrite[],
    schoolYearId: string,
    options: ImportOptions,
  ): Promise<number>

  // ------------------------------------------------------------ classes --

  listClasses(schoolYearId: string, includeArchived?: boolean): Promise<SchoolClass[]>
  getClass(id: string): Promise<SchoolClass | null>
  createClass(input: NewClassInput, schoolYearId: string): Promise<SchoolClass>
  updateClass(id: string, input: NewClassInput): Promise<SchoolClass>
  setClassArchived(id: string, archived: boolean): Promise<void>
  deleteClass(id: string): Promise<void>

  // ----------------------------------------------------------- notebook --

  listPages(classId: string): Promise<NotebookPage[]>
  createPage(classId: string, parentId: string | null, title?: string): Promise<NotebookPage>
  updatePage(
    id: string,
    patch: { title?: string; content?: unknown; contentText?: string },
  ): Promise<void>
  deletePage(id: string): Promise<void>
  /** Most recently edited pages across every class, for the dashboard. */
  recentPages(limit: number): Promise<Array<NotebookPage & { className: string }>>

  // -------------------------------------------------------- assignments --

  listAssignments(classId: string): Promise<Assignment[]>
  /** Everything due across all classes, for the dashboard and calendar. */
  listUpcomingAssignments(schoolYearId: string, limit: number):
    Promise<Array<Assignment & { className: string }>>
  createAssignment(classId: string, input: NewAssignmentInput): Promise<Assignment>
  updateAssignment(id: string, input: NewAssignmentInput): Promise<Assignment>
  setAssignmentStatus(id: string, status: Assignment['status']): Promise<void>
  deleteAssignment(id: string): Promise<void>

  // -------------------------------------------------------------- tasks --

  listTasks(classId: string): Promise<Task[]>
  createTask(classId: string | null, title: string): Promise<Task>
  toggleTask(id: string, done: boolean): Promise<void>
  deleteTask(id: string): Promise<void>

  // ---------------------------------------------------- parent sharing --

  /** Links in both directions: people I parent, and people who parent me. */
  listParentLinks(): Promise<ParentLink[]>
  /** Returns a code to hand to a parent. */
  createParentInvite(): Promise<string>
  /** Redeems a code, linking the caller as a parent. Returns the student's name. */
  redeemParentInvite(code: string): Promise<string>
  revokeParentLink(id: string): Promise<void>
  /** Turns parent visibility on or off for one resource. */
  setSharedWithParents(kind: Shareable, id: string, shared: boolean): Promise<void>

  // ------------------------------------------------------ notifications --

  getNotificationPreferences(): Promise<{
    prefs: NotificationPreferences
    categories: CategoryPreference[]
  }>
  updateNotificationPreferences(patch: Partial<NotificationPreferences>): Promise<void>
  updateCategoryPreference(
    categoryId: string,
    patch: { enabled?: boolean; offsets?: number[] },
  ): Promise<void>
  /** Reminders already queued, so a person can see what is coming. */
  listQueuedReminders(limit: number): Promise<QueuedReminder[]>
  savePushSubscription(sub: PushSubscriptionJSON): Promise<void>
  removePushSubscription(endpoint: string): Promise<void>

  /**
   * Empties the calendar. Present only on the preview source, so the first
   * import -- including the Winter Break merge decision -- can be tried out.
   * Deliberately absent from the Supabase source: there is no "delete
   * everything" button in a real deployment.
   */
  clearAll?(schoolYearId: string): Promise<void>
}

/** Applies the filters that both implementations share, in one place. */
export function matchesFilters(e: EventWithCategory, f: EventFilters): boolean {
  // Overlap, not containment: a break spanning the window edge still shows.
  if (e.start_date > f.to || e.end_date < f.from) return false
  if (f.categoryIds?.length && (!e.category_id || !f.categoryIds.includes(e.category_id))) {
    return false
  }
  if (f.scope === 'community' && e.visibility !== 'community') return false
  if (f.scope === 'personal' && e.visibility !== 'private') return false
  if (f.sources?.length && !f.sources.includes(e.source)) return false
  if (f.search) {
    const q = f.search.toLowerCase()
    const haystack = `${e.title} ${e.description ?? ''} ${e.location ?? ''}`.toLowerCase()
    if (!haystack.includes(q)) return false
  }
  return true
}
