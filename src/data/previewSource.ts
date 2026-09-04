/**
 * In-memory data source, seeded with the real 2026-27 school calendar.
 *
 * Used only when Supabase is not configured, so the app is fully usable before
 * a project exists. Edits live for the session and are not persisted -- the UI
 * says so, rather than pretending they are saved.
 */
import type {
  Assignment, EventCategory, EventWithCategory, NewAssignmentInput, NewEventInput,
  CategoryPreference, NotebookPage, NotificationPreferences, ParentLink, QueuedReminder,
  SchoolClass, SchoolYear, Shareable, Task,
} from '@/lib/types'
import { contentHash } from '@/lib/events'
import { toInstant } from '@/lib/datetime'
import { SCHOOL_YEAR_2026_27, schoolEvents2026_27 } from './schoolCalendar'
import {
  matchesFilters, type DataSource, type EventFilters, type ImportOptions,
  type ImportWrite, type ReviewAction,
} from './source'

const YEAR_ID = 'preview-year-2026-27'
const OWNER_ID = 'preview-owner'

// Mirrors the categories seeded in 0003_seed.sql, so colours and names match
// exactly what the real database will serve.
const CATEGORY_DEFS: Array<[string, string, string]> = [
  ['academic', 'Academic', 'cat-academic'],
  ['school', 'School', 'cat-school'],
  ['pa-day', 'PA Day', 'cat-pa-day'],
  ['holiday', 'Holiday', 'cat-holiday'],
  ['exam', 'Exam', 'cat-exam'],
  ['assignment', 'Assignment', 'cat-assignment'],
  ['sports', 'Sports', 'cat-sports'],
  ['clubs', 'Clubs', 'cat-clubs'],
  ['trips', 'Trips', 'cat-trips'],
  ['performance', 'Performance', 'cat-performance'],
  ['family', 'Parent/Family', 'cat-family'],
  ['personal', 'Personal', 'cat-personal'],
  ['other', 'Other', 'cat-other'],
]

const categories: EventCategory[] = CATEGORY_DEFS.map(([slug, name, token], i) => ({
  id: `cat-${slug}`,
  slug,
  name,
  color_token: token,
  icon: null,
  sort_order: (i + 1) * 10,
}))

const bySlug = new Map(categories.map((c) => [c.slug, c]))

const schoolYear: SchoolYear = {
  id: YEAR_ID,
  label: SCHOOL_YEAR_2026_27.label,
  starts_on: SCHOOL_YEAR_2026_27.startsOn,
  ends_on: SCHOOL_YEAR_2026_27.endsOn,
  is_current: true,
}

let counter = 0
const nextId = () => `preview-event-${++counter}`

function seed(): EventWithCategory[] {
  const now = new Date().toISOString()
  return schoolEvents2026_27.map((e) => {
    const category = bySlug.get(e.category) ?? null
    return {
      id: nextId(),
      school_year_id: YEAR_ID,
      category_id: category?.id ?? null,
      series_id: null,
      owner_id: OWNER_ID,
      title: e.title,
      description: e.description,
      location: null,
      priority: 0,
      is_all_day: true,
      start_date: e.startDate,
      end_date: e.endDate,
      start_at: null,
      end_at: null,
      visibility: 'community',
      status: 'approved',
      shared_with_parents: false,
      approved_by: null,
      approved_at: now,
      review_note: null,
      source: 'pdf_import',
      content_hash: contentHash(e.title, e.startDate),
      created_at: now,
      updated_at: now,
      category,
    }
  })
}

const store: EventWithCategory[] = seed()

// Class-side stores. Seeded with two classes so the preview shows a real
// workspace rather than an empty shell.
const classes: SchoolClass[] = []
const pages: NotebookPage[] = []
const assignments: Assignment[] = []
const tasks: Task[] = []
const parentLinks: ParentLink[] = []
const previewInvites = new Set<string>()

const previewPrefs: NotificationPreferences = {
  profile_id: OWNER_ID,
  channels: ['email'],
  digest_daily: false,
  digest_daily_at: '07:00',
  digest_weekly: false,
  quiet_start: null,
  quiet_end: null,
}

