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
  Attachment, ChatMessage, ChatThread, ClassMeeting, Grade, MeetingWithClass,
  ReportCard, ReportCardLine,
  SchoolClass, SchoolYear, Shareable, Task,
} from '@/lib/types'
import { contentHash } from '@/lib/events'
import { toInstant } from '@/lib/datetime'
import { SAMPLE_SCHOOL_YEAR, sampleSchoolYear } from './sampleSchoolYear'
import {
  matchesFilters, type DataSource, type EventFilters, type ImportOptions,
  type ImportWrite, type ReviewAction, type SearchHit,
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
  label: SAMPLE_SCHOOL_YEAR.label,
  starts_on: SAMPLE_SCHOOL_YEAR.startsOn,
  ends_on: SAMPLE_SCHOOL_YEAR.endsOn,
  is_current: true,
}

let counter = 0
const nextId = () => `preview-event-${++counter}`

function seed(): EventWithCategory[] {
  const now = new Date().toISOString()
  return sampleSchoolYear.map((e) => {
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
const meetings: ClassMeeting[] = []
const grades: Grade[] = []
const reportCards: ReportCard[] = []
const reportCardLines: ReportCardLine[] = []
const attachments: Attachment[] = []
const chatThreads: ChatThread[] = []
const chatMessages: ChatMessage[] = []
let chatUsed = 0

const previewPrefs: NotificationPreferences = {
  profile_id: OWNER_ID,
  channels: ['email'],
  digest_daily: false,
  digest_daily_at: '07:00',
  digest_weekly: false,
  quiet_start: null,
  quiet_end: null,
  quiet_days: [],
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

/**
 * A notebook with something in it.
 *
 * The preview seeded no pages at all, which meant three screens had only ever
 * been seen empty: the notes tab, the dashboard's recent-notes card, and every
 * measurement any harness has ever taken of them. A tree cannot be judged
 * without a tree, so this seeds nested pages rather than a flat list.
 *
 * All of it is invented, like every other number on the marketing pages. It is
 * the shape of a real notebook, not a copy of one.
 */
function seedNotebook() {
  const cs = classes[0]!
  const fn = classes[1]!
  const now = new Date().toISOString()
  const ago = (days: number) =>
    new Date(Date.now() - days * 86_400_000).toISOString()

  const page = (
    klass: string, title: string, parent: string | null, pos: number,
    icon: string | null, text: string, touched: string,
  ): NotebookPage => ({
    id: nextId(),
    class_id: klass,
    owner_id: OWNER_ID,
    parent_page_id: parent,
    title,
    icon,
    content: {
      type: 'doc',
      content: [{ type: 'paragraph', content: [{ type: 'text', text }] }],
    },
    content_text: text,
    position: pos,
    is_archived: false,
    shared_with_parents: false,
    created_at: now,
    updated_at: touched,
  })

  const unit3 = page(fn.id, 'Unit 3 — Rational functions', null, 1000, '📐',
    'Vertical asymptote where the denominator is zero and the numerator is not.',
    ago(1))
  pages.push(unit3)
  pages.push(page(fn.id, 'Asymptotes', unit3.id, 1000, null,
    'Horizontal: compare degrees. Equal degrees means the ratio of leading coefficients.',
    ago(1)))
  pages.push(page(fn.id, 'Worked examples', unit3.id, 2000, null,
    'f(x) = (2x + 1)/(x - 3). Asymptotes at x = 3 and y = 2.', ago(3)))
  pages.push(page(fn.id, 'Test 2 review', null, 2000, '✅',
    'Transformations, then rationals. Bring the formula sheet.', ago(4)))

  const arrays = page(cs.id, 'Arrays and lists', null, 1000, '📗',
    'An array is fixed length. A list grows, and that growth is not free.',
    ago(2))
  pages.push(arrays)
  pages.push(page(cs.id, 'Big-O, roughly', arrays.id, 1000, null,
    'Lookup by index is constant. Searching without an index is not.', ago(6)))
  pages.push(page(cs.id, 'Recursion', null, 2000, '🌀',
    'Base case first. Every call has to make the problem smaller or it never ends.',
    ago(8)))
}
seedNotebook()

/**
 * A week that actually has a shape.
 *
 * Times are the school day rather than round numbers, because a timetable made
 * of 09:00 and 10:00 blocks does not show whether the grid copes with a
 * period that starts at twenty past.
 */
function seedTimetable() {
  const [cs, fn] = classes as [SchoolClass, SchoolClass]
  const now = new Date().toISOString()
  const slot = (
    klass: SchoolClass, day: number, from: string, to: string, label: string,
    room: string | null = null,
  ): ClassMeeting => ({
    id: nextId(),
    class_id: klass.id,
    owner_id: OWNER_ID,
    day_of_week: day,
    cycle_day: null,
    starts_at: from,
    ends_at: to,
    room,
    label,
    created_at: now,
    updated_at: now,
  })

  // Monday to Friday, two classes, deliberately not the same time every day.
  meetings.push(slot(fn, 1, '08:50:00', '10:05:00', 'Period 1'))
  meetings.push(slot(cs, 1, '13:20:00', '14:35:00', 'Period 3', 'Lab 2'))
  meetings.push(slot(cs, 2, '10:20:00', '11:35:00', 'Period 2', 'Lab 2'))
  meetings.push(slot(fn, 3, '08:50:00', '10:05:00', 'Period 1'))
  meetings.push(slot(cs, 4, '13:20:00', '14:35:00', 'Period 3', 'Lab 2'))
  meetings.push(slot(fn, 5, '10:20:00', '11:35:00', 'Period 2'))
}
seedTimetable()

/**
 * Marks, including one that is not marked yet.
 *
 * That last one is the point: an upcoming test with a date and no score is the
 * most common row in a real gradebook and the easiest one for a schema or a
 * screen to reject by accident.
 */
function seedGrades() {
  const [cs, fn] = classes as [SchoolClass, SchoolClass]
  const now = new Date().toISOString()
  const day = (offset: number) =>
    new Date(Date.now() + offset * 86_400_000).toISOString().slice(0, 10)

  const mark = (
    klass: SchoolClass, title: string, score: number | null, outOf: number | null,
    category: string, on: string, weight = 1,
  ): Grade => ({
    id: nextId(),
    owner_id: OWNER_ID,
    class_id: klass.id,
    assignment_id: null,
    title,
    score,
    out_of: outOf,
    letter: null,
    weight,
    category,
    term: 'Term 1',
    recorded_on: on,
    notes: null,
    source: 'manual',
    // Off, on every one of them. The default is the feature.
    shared_with_parents: false,
    created_at: now,
    updated_at: now,
  })

  grades.push(mark(fn, 'Unit 1 quiz', 17, 20, 'Quiz', day(-24)))
  grades.push(mark(fn, 'Unit 2 test', 41, 50, 'Test', day(-11), 2))
  grades.push(mark(fn, 'Unit 3 test', null, null, 'Test', day(6), 2))
  grades.push(mark(cs, 'Arrays lab', 19, 20, 'Lab', day(-18)))
  grades.push(mark(cs, 'Recursion assignment', 27, 35, 'Assignment', day(-5), 1.5))
}
seedGrades()

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
      // Matches the Supabase source: only approved events reach a calendar.
      .filter((e) => e.status === 'approved')
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


  async search(query: string) {
    const q = query.trim().toLowerCase()
    if (q.length < 2) return []

    const hits: SearchHit[] = []
    const has = (text: string | null | undefined) =>
      (text ?? '').toLowerCase().includes(q)

    for (const e of store) {
      if (e.status !== 'approved') continue
      if (has(e.title) || has(e.description) || has(e.location)) {
        hits.push({
          kind: 'event',
          id: e.id,
          title: e.title,
          subtitle: e.description ?? e.location ?? null,
          occurs_on: e.start_date,
          class_id: null,
        })
      }
    }

    for (const c of classes) {
      if (has(c.name) || has(c.course_code)) {
        hits.push({
          kind: 'class',
          id: c.id,
          title: c.name,
          subtitle: c.course_code ?? c.teacher ?? null,
          occurs_on: null,
          class_id: c.id,
        })
      }
    }

    for (const a of assignments) {
      if (has(a.title)) {
        hits.push({
          kind: 'assignment',
          id: a.id,
          title: a.title,
          subtitle: classes.find((c) => c.id === a.class_id)?.name ?? null,
          occurs_on: null,
          class_id: a.class_id,
        })
      }
    }

    for (const n of pages) {
      if (has(n.title) || has(n.content_text)) {
        hits.push({
          kind: 'note',
          id: n.id,
          title: n.title,
          subtitle: (n.content_text ?? '').slice(0, 120) || null,
          occurs_on: null,
          class_id: n.class_id,
        })
      }
    }

    return hits.slice(0, 20)
  },

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
    if (patch.icon !== undefined) row.icon = patch.icon
    if (patch.parentId !== undefined) row.parent_page_id = patch.parentId
    if (patch.position !== undefined) row.position = patch.position
    row.updated_at = new Date().toISOString()
  },

  async setPageArchived(id, archived) {
    const row = pages.find((p) => p.id === id)
    if (!row) return
    row.is_archived = archived
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

  // ---------------------------------------------------------- timetable --

  async listMeetings(classId) {
    return meetings
      .filter((m) => m.class_id === classId)
      .sort((a, b) =>
        (a.day_of_week ?? a.cycle_day ?? 0) - (b.day_of_week ?? b.cycle_day ?? 0)
        || a.starts_at.localeCompare(b.starts_at))
  },

  async listWeekMeetings(schoolYearId) {
    const live = new Map(
      classes.filter((c) => c.school_year_id === schoolYearId && !c.is_archived)
        .map((c) => [c.id, c]),
    )
    const out: MeetingWithClass[] = []
    for (const m of meetings) {
      const c = live.get(m.class_id)
      if (!c) continue
      out.push({
        ...m,
        className: c.name,
        courseCode: c.course_code,
        classRoom: c.room,
        colorToken: c.color_token,
      })
    }
    return out.sort((a, b) => a.starts_at.localeCompare(b.starts_at))
  },

  async createMeeting(classId, input) {
    const now = new Date().toISOString()
    const row: ClassMeeting = {
      id: nextId(),
      class_id: classId,
      owner_id: OWNER_ID,
      day_of_week: input.dayOfWeek ?? null,
      cycle_day: input.cycleDay ?? null,
      starts_at: input.startsAt,
      ends_at: input.endsAt,
      room: input.room?.trim() || null,
      label: input.label?.trim() || null,
      created_at: now,
      updated_at: now,
    }
    meetings.push(row)
    return row
  },

  async updateMeeting(id, input) {
    const row = meetings.find((m) => m.id === id)
    if (!row) throw new Error('That timetable slot no longer exists.')
    row.day_of_week = input.dayOfWeek ?? null
    row.cycle_day = input.cycleDay ?? null
    row.starts_at = input.startsAt
    row.ends_at = input.endsAt
    row.room = input.room?.trim() || null
    row.label = input.label?.trim() || null
    row.updated_at = new Date().toISOString()
    return row
  },

  async deleteMeeting(id) {
    const i = meetings.findIndex((m) => m.id === id)
    if (i !== -1) meetings.splice(i, 1)
  },

  // ------------------------------------------------------------- grades --

  async listGrades(classId) {
    return grades
      .filter((g) => g.class_id === classId)
      .sort((a, b) => (b.recorded_on ?? '').localeCompare(a.recorded_on ?? ''))
  },

  async listAllGrades(schoolYearId) {
    const live = new Map(
      classes.filter((c) => c.school_year_id === schoolYearId).map((c) => [c.id, c.name]),
    )
    return grades
      .filter((g) => live.has(g.class_id))
      .map((g) => ({ ...g, className: live.get(g.class_id)! }))
      .sort((a, b) => (b.recorded_on ?? '').localeCompare(a.recorded_on ?? ''))
  },

  async createGrade(classId, input) {
    const now = new Date().toISOString()
    const row: Grade = {
      id: nextId(),
      owner_id: OWNER_ID,
      class_id: classId,
      assignment_id: input.assignmentId ?? null,
      title: input.title.trim(),
      score: input.score ?? null,
      out_of: input.outOf ?? null,
      letter: input.letter?.trim() || null,
      weight: input.weight ?? 1,
      category: input.category?.trim() || null,
      term: input.term?.trim() || null,
      recorded_on: input.recordedOn || null,
      notes: input.notes?.trim() || null,
      source: 'manual',
      shared_with_parents: false,
      created_at: now,
      updated_at: now,
    }
    grades.push(row)
    return row
  },

  async updateGrade(id, input) {
    const row = grades.find((g) => g.id === id)
    if (!row) throw new Error('That mark no longer exists.')
    Object.assign(row, {
      title: input.title.trim(),
      score: input.score ?? null,
      out_of: input.outOf ?? null,
      letter: input.letter?.trim() || null,
      weight: input.weight ?? 1,
      category: input.category?.trim() || null,
      term: input.term?.trim() || null,
      recorded_on: input.recordedOn || null,
      notes: input.notes?.trim() || null,
      assignment_id: input.assignmentId ?? null,
      updated_at: new Date().toISOString(),
    })
    return row
  },

  async deleteGrade(id) {
    const i = grades.findIndex((g) => g.id === id)
    if (i !== -1) grades.splice(i, 1)
  },

  // ------------------------------------------------------- report cards --

  async listReportCards() {
    return [...reportCards].sort((a, b) => b.created_at.localeCompare(a.created_at))
  },

  async getReportCard(id) {
    return reportCards.find((r) => r.id === id) ?? null
  },

  async createReportCard(file, term) {
    const now = new Date().toISOString()
    const row: ReportCard = {
      id: nextId(),
      owner_id: OWNER_ID,
      school_year_id: YEAR_ID,
      storage_path: `preview/${file.name}`,
      original_name: file.name,
      mime_type: file.type || null,
      byte_size: file.size,
      term,
      status: 'uploaded',
      error: null,
      decode_consent_at: null,
      decoded_at: null,
      applied_at: null,
      created_at: now,
      updated_at: now,
    }
    reportCards.push(row)
    return row
  },

  /**
   * The preview cannot ask a model anything -- there is no network and no key.
   * It invents a plausible reading instead, and the review screen is then
   * exercisable end to end without a Supabase project.
   *
   * The invented lines deliberately include one the "model" was unsure about
   * and one that matches no class, because those are the two cases the review
   * screen exists for, and a demo where everything matches perfectly is a demo
   * that never shows the part that matters.
   */
  async decodeReportCard(id) {
    const card = reportCards.find((r) => r.id === id)
    if (!card) return
    card.decode_consent_at = new Date().toISOString()
    card.status = 'decoding'

    const now = new Date().toISOString()
    const line = (
      course: string, mark: number | null, outOf: number | null,
      confidence: number, matched: string | null, remark: string | null,
    ): ReportCardLine => ({
      id: nextId(),
      report_card_id: card.id,
      owner_id: OWNER_ID,
      course_name: course,
      course_code: null,
      teacher: null,
      mark,
      out_of: outOf,
      letter: null,
      term: card.term,
      remark,
      confidence,
      raw: { course, mark },
      matched_class_id: matched,
      decision: 'pending',
      grade_id: null,
      created_at: now,
      updated_at: now,
    })

    const [cs, fn] = classes as [SchoolClass, SchoolClass]
    reportCardLines.push(
      line('Functions', 84, 100, 0.96, fn.id, 'Works steadily and asks good questions.'),
      line('Computer Science', 91, 100, 0.94, cs.id, null),
      // Read poorly on purpose: a smudged line is the normal case.
      line('Enqlish', 78, 100, 0.41, null, null),
      // Real, legible, and matches nothing the student has set up.
      line('Physical Education', 88, 100, 0.93, null, null),
    )

    card.status = 'decoded'
    card.decoded_at = now
    card.updated_at = now
  },

  async listReportCardLines(reportCardId) {
    return reportCardLines
      .filter((l) => l.report_card_id === reportCardId)
      .sort((a, b) => (a.confidence ?? 0) - (b.confidence ?? 0))
  },

  async updateReportCardLine(id, patch) {
    const row = reportCardLines.find((l) => l.id === id)
    if (!row) return
    if (patch.decision !== undefined) row.decision = patch.decision
    if (patch.matchedClassId !== undefined) row.matched_class_id = patch.matchedClassId
    row.updated_at = new Date().toISOString()
  },

  async applyReportCard(id) {
    const card = reportCards.find((r) => r.id === id)
    if (!card) return { created: 0, skipped: 0 }
    let created = 0
    let skipped = 0
    const now = new Date().toISOString()

    for (const line of reportCardLines.filter((l) => l.report_card_id === id)) {
      if (line.decision !== 'accept' || line.grade_id || !line.matched_class_id) {
        skipped++
        continue
      }
      const row: Grade = {
        id: nextId(),
        owner_id: OWNER_ID,
        class_id: line.matched_class_id,
        assignment_id: null,
        title: line.course_name?.trim() || 'Report card',
        score: line.mark,
        out_of: line.out_of,
        letter: line.letter,
        weight: 1,
        category: 'Report card',
        term: line.term,
        recorded_on: now.slice(0, 10),
        notes: line.remark,
        source: 'report_card',
        shared_with_parents: false,
        created_at: now,
        updated_at: now,
      }
      grades.push(row)
      line.grade_id = row.id
      created++
    }

    card.status = 'applied'
    card.applied_at = now
    return { created, skipped }
  },

  async deleteReportCard(id) {
    for (let i = reportCardLines.length - 1; i >= 0; i--) {
      if (reportCardLines[i]!.report_card_id === id) reportCardLines.splice(i, 1)
    }
    const i = reportCards.findIndex((r) => r.id === id)
    if (i !== -1) reportCards.splice(i, 1)
  },

  // -------------------------------------------------------- attachments --

  async listAttachments(classId) {
    return attachments
      .filter((f) => f.class_id === classId)
      .sort((a, b) => b.created_at.localeCompare(a.created_at))
  },

  async uploadAttachment(classId, file) {
    const row: Attachment = {
      id: nextId(),
      class_id: classId,
      owner_id: OWNER_ID,
      storage_path: `preview/${file.name}`,
      filename: file.name,
      mime_type: file.type || 'application/octet-stream',
      size_bytes: file.size,
      shared_with_parents: false,
      created_at: new Date().toISOString(),
    }
    attachments.push(row)
    return row
  },

  /**
   * A blob URL for the file that is still in memory from the upload, or an
   * empty string. Never a fabricated remote URL: a link that looks real and
   * goes nowhere is worse than one that is plainly absent.
   */
  async attachmentUrl() {
    return ''
  },

  async deleteAttachment(id) {
    const i = attachments.findIndex((f) => f.id === id)
    if (i !== -1) attachments.splice(i, 1)
  },

  // --------------------------------------------------------------- chat --

  async listChatThreads() {
    return [...chatThreads].sort((a, b) => b.updated_at.localeCompare(a.updated_at))
  },

  async createChatThread(title) {
    const now = new Date().toISOString()
    const row: ChatThread = {
      id: nextId(),
      owner_id: OWNER_ID,
      title: title.slice(0, 80) || 'New chat',
      created_at: now,
      updated_at: now,
    }
    chatThreads.push(row)
    return row
  },

  async deleteChatThread(id) {
    for (let i = chatMessages.length - 1; i >= 0; i--) {
      if (chatMessages[i]!.thread_id === id) chatMessages.splice(i, 1)
    }
    const i = chatThreads.findIndex((t) => t.id === id)
    if (i !== -1) chatThreads.splice(i, 1)
  },

  async listChatMessages(threadId) {
    return chatMessages
      .filter((m) => m.thread_id === threadId)
      .sort((a, b) => a.created_at.localeCompare(b.created_at))
  },

  /**
   * There is no model here, and the preview does not pretend there is one.
   *
   * It answers from the seeded data by reading it, which is honest about what
   * it is: the reply says plainly that this is the preview and no model was
   * asked. Inventing a fluent paragraph would demonstrate a feature that does
   * not exist until a key is set, which is the one thing this project's rules
   * forbid outright.
   */
  async sendChatMessage(threadId, text) {
    const now = new Date().toISOString()
    chatUsed++

    chatMessages.push({
      id: nextId(), thread_id: threadId, owner_id: OWNER_ID, role: 'user',
      content: text, sources: [], error: null, created_at: now,
    })

    const soon = store
      .filter((e) => e.start_date >= new Date().toISOString().slice(0, 10))
      .sort((a, b) => a.start_date.localeCompare(b.start_date))
      .slice(0, 3)
    const due = assignments
      .filter((a) => a.status !== 'completed' && a.due_at)
      .sort((a, b) => (a.due_at ?? '').localeCompare(b.due_at ?? ''))
      .slice(0, 3)

    const lines = [
      'This is the preview, so nothing was asked of a model — this reply is'
      + ' read straight out of the sample data.',
    ]
    if (soon.length) {
      lines.push('', 'Coming up:', ...soon.map((e) => `• ${e.title} — ${e.start_date}`))
    }
    if (due.length) {
      lines.push('', 'Due:', ...due.map((a) => `• ${a.title}`))
    }

    const reply: ChatMessage = {
      id: nextId(),
      thread_id: threadId,
      owner_id: OWNER_ID,
      role: 'assistant',
      content: lines.join('\n'),
      sources: [
        ...soon.map((e) => ({ kind: 'event' as const, id: e.id, title: e.title })),
        ...due.map((a) => ({ kind: 'assignment' as const, id: a.id, title: a.title })),
      ],
      error: null,
      created_at: new Date().toISOString(),
    }
    chatMessages.push(reply)

    const thread = chatThreads.find((t) => t.id === threadId)
    if (thread) {
      thread.updated_at = reply.created_at
      if (thread.title === 'New chat') thread.title = text.slice(0, 60)
    }
    return reply
  },

  async chatQuotaRemaining() {
    return { used: chatUsed, limit: 40 }
  },
}