// One row per seeded category, matching ensure_notification_defaults().
const previewCategoryPrefs: CategoryPreference[] = categories.map((c) => ({
  category_id: c.id,
  enabled: true,
  offsets_minutes: [1440],
}))

function assignmentFields(input: NewAssignmentInput) {
  return {
    title: input.title.trim(),
    description: input.description?.trim() || null,
    due_at: previewDueInstant(input),
    due_all_day: input.dueAllDay,
    priority: input.priority,
    status: input.status,
    estimated_minutes: input.estimatedMinutes ?? null,
    completed_at: input.status === 'completed' ? new Date().toISOString() : null,
  }
}

/** An all-day deadline is the END of that day, not midnight at its start. */
function previewDueInstant(input: NewAssignmentInput): string | null {
  if (!input.dueDate) return null
  const [y, m, d] = input.dueDate.split('-').map(Number)
  if (!y || !m || !d) return null
  if (input.dueAllDay) return new Date(y, m - 1, d, 23, 59).toISOString()
  const [hh, mm] = (input.dueTime ?? '23:59').split(':').map(Number)
  return new Date(y, m - 1, d, hh ?? 23, mm ?? 59).toISOString()
}

function seedClasses() {
  const now = new Date().toISOString()
  const make = (name: string, code: string, teacher: string): SchoolClass => ({
    id: nextId(), owner_id: OWNER_ID, school_year_id: YEAR_ID, name,
    course_code: code, teacher, room: null, color_token: null,
    is_archived: false, archived_at: null, shared_with_parents: false,
    created_at: now, updated_at: now,
  })
  classes.push(make('Computer Science', 'ICS3U', 'Mr. Chen'))
  classes.push(make('Functions', 'MCR3U', 'Ms. Patel'))
}
seedClasses()

function fromInput(input: NewEventInput, id: string, schoolYearId: string): EventWithCategory {
  const now = new Date().toISOString()
  return {
    id,
    school_year_id: schoolYearId,
    category_id: input.categoryId,
    series_id: null,
    owner_id: OWNER_ID,
    title: input.title,
    description: input.description ?? null,
    location: input.location ?? null,
    priority: input.priority,
    is_all_day: input.isAllDay,
    start_date: input.startDate,
    end_date: input.endDate,
    start_at: input.isAllDay || !input.startTime
      ? null : toInstant(input.startDate, input.startTime),
    end_at: input.isAllDay || !input.endTime
      ? null : toInstant(input.endDate, input.endTime),
    visibility: input.visibility,
    status: input.visibility === 'community' ? 'pending' : 'approved',
    shared_with_parents: false,
    approved_by: null,
    approved_at: null,
    review_note: null,
    source: 'manual',
    content_hash: contentHash(input.title, input.startDate),
    created_at: now,
    updated_at: now,
    category: categories.find((c) => c.id === input.categoryId) ?? null,
  }
}

export const previewSource: DataSource = {
  kind: 'preview',

  async listSchoolYears() {
    return [schoolYear]
  },

  async listCategories() {
    return categories
  },

  async listEvents(filters: EventFilters) {
    return store
      .filter((e) => e.school_year_id === filters.schoolYearId)
      .filter((e) => matchesFilters(e, filters))
      .sort((a, b) => a.start_date.localeCompare(b.start_date) || a.title.localeCompare(b.title))
  },

  async createEvent(input, schoolYearId) {
    const row = fromInput(input, nextId(), schoolYearId)
    store.push(row)
    return row
  },

  async updateEvent(id, input) {
    const i = store.findIndex((e) => e.id === id)
    if (i === -1) throw new Error('That event no longer exists.')
    const existing = store[i]!
    const next = { ...fromInput(input, id, existing.school_year_id), created_at: existing.created_at }
    store[i] = next
    return next
  },

  async deleteEvent(id) {
    const i = store.findIndex((e) => e.id === id)
    if (i !== -1) store.splice(i, 1)
  },

  async listMySuggestions(schoolYearId) {
    return store
      .filter((e) => e.school_year_id === schoolYearId)
      .filter((e) => e.visibility === 'community' && e.owner_id === OWNER_ID)
      .filter((e) => e.source !== 'pdf_import')
      .sort((a, b) => b.created_at.localeCompare(a.created_at))
  },

  async listPendingReview(schoolYearId) {
    return store
      .filter((e) => e.school_year_id === schoolYearId && e.status === 'pending')
      .sort((a, b) => a.start_date.localeCompare(b.start_date))
  },

  async reviewEvent(id, action: ReviewAction, note?: string) {
    const row = store.find((e) => e.id === id)
    if (!row) throw new Error('That suggestion no longer exists.')
    row.status = action === 'approve' ? 'approved' : 'rejected'
    row.review_note = note ?? null
    row.approved_at = action === 'approve' ? new Date().toISOString() : null
    row.updated_at = new Date().toISOString()
  },

  async listAllForYear(schoolYearId) {
    return store.filter((e) => e.school_year_id === schoolYearId)
  },


  // ------------------------------------------------------ notifications --

  async getNotificationPreferences() {
    return { prefs: previewPrefs, categories: previewCategoryPrefs }
  },

  async updateNotificationPreferences(patch) {
    Object.assign(previewPrefs, patch)
  },

  async updateCategoryPreference(categoryId, patch) {
    const row = previewCategoryPrefs.find((c) => c.category_id === categoryId)
    if (!row) return
    if (patch.enabled !== undefined) row.enabled = patch.enabled
    if (patch.offsets !== undefined) row.offsets_minutes = patch.offsets
  },

  async listQueuedReminders() {
    // Derived rather than stored: the preview has no scheduler, so this shows
    // what WOULD be queued for the events it already holds.
    const now = Date.now()
    const out: QueuedReminder[] = []
    for (const e of store) {
      const cat = previewCategoryPrefs.find((c) => c.category_id === e.category_id)
      if (!cat?.enabled) continue
      const occurs = new Date(`${e.start_date}T09:00:00`).getTime()
      for (const off of cat.offsets_minutes) {
        const at = occurs - off * 60_000
        if (at <= now) continue
        for (const ch of previewPrefs.channels) {
          out.push({
            id: `${e.id}-${off}-${ch}`,
            subject_type: 'event',
            subject_id: e.id,
            channel: ch,
            offset_minutes: off,
            scheduled_for: new Date(at).toISOString(),
            state: 'pending',
            sent_at: null,
            subject_title: e.title,
          })
        }
      }
    }
    return out.sort((a, b) => a.scheduled_for.localeCompare(b.scheduled_for)).slice(0, 25)
  },

  async savePushSubscription() {
    // Nothing to persist in preview; the browser permission is still real.
  },

  async removePushSubscription() {},

  // ---------------------------------------------------- parent sharing --

  async listParentLinks() {
    return parentLinks
  },

  async createParentInvite() {
    // Same shape as the real one: 8 characters, no ambiguous glyphs.
    const alphabet = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789'
    let code = ''
    for (let i = 0; i < 8; i++) {
      code += alphabet[Math.floor(Math.random() * alphabet.length)]
    }
    previewInvites.add(code)
    return code
  },

  async redeemParentInvite(code) {
    const normalised = code.trim().toUpperCase()
    if (!previewInvites.has(normalised)) {
      throw new Error('That code is not valid. Ask for a new one.')
    }
    previewInvites.delete(normalised)
    const now = new Date().toISOString()
    parentLinks.push({
      id: nextId(),
      parent_id: 'preview-parent',
      student_id: OWNER_ID,
      status: 'accepted',
      accepted_at: now,
      created_at: now,
      other_name: 'Sample Parent',
      other_role: 'parent',
    })
    return 'Sample Parent'
  },

  async revokeParentLink(id) {
    const i = parentLinks.findIndex((l) => l.id === id)
    if (i !== -1) parentLinks.splice(i, 1)
  },

  async setSharedWithParents(kind: Shareable, id, shared) {
    const target =
      kind === 'event' ? store.find((e) => e.id === id)
      : kind === 'class' ? classes.find((c) => c.id === id)
      : kind === 'notebook_page' ? pages.find((p) => p.id === id)
      : assignments.find((a) => a.id === id)
    if (target) target.shared_with_parents = shared
  },

  // ------------------------------------------------------------ classes --

  async listClasses(schoolYearId, includeArchived = false) {
    return classes
      .filter((c) => c.school_year_id === schoolYearId)
      .filter((c) => includeArchived || !c.is_archived)
      .sort((a, b) => a.name.localeCompare(b.name))
  },

  async getClass(id) {
    return classes.find((c) => c.id === id) ?? null
  },

  async createClass(input, schoolYearId) {
    const now = new Date().toISOString()
    const row: SchoolClass = {
      id: nextId(),
      owner_id: OWNER_ID,
      school_year_id: schoolYearId,
      name: input.name.trim(),
      course_code: input.courseCode?.trim().toUpperCase() || null,
      teacher: input.teacher?.trim() || null,
      room: input.room?.trim() || null,
      color_token: input.colorToken ?? null,
      is_archived: false,
      archived_at: null,
      shared_with_parents: false,
      created_at: now,
      updated_at: now,
    }
    classes.push(row)
    return row
  },

  async updateClass(id, input) {
    const row = classes.find((c) => c.id === id)
    if (!row) throw new Error('That class no longer exists.')
    Object.assign(row, {
      name: input.name.trim(),
      course_code: input.courseCode?.trim().toUpperCase() || null,
      teacher: input.teacher?.trim() || null,
      room: input.room?.trim() || null,
      color_token: input.colorToken ?? null,
      updated_at: new Date().toISOString(),
    })
    return row
  },

  async setClassArchived(id, archived) {
    const row = classes.find((c) => c.id === id)
    if (!row) return
    row.is_archived = archived
    row.archived_at = archived ? new Date().toISOString() : null
  },

  async deleteClass(id) {
    const i = classes.findIndex((c) => c.id === id)
    if (i !== -1) classes.splice(i, 1)
    // Cascade, as the foreign keys would.
    for (let j = pages.length - 1; j >= 0; j--) if (pages[j]!.class_id === id) pages.splice(j, 1)
    for (let j = assignments.length - 1; j >= 0; j--) {
      if (assignments[j]!.class_id === id) assignments.splice(j, 1)
    }
    for (let j = tasks.length - 1; j >= 0; j--) if (tasks[j]!.class_id === id) tasks.splice(j, 1)
  },

  // ----------------------------------------------------------- notebook --

  async listPages(classId) {
    return pages
      .filter((p) => p.class_id === classId && !p.is_archived)
      .sort((a, b) => a.position - b.position)
  },

  async createPage(classId, parentId, title = 'Untitled') {
    const siblings = pages.filter((p) => p.class_id === classId && p.parent_page_id === parentId)
    const position = Math.max(0, ...siblings.map((p) => p.position)) + 1000
    const now = new Date().toISOString()
    const row: NotebookPage = {
      id: nextId(),
      class_id: classId,
      owner_id: OWNER_ID,
      parent_page_id: parentId,
      title,
      icon: null,
      content: {},
      content_text: '',
      position,
      is_archived: false,
      shared_with_parents: false,
      created_at: now,
      updated_at: now,
    }
    pages.push(row)
    return row
  },

  async updatePage(id, patch) {
    const row = pages.find((p) => p.id === id)
    if (!row) return
    if (patch.title !== undefined) row.title = patch.title
    if (patch.content !== undefined) row.content = patch.content
    if (patch.contentText !== undefined) row.content_text = patch.contentText
    row.updated_at = new Date().toISOString()
  },

  async deletePage(id) {
    const i = pages.findIndex((p) => p.id === id)
    if (i !== -1) pages.splice(i, 1)
  },

  async recentPages(limit) {
    return [...pages]
      .sort((a, b) => b.updated_at.localeCompare(a.updated_at))
      .slice(0, limit)
      .map((p) => ({
        ...p,
        className: classes.find((c) => c.id === p.class_id)?.name ?? 'Class',
      }))
  },

  // -------------------------------------------------------- assignments --

  async listAssignments(classId) {
    return assignments
      .filter((a) => a.class_id === classId)
      .sort((a, b) => (a.due_at ?? '9999').localeCompare(b.due_at ?? '9999'))
  },

  async listUpcomingAssignments(schoolYearId, limit) {
    const inYear = new Set(
      classes.filter((c) => c.school_year_id === schoolYearId).map((c) => c.id))
    return assignments
      .filter((a) => inYear.has(a.class_id) && a.status !== 'completed')
      .sort((a, b) => (a.due_at ?? '9999').localeCompare(b.due_at ?? '9999'))
      .slice(0, limit)
      .map((a) => ({
        ...a,
        className: classes.find((c) => c.id === a.class_id)?.name ?? 'Class',
      }))
  },

  async createAssignment(classId, input) {
    const now = new Date().toISOString()
    const row: Assignment = {
      id: nextId(),
      class_id: classId,
      owner_id: OWNER_ID,
      ...assignmentFields(input),
      event_id: null,
      shared_with_parents: false,
      created_at: now,
      updated_at: now,
    }
    assignments.push(row)
    return row
  },

  async updateAssignment(id, input) {
    const row = assignments.find((a) => a.id === id)
    if (!row) throw new Error('That assignment no longer exists.')
    Object.assign(row, assignmentFields(input), { updated_at: new Date().toISOString() })
    return row
  },

  async setAssignmentStatus(id, status) {
    const row = assignments.find((a) => a.id === id)
    if (!row) return
    row.status = status
    row.completed_at = status === 'completed' ? new Date().toISOString() : null
    row.updated_at = new Date().toISOString()
  },

  async deleteAssignment(id) {
    const i = assignments.findIndex((a) => a.id === id)
    if (i !== -1) assignments.splice(i, 1)
  },

  // -------------------------------------------------------------- tasks --

  async listTasks(classId) {
    return tasks
      .filter((t) => t.class_id === classId)
      .sort((a, b) => a.created_at.localeCompare(b.created_at))
  },

  async createTask(classId, title) {
    const now = new Date().toISOString()
    const row: Task = {
      id: nextId(), owner_id: OWNER_ID, class_id: classId, title: title.trim(),
      notes: null, due_at: null, priority: 'normal', status: 'not_started',
      completed_at: null, created_at: now, updated_at: now,
    }
    tasks.push(row)
    return row
  },

  async toggleTask(id, done) {
    const row = tasks.find((t) => t.id === id)
    if (!row) return
    row.status = done ? 'completed' : 'not_started'
    row.completed_at = done ? new Date().toISOString() : null
  },

  async deleteTask(id) {
    const i = tasks.findIndex((t) => t.id === id)
    if (i !== -1) tasks.splice(i, 1)
  },

  async clearAll(schoolYearId) {
    for (let i = store.length - 1; i >= 0; i--) {
      if (store[i]!.school_year_id === schoolYearId) store.splice(i, 1)
    }
  },

  async importEvents(writes: ImportWrite[], schoolYearId, options: ImportOptions) {
    const now = new Date().toISOString()
    for (const w of writes) {
      // A replace swaps the existing row out rather than leaving both behind.
      if (w.replacesEventId) {
        const i = store.findIndex((e) => e.id === w.replacesEventId)
        if (i !== -1) store.splice(i, 1)
      }
      const category = bySlug.get(w.categorySlug) ?? null
      store.push({
        id: nextId(),
        school_year_id: schoolYearId,
        category_id: category?.id ?? null,
        series_id: null,
        owner_id: OWNER_ID,
        title: w.title,
        description: w.description,
        location: null,
        priority: 0,
        is_all_day: true,
        start_date: w.startDate,
        end_date: w.endDate,
        start_at: null,
        end_at: null,
        visibility: options.visibility,
        status: 'approved',
        shared_with_parents: false,
        approved_by: options.visibility === 'community' ? OWNER_ID : null,
        approved_at: options.visibility === 'community' ? now : null,
        review_note: null,
        source: options.source,
        content_hash: contentHash(w.title, w.startDate),
        created_at: now,
        updated_at: now,
        category,
      })
    }
    return writes.length
  },
}
