/**
 * The real data source. Every query runs as the signed-in user, so row-level
 * security decides what comes back -- these filters narrow a result set the
 * database has already restricted, they never grant access.
 */
import { supabase } from '@/lib/supabase'
import type {
  Assignment, CalendarEvent, EventCategory, EventWithCategory, NewAssignmentInput,
  CategoryPreference, NewEventInput, NotebookPage, NotificationPreferences, ParentLink,
  QueuedReminder, SchoolClass, SchoolYear, Shareable, Task,
  Attachment, ChatMessage, ChatThread, ClassMeeting, Grade,
  NewGradeInput, NewMeetingInput, ReportCard, ReportCardLine,
  GroupAnnouncement, TeachingGroup,
} from '@/lib/types'
import { contentHash } from '@/lib/events'
import { toInstant } from '@/lib/datetime'
import type { DataSource, EventFilters, ImportOptions, ImportWrite, ReviewAction, SearchHit } from './source'

const EVENT_COLUMNS = '*, category:event_categories(*)'

/** Turns a Postgres error into something a person can act on. */
/**
 * What an Edge Function actually said, if it said anything.
 *
 * `functions.invoke` reports every non-2xx as one generic FunctionsHttpError,
 * so the sentence the function wrote -- "The assistant has no model key set",
 * "This provider cannot read PDFs. Take a photo or a screenshot of the report
 * card and upload that instead.", "That's all the assistant can answer today"
 * -- is in the response body and nowhere else. Both call sites used to replace
 * it with a generic apology, which threw away the only actionable half. The
 * missing-key case is the state every new deployment starts in, so that was
 * the message most people would ever see.
 *
 * `context` is the raw Response. Reading it can fail -- a consumed body, a
 * non-JSON error raised by the edge itself before the function ran -- and the
 * callers all have a sentence of their own to fall back to.
 */
async function functionMessage(error: unknown): Promise<string | null> {
  const context = (error as { context?: Response } | null)?.context
  if (!context || typeof context.json !== 'function') return null
  try {
    const body = await context.json() as { message?: unknown }
    return typeof body?.message === 'string' && body.message ? body.message : null
  } catch {
    return null
  }
}

function fail(context: string, error: { message: string; code?: string }): never {
  if (error.code === '23505') throw new Error('That already exists.')
  if (error.code === '42501') throw new Error("You don't have permission to do that.")
  console.error(`[calenda] ${context}:`, error)
  throw new Error(`We couldn't ${context}. Please try again.`)
}

function toRow(input: NewEventInput, schoolYearId: string) {
  return {
    school_year_id: schoolYearId,
    category_id: input.categoryId,
    title: input.title.trim(),
    description: input.description?.trim() || null,
    location: input.location?.trim() || null,
    priority: input.priority,
    is_all_day: input.isAllDay,
    start_date: input.startDate,
    end_date: input.endDate,
    start_at: input.isAllDay || !input.startTime
      ? null : toInstant(input.startDate, input.startTime),
    end_at: input.isAllDay || !input.endTime
      ? null : toInstant(input.endDate, input.endTime),
    visibility: input.visibility,
    // A community event from a normal user is a suggestion. The insert policy
    // enforces this too; sending it explicitly keeps the intent visible.
    status: input.visibility === 'community' ? 'pending' : 'approved',
    content_hash: contentHash(input.title, input.startDate),
  }
}

export const supabaseSource: DataSource = {
  kind: 'supabase',

  async listSchoolYears() {
    const { data, error } = await supabase
      .from('school_years')
      .select('*')
      .order('starts_on', { ascending: false })
    if (error) fail('load your school years', error)
    return (data ?? []) as SchoolYear[]
  },

  async listCategories() {
    const { data, error } = await supabase
      .from('event_categories')
      .select('*')
      .order('sort_order')
    if (error) fail('load event categories', error)
    return (data ?? []) as EventCategory[]
  },

  async listEvents(filters: EventFilters) {
    let query = supabase
      .from('events')
      .select(EVENT_COLUMNS)
      .eq('school_year_id', filters.schoolYearId)
      // Only settled events belong on a calendar. A community event you
      // suggested is visible to you at every status, so without this your own
      // pending and rejected suggestions sat on your calendar as though they
      // had been approved. Private events are 'approved' by database
      // constraint, so this does not hide anything of your own.
      .eq('status', 'approved')
      // Overlap, not containment, so a multi-day break spanning the window
      // edge still appears.
      .lte('start_date', filters.to)
      .gte('end_date', filters.from)
      .order('start_date')

    if (filters.categoryIds?.length) query = query.in('category_id', filters.categoryIds)
    if (filters.scope === 'community') query = query.eq('visibility', 'community')
    if (filters.scope === 'personal') query = query.eq('visibility', 'private')
    if (filters.sources?.length) query = query.in('source', filters.sources)
    if (filters.search) {
      const q = filters.search.replace(/[%,()]/g, ' ').trim()
      if (q) query = query.or(`title.ilike.%${q}%,description.ilike.%${q}%`)
    }

    const { data, error } = await query
    if (error) fail('load your events', error)
    return (data ?? []) as unknown as EventWithCategory[]
  },

  async createEvent(input, schoolYearId) {
    const { data: auth } = await supabase.auth.getUser()
    if (!auth.user) throw new Error('You need to be signed in to add an event.')

    const { data, error } = await supabase
      .from('events')
      .insert({ ...toRow(input, schoolYearId), owner_id: auth.user.id })
      .select(EVENT_COLUMNS)
      .single()
    if (error) fail('save that event', error)
    return data as unknown as CalendarEvent
  },

  async updateEvent(id, input) {
    const { data: existing, error: readError } = await supabase
      .from('events')
      .select('school_year_id')
      .eq('id', id)
      .single()
    if (readError) fail('find that event', readError)

    const { data, error } = await supabase
      .from('events')
      .update(toRow(input, (existing as { school_year_id: string }).school_year_id))
      .eq('id', id)
      .select(EVENT_COLUMNS)
      .single()
    if (error) fail('update that event', error)
    return data as unknown as CalendarEvent
  },

  async deleteEvent(id) {
    const { error } = await supabase.from('events').delete().eq('id', id)
    if (error) fail('delete that event', error)
  },

  async listMySuggestions(schoolYearId) {
    const { data: auth } = await supabase.auth.getUser()
    if (!auth.user) return []

    const { data, error } = await supabase
      .from('events')
      .select(EVENT_COLUMNS)
      .eq('school_year_id', schoolYearId)
      .eq('visibility', 'community')
      .eq('owner_id', auth.user.id)
      .order('created_at', { ascending: false })
    if (error) fail('load your suggestions', error)
    return (data ?? []) as unknown as EventWithCategory[]
  },

  async listPendingReview(schoolYearId) {
    // RLS decides whether anything comes back; a non-admin simply gets rows
    // they own, which is correct.
    const { data, error } = await supabase
      .from('events')
      .select(EVENT_COLUMNS)
      .eq('school_year_id', schoolYearId)
      .eq('status', 'pending')
      .order('start_date')
    if (error) fail('load the review queue', error)
    return (data ?? []) as unknown as EventWithCategory[]
  },

  async reviewEvent(id, action: ReviewAction, note?: string) {
    const { data: auth } = await supabase.auth.getUser()
    if (!auth.user) throw new Error('You need to be signed in.')

    const { error } = await supabase
      .from('events')
      .update({
        status: action === 'approve' ? 'approved' : 'rejected',
        approved_by: action === 'approve' ? auth.user.id : null,
        approved_at: action === 'approve' ? new Date().toISOString() : null,
        review_note: note ?? null,
      })
      .eq('id', id)
    if (error) fail('record that decision', error)

    // Audit trail. A failure here must not silently vanish, but it also must
    // not undo a decision that already succeeded.
    const { error: auditError } = await supabase.from('event_reviews').insert({
      event_id: id,
      reviewer_id: auth.user.id,
      action: action === 'approve' ? 'approved' : 'rejected',
      note: note ?? null,
    })
    if (auditError) console.error('[calenda] review audit failed:', auditError)
  },

  async listAllForYear(schoolYearId) {
    const { data, error } = await supabase
      .from('events')
      .select(EVENT_COLUMNS)
      .eq('school_year_id', schoolYearId)
    if (error) fail('load existing events', error)
    return (data ?? []) as unknown as EventWithCategory[]
  },

  async importEvents(writes: ImportWrite[], schoolYearId, options: ImportOptions) {
    if (writes.length === 0) return 0

    const { data: auth } = await supabase.auth.getUser()
    if (!auth.user) throw new Error('You need to be signed in.')

    const { data: cats, error: catError } = await supabase
      .from('event_categories')
      .select('id, slug')
    if (catError) fail('load event categories', catError)
    const bySlug = new Map((cats ?? []).map((c) => [c.slug as string, c.id as string]))

    const replacing = writes.map((w) => w.replacesEventId).filter(Boolean) as string[]
    if (replacing.length) {
      const { error } = await supabase.from('events').delete().in('id', replacing)
      if (error) fail('replace the existing events', error)
    }

    const now = new Date().toISOString()
    const rows = writes.map((w) => ({
      school_year_id: schoolYearId,
      category_id: bySlug.get(w.categorySlug) ?? null,
      owner_id: auth.user!.id,
      title: w.title,
      description: w.description,
      is_all_day: true,
      start_date: w.startDate,
      end_date: w.endDate,
      visibility: options.visibility,
      // An admin importing the school calendar IS the approval; asking them to
      // then approve their own import would be theatre. A private import needs
      // no approval at all.
      status: 'approved' as const,
      approved_by: options.visibility === 'community' ? auth.user!.id : null,
      approved_at: options.visibility === 'community' ? now : null,
      source: options.source,
      content_hash: contentHash(w.title, w.startDate),
    }))

    const { error } = await supabase.from('events').insert(rows)
    if (error) fail('import those events', error)
    return rows.length
  },



  // ------------------------------------------------------ notifications --

  async search(query: string, schoolYearId?: string) {
    const q = query.trim()
    if (q.length < 2) return []
    const { data, error } = await supabase.rpc('search_everything', {
      q,
      school_year: schoolYearId ?? null,
      max_results: 20,
    })
    if (error) fail('search', error)
    return (data ?? []) as SearchHit[]
  },

  async getNotificationPreferences() {
    const { data: auth } = await supabase.auth.getUser()
    if (!auth.user) throw new Error('You need to be signed in.')

    // Creates rows for anyone who has never opened this screen, so a new
    // account still has working defaults rather than nothing.
    const { error: seedError } = await supabase.rpc('ensure_notification_defaults', {
      target: auth.user.id,
    })
    if (seedError) fail('load your notification settings', seedError)

    const [prefsRes, catsRes] = await Promise.all([
      supabase.from('notification_preferences').select('*')
        .eq('profile_id', auth.user.id).single(),
      supabase.from('notification_category_prefs')
        .select('category_id, enabled, offsets_minutes')
        .eq('profile_id', auth.user.id),
    ])

    if (prefsRes.error) fail('load your notification settings', prefsRes.error)
    if (catsRes.error) fail('load your notification settings', catsRes.error)

    return {
      prefs: prefsRes.data as NotificationPreferences,
      categories: (catsRes.data ?? []) as CategoryPreference[],
    }
  },

  async updateNotificationPreferences(patch) {
    const { data: auth } = await supabase.auth.getUser()
    if (!auth.user) throw new Error('You need to be signed in.')
    const { error } = await supabase
      .from('notification_preferences')
      .update(patch)
      .eq('profile_id', auth.user.id)
    if (error) fail('save your notification settings', error)
  },

  async updateCategoryPreference(categoryId, patch) {
    const { data: auth } = await supabase.auth.getUser()
    if (!auth.user) throw new Error('You need to be signed in.')

    const row: Record<string, unknown> = {}
    if (patch.enabled !== undefined) row.enabled = patch.enabled
    if (patch.offsets !== undefined) row.offsets_minutes = patch.offsets

    const { error } = await supabase
      .from('notification_category_prefs')
      .update(row)
      .eq('profile_id', auth.user.id)
      .eq('category_id', categoryId)
    if (error) fail('save that reminder setting', error)
  },

  async listQueuedReminders(limit) {
    const { data, error } = await supabase
      .from('notification_queue')
      .select('*')
      .order('scheduled_for')
      .limit(limit)
    if (error) fail('load your reminders', error)
    return (data ?? []) as QueuedReminder[]
  },

  async savePushSubscription(sub) {
    const { data: auth } = await supabase.auth.getUser()
    if (!auth.user) throw new Error('You need to be signed in.')
    if (!sub.endpoint || !sub.keys?.p256dh || !sub.keys?.auth) {
      throw new Error('Your browser did not provide a usable push subscription.')
    }

    const { error } = await supabase.from('push_subscriptions').upsert({
      profile_id: auth.user.id,
      endpoint: sub.endpoint,
      p256dh: sub.keys.p256dh,
      auth: sub.keys.auth,
      user_agent: navigator.userAgent.slice(0, 300),
    }, { onConflict: 'endpoint' })
    if (error) fail('turn on notifications for this device', error)
  },

  async removePushSubscription(endpoint) {
    const { error } = await supabase.from('push_subscriptions').delete().eq('endpoint', endpoint)
    if (error) fail('turn off notifications for this device', error)
  },

  // ---------------------------------------------------- parent sharing --

  async listParentLinks() {
    const { data: auth } = await supabase.auth.getUser()
    if (!auth.user) return []
    const me = auth.user.id

    const { data, error } = await supabase
      .from('parent_links')
      .select('*, parent:profiles!parent_links_parent_id_fkey(full_name, role),'
            + ' student:profiles!parent_links_student_id_fkey(full_name, role)')
      .neq('status', 'revoked')
      .order('created_at', { ascending: false })
    if (error) fail('load your connections', error)

    type Joined = {
      id: string; parent_id: string; student_id: string; status: ParentLink['status']
      accepted_at: string | null; created_at: string
      parent: { full_name: string | null; role: ParentLink['other_role'] } | null
      student: { full_name: string | null; role: ParentLink['other_role'] } | null
    }

    return (data ?? []).map((row) => {
      const r = row as unknown as Joined
      // Show whoever ISN'T the viewer; a parent sees the student and vice versa.
      const other = r.parent_id === me ? r.student : r.parent
      return {
        id: r.id,
        parent_id: r.parent_id,
        student_id: r.student_id,
        status: r.status,
        accepted_at: r.accepted_at,
        created_at: r.created_at,
        other_name: other?.full_name ?? null,
        other_role: other?.role ?? 'student',
      }
    })
  },

  async createParentInvite() {
    const { data, error } = await supabase.rpc('create_parent_invite')
    if (error) fail('create an invite code', error)
    return data as string
  },

  async redeemParentInvite(code) {
    const { data, error } = await supabase.rpc('redeem_parent_invite', {
      invite_code: code.trim().toUpperCase(),
    })
    if (error) {
      // The function returns one deliberate message for every failure so a
      // wrong code cannot be told apart from a used or expired one. Pass it
      // through rather than replacing it with something vaguer.
      throw new Error(error.message || 'That code is not valid. Ask for a new one.')
    }
    const rows = (data ?? []) as Array<{ out_student_name: string | null }>
    return rows[0]?.out_student_name ?? 'your student'
  },

  async revokeParentLink(id) {
    const { error } = await supabase
      .from('parent_links')
      .update({ status: 'revoked' })
      .eq('id', id)
    if (error) fail('remove that connection', error)
  },

  async setSharedWithParents(kind: Shareable, id, shared) {
    const table = {
      event: 'events',
      class: 'classes',
      notebook_page: 'notebook_pages',
      assignment: 'assignments',
      grade: 'grades',
      file: 'files',
    }[kind]

    const { error } = await supabase
      .from(table)
      .update({ shared_with_parents: shared })
      .eq('id', id)
    if (error) fail(shared ? 'share that' : 'stop sharing that', error)
  },

  // ------------------------------------------------------------ classes --

  async listClasses(schoolYearId, includeArchived = false) {
    let q = supabase.from('classes').select('*').eq('school_year_id', schoolYearId)
    if (!includeArchived) q = q.eq('is_archived', false)
    const { data, error } = await q.order('name')
    if (error) fail('load your classes', error)
    return (data ?? []) as SchoolClass[]
  },

  async getClass(id) {
    const { data, error } = await supabase.from('classes').select('*').eq('id', id).maybeSingle()
    if (error) fail('load that class', error)
    return (data as SchoolClass) ?? null
  },

  async createClass(input, schoolYearId) {
    const { data: auth } = await supabase.auth.getUser()
    if (!auth.user) throw new Error('You need to be signed in.')

    const { data, error } = await supabase
      .from('classes')
      .insert({
        owner_id: auth.user.id,
        school_year_id: schoolYearId,
        name: input.name.trim(),
        course_code: input.courseCode?.trim().toUpperCase() || null,
        teacher: input.teacher?.trim() || null,
        room: input.room?.trim() || null,
        color_token: input.colorToken ?? null,
      })
      .select('*')
      .single()
    if (error) fail('create that class', error)
    return data as SchoolClass
  },

  async updateClass(id, input) {
    const { data, error } = await supabase
      .from('classes')
      .update({
        name: input.name.trim(),
        course_code: input.courseCode?.trim().toUpperCase() || null,
        teacher: input.teacher?.trim() || null,
        room: input.room?.trim() || null,
        color_token: input.colorToken ?? null,
      })
      .eq('id', id)
      .select('*')
      .single()
    if (error) fail('update that class', error)
    return data as SchoolClass
  },

  async setClassArchived(id, archived) {
    const { error } = await supabase
      .from('classes')
      .update({ is_archived: archived, archived_at: archived ? new Date().toISOString() : null })
      .eq('id', id)
    if (error) fail(archived ? 'archive that class' : 'restore that class', error)
  },

  async deleteClass(id) {
    const { error } = await supabase.from('classes').delete().eq('id', id)
    if (error) fail('delete that class', error)
  },

  // ----------------------------------------------------------- notebook --

  async listPages(classId) {
    const { data, error } = await supabase
      .from('notebook_pages')
      .select('*')
      .eq('class_id', classId)
      .eq('is_archived', false)
      .order('position')
    if (error) fail('load your notes', error)
    return (data ?? []) as NotebookPage[]
  },

  async createPage(classId, parentId, title = 'Untitled') {
    const { data: auth } = await supabase.auth.getUser()
    if (!auth.user) throw new Error('You need to be signed in.')

    // Fractional ordering: append after the last sibling without renumbering.
    const { data: siblings } = await supabase
      .from('notebook_pages')
      .select('position')
      .eq('class_id', classId)
      .is('parent_page_id', parentId)
      .order('position', { ascending: false })
      .limit(1)
    const position = ((siblings?.[0]?.position as number | undefined) ?? 0) + 1000

    const { data, error } = await supabase
      .from('notebook_pages')
      .insert({
        class_id: classId,
        owner_id: auth.user.id,
        parent_page_id: parentId,
        title,
        position,
      })
      .select('*')
      .single()
    if (error) fail('create that page', error)
    return data as NotebookPage
  },

  async updatePage(id, patch) {
    const row: Record<string, unknown> = {}
    if (patch.title !== undefined) row.title = patch.title
    if (patch.content !== undefined) row.content = patch.content
    if (patch.contentText !== undefined) row.content_text = patch.contentText
    if (patch.icon !== undefined) row.icon = patch.icon
    if (patch.parentId !== undefined) row.parent_page_id = patch.parentId
    if (patch.position !== undefined) row.position = patch.position
    if (Object.keys(row).length === 0) return

    const { error } = await supabase.from('notebook_pages').update(row).eq('id', id)
    if (error) fail('save that page', error)
  },

  async setPageArchived(id, archived) {
    const { error } = await supabase
      .from('notebook_pages').update({ is_archived: archived }).eq('id', id)
    if (error) fail(archived ? 'archive that page' : 'restore that page', error)
  },

  async deletePage(id) {
    const { error } = await supabase.from('notebook_pages').delete().eq('id', id)
    if (error) fail('delete that page', error)
  },

  async recentPages(limit) {
    const { data, error } = await supabase
      .from('notebook_pages')
      .select('*, classes(name)')
      .eq('is_archived', false)
      .order('updated_at', { ascending: false })
      .limit(limit)
    if (error) fail('load your recent notes', error)
    return (data ?? []).map((row) => {
      const { classes, ...page } = row as NotebookPage & { classes: { name: string } | null }
      return { ...page, className: classes?.name ?? 'Class' }
    })
  },

  // -------------------------------------------------------- assignments --

  async listAssignments(classId) {
    const { data, error } = await supabase
      .from('assignments')
      .select('*')
      .eq('class_id', classId)
      .order('due_at', { nullsFirst: false })
    if (error) fail('load your assignments', error)
    return (data ?? []) as Assignment[]
  },

  async listUpcomingAssignments(schoolYearId, limit) {
    const { data, error } = await supabase
      .from('assignments')
      .select('*, classes!inner(name, school_year_id)')
      .eq('classes.school_year_id', schoolYearId)
      .neq('status', 'completed')
      .order('due_at', { nullsFirst: false })
      .limit(limit)
    if (error) fail('load upcoming work', error)
    return (data ?? []).map((row) => {
      const { classes, ...a } = row as Assignment & { classes: { name: string } | null }
      return { ...a, className: classes?.name ?? 'Class' }
    })
  },

  async createAssignment(classId, input) {
    const { data: auth } = await supabase.auth.getUser()
    if (!auth.user) throw new Error('You need to be signed in.')

    const { data, error } = await supabase
      .from('assignments')
      .insert({ class_id: classId, owner_id: auth.user.id, ...assignmentRow(input) })
      .select('*')
      .single()
    if (error) fail('save that assignment', error)
    return data as Assignment
  },

  async updateAssignment(id, input) {
    const { data, error } = await supabase
      .from('assignments')
      .update(assignmentRow(input))
      .eq('id', id)
      .select('*')
      .single()
    if (error) fail('update that assignment', error)
    return data as Assignment
  },

  async setAssignmentStatus(id, status) {
    const { error } = await supabase
      .from('assignments')
      .update({
        status,
        completed_at: status === 'completed' ? new Date().toISOString() : null,
      })
      .eq('id', id)
    if (error) fail('update that assignment', error)
  },

  async deleteAssignment(id) {
    const { error } = await supabase.from('assignments').delete().eq('id', id)
    if (error) fail('delete that assignment', error)
  },

  // -------------------------------------------------------------- tasks --

  async listTasks(classId) {
    const { data, error } = await supabase
      .from('tasks')
      .select('*')
      .eq('class_id', classId)
      .order('created_at')
    if (error) fail('load your tasks', error)
    return (data ?? []) as Task[]
  },

  async createTask(classId, title) {
    const { data: auth } = await supabase.auth.getUser()
    if (!auth.user) throw new Error('You need to be signed in.')

    const { data, error } = await supabase
      .from('tasks')
      .insert({ owner_id: auth.user.id, class_id: classId, title: title.trim() })
      .select('*')
      .single()
    if (error) fail('add that task', error)
    return data as Task
  },

  async toggleTask(id, done) {
    const { error } = await supabase
      .from('tasks')
      .update({
        status: done ? 'completed' : 'not_started',
        completed_at: done ? new Date().toISOString() : null,
      })
      .eq('id', id)
    if (error) fail('update that task', error)
  },

  async deleteTask(id) {
    const { error } = await supabase.from('tasks').delete().eq('id', id)
    if (error) fail('delete that task', error)
  },

  // ---------------------------------------------------------- timetable --

  async listMeetings(classId) {
    const { data, error } = await supabase
      .from('class_meetings')
      .select('*')
      .eq('class_id', classId)
      .order('day_of_week', { nullsFirst: false })
      .order('cycle_day', { nullsFirst: false })
      .order('starts_at')
    if (error) fail('load that timetable', error)
    return (data ?? []) as ClassMeeting[]
  },

  async listWeekMeetings(schoolYearId) {
    // Joined rather than fetched twice: the timetable is unreadable without
    // the class name beside each block, and two round trips to draw one grid
    // is two chances for it to render half-empty.
    const { data, error } = await supabase
      .from('class_meetings')
      .select('*, classes!inner(name, course_code, room, color_token, school_year_id, is_archived)')
      .eq('classes.school_year_id', schoolYearId)
      .eq('classes.is_archived', false)
      .order('starts_at')
    if (error) fail('load your timetable', error)
    type Joined = ClassMeeting & {
      classes: {
        name: string; course_code: string | null; room: string | null
        color_token: string | null
      }
    }
    return ((data ?? []) as Joined[]).map(({ classes, ...m }) => ({
      ...m,
      className: classes.name,
      courseCode: classes.course_code,
      classRoom: classes.room,
      colorToken: classes.color_token,
    }))
  },

  async createMeeting(classId, input) {
    const { data: auth } = await supabase.auth.getUser()
    if (!auth.user) throw new Error('You need to be signed in.')
    const { data, error } = await supabase
      .from('class_meetings')
      .insert({ class_id: classId, owner_id: auth.user.id, ...meetingRow(input) })
      .select('*')
      .single()
    if (error) fail('add that to your timetable', error)
    return data as ClassMeeting
  },

  async updateMeeting(id, input) {
    const { data, error } = await supabase
      .from('class_meetings')
      .update(meetingRow(input))
      .eq('id', id)
      .select('*')
      .single()
    if (error) fail('change that timetable slot', error)
    return data as ClassMeeting
  },

  async deleteMeeting(id) {
    const { error } = await supabase.from('class_meetings').delete().eq('id', id)
    if (error) fail('remove that timetable slot', error)
  },

  // ------------------------------------------------------------- grades --

  async listGrades(classId) {
    const { data, error } = await supabase
      .from('grades')
      .select('*')
      .eq('class_id', classId)
      .order('recorded_on', { ascending: false, nullsFirst: false })
      .order('created_at', { ascending: false })
    if (error) fail('load your marks', error)
    return (data ?? []) as Grade[]
  },

  async listAllGrades(schoolYearId) {
    const { data, error } = await supabase
      .from('grades')
      .select('*, classes!inner(name, school_year_id)')
      .eq('classes.school_year_id', schoolYearId)
      .order('recorded_on', { ascending: false, nullsFirst: false })
    if (error) fail('load your marks', error)
    type Joined = Grade & { classes: { name: string } }
    return ((data ?? []) as Joined[]).map(({ classes, ...g }) => ({
      ...g, className: classes.name,
    }))
  },

  async createGrade(classId, input) {
    const { data: auth } = await supabase.auth.getUser()
    if (!auth.user) throw new Error('You need to be signed in.')
    const { data, error } = await supabase
      .from('grades')
      .insert({ class_id: classId, owner_id: auth.user.id, ...gradeRow(input) })
      .select('*')
      .single()
    if (error) fail('save that mark', error)
    return data as Grade
  },

  async updateGrade(id, input) {
    const { data, error } = await supabase
      .from('grades').update(gradeRow(input)).eq('id', id).select('*').single()
    if (error) fail('change that mark', error)
    return data as Grade
  },

  async deleteGrade(id) {
    const { error } = await supabase.from('grades').delete().eq('id', id)
    if (error) fail('delete that mark', error)
  },

  // ------------------------------------------------------- report cards --

  async listReportCards() {
    const { data, error } = await supabase
      .from('report_cards').select('*').order('created_at', { ascending: false })
    if (error) fail('load your report cards', error)
    return (data ?? []) as ReportCard[]
  },

  async getReportCard(id) {
    const { data, error } = await supabase
      .from('report_cards').select('*').eq('id', id).maybeSingle()
    if (error) fail('load that report card', error)
    return (data as ReportCard | null) ?? null
  },

  async createReportCard(file, term) {
    const { data: auth } = await supabase.auth.getUser()
    if (!auth.user) throw new Error('You need to be signed in.')

    // The path decides who can read it. Everything under the owner's uid, and
    // the storage policy refuses anything that is not -- so this prefix is not
    // a convention the app has to remember, it is the control.
    const ext = file.name.split('.').pop()?.toLowerCase().replace(/[^a-z0-9]/g, '') || 'bin'
    const path = `${auth.user.id}/report-cards/${crypto.randomUUID()}.${ext}`

    const up = await supabase.storage.from('attachments').upload(path, file, {
      contentType: file.type || undefined,
      upsert: false,
    })
    if (up.error) fail('upload that report card', up.error as { message: string })

    const { data, error } = await supabase
      .from('report_cards')
      .insert({
        owner_id: auth.user.id,
        storage_path: path,
        original_name: file.name,
        mime_type: file.type || null,
        byte_size: file.size,
        term,
      })
      .select('*')
      .single()
    if (error) {
      // The row is what makes the object findable. Without it the upload is an
      // orphan nobody can list, read or delete, quietly using the free tier.
      await supabase.storage.from('attachments').remove([path])
      fail('save that report card', error)
    }
    return data as ReportCard
  },

  async decodeReportCard(id) {
    // Consent is written before anything leaves, not after it succeeds. A
    // failed decode still sent the document.
    const { error: consentError } = await supabase
      .from('report_cards')
      .update({ decode_consent_at: new Date().toISOString(), status: 'decoding', error: null })
      .eq('id', id)
    if (consentError) fail('start reading that report card', consentError)

    const { error } = await supabase.functions.invoke('calenda-decode', {
      body: { reportCardId: id },
    })
    if (error) {
      const said = await functionMessage(error)
      // Only when the function did not already record one. It writes its own
      // reason into this row before answering, so overwriting unconditionally
      // replaced "take a photo of it instead" with the string form of a
      // FunctionsHttpError -- destroying the useful half in the one place the
      // screen reads it back from.
      if (!said) {
        await supabase.from('report_cards')
          .update({ status: 'failed', error: 'We could not read that report card.' })
          .eq('id', id)
      }
      throw new Error(
        said ?? 'We could not read that report card. You can still add the marks by hand.',
      )
    }
  },

  async listReportCardLines(reportCardId) {
    const { data, error } = await supabase
      .from('report_card_lines')
      .select('*')
      .eq('report_card_id', reportCardId)
      // Least certain first. The lines most likely to be wrong are the ones
      // that most need a person to look, so they are not at the bottom.
      .order('confidence', { ascending: true, nullsFirst: true })
    if (error) fail('load what we read', error)
    return (data ?? []) as ReportCardLine[]
  },

  async updateReportCardLine(id, patch) {
    const row: Record<string, unknown> = {}
    if (patch.decision !== undefined) row.decision = patch.decision
    if (patch.matchedClassId !== undefined) row.matched_class_id = patch.matchedClassId
    if (Object.keys(row).length === 0) return
    const { error } = await supabase.from('report_card_lines').update(row).eq('id', id)
    if (error) fail('save that decision', error)
  },

  async applyReportCard(id) {
    const { data: auth } = await supabase.auth.getUser()
    if (!auth.user) throw new Error('You need to be signed in.')

    const lines = await this.listReportCardLines(id)
    let created = 0
    let skipped = 0

    for (const line of lines) {
      // Three reasons to pass over a line, and none of them is an error:
      // it was not accepted, it has already been applied (which is what makes
      // this safe to run twice), or nobody said which class it belongs to.
      if (line.decision !== 'accept' || line.grade_id || !line.matched_class_id) {
        skipped++
        continue
      }
      const { data, error } = await supabase
        .from('grades')
        .insert({
          owner_id: auth.user.id,
          class_id: line.matched_class_id,
          title: line.course_name?.trim() || 'Report card',
          score: line.mark,
          out_of: line.out_of,
          letter: line.letter,
          term: line.term,
          notes: line.remark,
          source: 'report_card',
        })
        .select('id')
        .single()
      if (error) fail('save those marks', error)

      await supabase.from('report_card_lines')
        .update({ grade_id: data.id }).eq('id', line.id)
      created++
    }

    await supabase.from('report_cards')
      .update({ status: 'applied', applied_at: new Date().toISOString() })
      .eq('id', id)

    return { created, skipped }
  },

  async deleteReportCard(id) {
    const card = await this.getReportCard(id)
    const { error } = await supabase.from('report_cards').delete().eq('id', id)
    if (error) fail('delete that report card', error)
    // After the row, so a failed delete does not leave a row pointing at an
    // object that is gone. An orphaned object is waste; a row pointing at
    // nothing is a broken screen.
    if (card) await supabase.storage.from('attachments').remove([card.storage_path])
  },

  // -------------------------------------------------------- attachments --

  async listAttachments(classId) {
    const { data, error } = await supabase
      .from('files').select('*').eq('class_id', classId)
      .order('created_at', { ascending: false })
    if (error) fail('load those attachments', error)
    return (data ?? []) as Attachment[]
  },

  async uploadAttachment(classId, file) {
    const { data: auth } = await supabase.auth.getUser()
    if (!auth.user) throw new Error('You need to be signed in.')

    const ext = file.name.split('.').pop()?.toLowerCase().replace(/[^a-z0-9]/g, '') || 'bin'
    const path = `${auth.user.id}/notes/${crypto.randomUUID()}.${ext}`

    const up = await supabase.storage.from('attachments').upload(path, file, {
      contentType: file.type || undefined,
      upsert: false,
    })
    if (up.error) fail('upload that file', up.error as { message: string })

    const { data, error } = await supabase
      .from('files')
      .insert({
        class_id: classId,
        owner_id: auth.user.id,
        storage_path: path,
        filename: file.name,
        mime_type: file.type || 'application/octet-stream',
        size_bytes: file.size,
      })
      .select('*')
      .single()
    if (error) {
      await supabase.storage.from('attachments').remove([path])
      fail('save that file', error)
    }
    return data as Attachment
  },

  async attachmentUrl(id) {
    const { data: row, error } = await supabase
      .from('files').select('storage_path').eq('id', id).single()
    if (error) fail('open that file', error)

    // Signed and short-lived. The bucket is private, so there is no permanent
    // URL to hand out -- which is the point: a link that keeps working is a
    // link that keeps working after it has been forwarded.
    const { data, error: signError } = await supabase.storage
      .from('attachments')
      .createSignedUrl(row.storage_path as string, 60 * 5)
    if (signError) fail('open that file', signError as { message: string })
    return data.signedUrl
  },

  async deleteAttachment(id) {
    const { data: row } = await supabase
      .from('files').select('storage_path').eq('id', id).maybeSingle()
    const { error } = await supabase.from('files').delete().eq('id', id)
    if (error) fail('delete that file', error)
    if (row) await supabase.storage.from('attachments').remove([row.storage_path as string])
  },

  // --------------------------------------------------------------- chat --

  async listChatThreads() {
    const { data, error } = await supabase
      .from('chat_threads').select('*').order('updated_at', { ascending: false })
    if (error) fail('load your chats', error)
    return (data ?? []) as ChatThread[]
  },

  async createChatThread(title) {
    const { data: auth } = await supabase.auth.getUser()
    if (!auth.user) throw new Error('You need to be signed in.')
    const { data, error } = await supabase
      .from('chat_threads')
      .insert({ owner_id: auth.user.id, title: title.slice(0, 80) || 'New chat' })
      .select('*')
      .single()
    if (error) fail('start that chat', error)
    return data as ChatThread
  },

  async deleteChatThread(id) {
    const { error } = await supabase.from('chat_threads').delete().eq('id', id)
    if (error) fail('delete that chat', error)
  },

  async listChatMessages(threadId) {
    const { data, error } = await supabase
      .from('chat_messages').select('*').eq('thread_id', threadId)
      .order('created_at')
    if (error) fail('load that chat', error)
    return (data ?? []) as ChatMessage[]
  },

  async sendChatMessage(threadId, text) {
    // The function does the asking. It holds the model key, forwards this
    // user's token so every read is still behind RLS, and claims a message
    // against the daily quota before it spends anything.
    const { data, error } = await supabase.functions.invoke('calenda-chat', {
      body: { threadId, message: text },
    })
    if (error) {
      const said = await functionMessage(error)
      throw new Error(
        said ?? 'The assistant is not answering right now. Your message was not sent.',
      )
    }
    return (data as { reply: ChatMessage }).reply
  },

  async chatQuotaRemaining() {
    const today = new Date().toISOString().slice(0, 10)
    const { data, error } = await supabase
      .from('chat_usage').select('used').eq('day', today).maybeSingle()
    // A counter that cannot be read is not worth an error on the page it sits
    // in the corner of.
    if (error) return null

    /**
     * An admin is recorded but never refused (20260910000100), so a countdown
     * would tick down to "0 left today" beside a box that keeps working. A
     * number that contradicts the thing it sits next to is worse than no
     * number.
     *
     * The role is read here rather than trusted from the client's own state
     * because this is the only place the two facts meet -- and it is a
     * display decision either way. The limit that matters is the one in
     * `claim_chat_message()`, which no client can influence.
     */
    const { data: me } = await supabase.auth.getUser()
    let unlimited = false
    if (me.user) {
      const { data: profile } = await supabase
        .from('profiles').select('role').eq('id', me.user.id).maybeSingle()
      unlimited = profile?.role === 'admin'
    }

    // Kept in step with claim_chat_message() by hand, because the function
    // deliberately takes no arguments -- see 20260909000500.
    return { used: (data?.used as number | undefined) ?? 0, limit: 40, unlimited }
  },

  // ----------------------------------------------------------- teaching --

  async listTeachingGroups(schoolYearId) {
    const { data, error } = await supabase
      .from('teacher_groups')
      // The count is a related-table aggregate rather than a stored column, so
      // it cannot drift from the roster. `left_at` is null for current members
      // only -- somebody who left is kept on the row and is not a member.
      .select('*, teacher_group_members(count)')
      .eq('school_year_id', schoolYearId)
      .eq('is_archived', false)
      .is('teacher_group_members.left_at', null)
      .order('created_at')
    if (error) fail('load the classes you teach', error)
    return (data ?? []).map(withMemberCount)
  },

  async createTeachingGroup(schoolYearId, input) {
    const { data: auth } = await supabase.auth.getUser()
    if (!auth.user) throw new Error('You need to be signed in.')
    const { data, error } = await supabase
      .from('teacher_groups')
      .insert({ ...groupRow(input), school_year_id: schoolYearId, owner_id: auth.user.id })
      .select('*')
      .single()
    if (error) fail('make that class', error)
    return { ...(data as TeachingGroup), member_count: 0 }
  },

  async updateTeachingGroup(id, input) {
    const { data, error } = await supabase
      .from('teacher_groups').update(groupRow(input)).eq('id', id).select('*').single()
    if (error) fail('save that class', error)
    return { ...(data as TeachingGroup), member_count: 0 }
  },

  async setTeachingGroupArchived(id, archived) {
    const { error } = await supabase
      .from('teacher_groups')
      .update({ is_archived: archived, archived_at: archived ? new Date().toISOString() : null })
      .eq('id', id)
    if (error) fail('archive that class', error)
  },

  async rotateJoinCode(groupId) {
    // A function, not an update. It checks ownership itself, which is the
    // permission boundary -- a definer function does not consult RLS.
    const { data, error } = await supabase.rpc('rotate_group_join_code', { target_group: groupId })
    if (error) fail('make a join code', error)
    return data as string
  },

  async closeJoinCode(groupId) {
    const { error } = await supabase.rpc('close_group_join_code', { target_group: groupId })
    if (error) fail('close that class', error)
  },

  async listGroupMembers(groupId) {
    const { data, error } = await supabase
      .from('teacher_group_members')
      .select('*, student:profiles!teacher_group_members_student_id_fkey(full_name)')
      .eq('group_id', groupId)
      .is('left_at', null)
      .order('joined_at')
    if (error) fail('load your class list', error)
    return (data ?? []).map((r) => {
      const row = r as Record<string, unknown>
      const student = row.student as { full_name: string | null } | null
      return {
        id: row.id as string,
        group_id: row.group_id as string,
        student_id: row.student_id as string,
        student_name: student?.full_name ?? null,
        class_id: (row.class_id as string | null) ?? null,
        share_progress: Boolean(row.share_progress),
        joined_at: row.joined_at as string,
      }
    })
  },

  async removeGroupMember(memberId) {
    // Leaving is stamped, not deleted, so a teacher's record of who was in the
    // class in March is not rewritten by a removal in June.
    const { error } = await supabase
      .from('teacher_group_members')
      .update({ left_at: new Date().toISOString() })
      .eq('id', memberId)
    if (error) fail('remove that student', error)
  },

  async listGroupEvents(groupId) {
    const { data, error } = await supabase
      .from('events').select(EVENT_COLUMNS).eq('group_id', groupId).order('start_date')
    if (error) fail('load the dates for that class', error)
    return (data ?? []) as unknown as EventWithCategory[]
  },

  async publishGroupEvent(groupId, schoolYearId, input) {
    const { data: auth } = await supabase.auth.getUser()
    if (!auth.user) throw new Error('You need to be signed in.')
    const { data, error } = await supabase
      .from('events')
      // An ordinary event with the class on it. Members read it through a
      // policy; it is not copied into anybody's calendar, so editing the date
      // later changes it for everyone rather than for whoever gets re-synced.
      .insert({ ...toRow(input, schoolYearId), owner_id: auth.user.id, group_id: groupId })
      .select(EVENT_COLUMNS)
      .single()
    if (error) fail('publish that date', error)
    return data as unknown as CalendarEvent
  },

  async listGroupAnnouncements(groupId) {
    const { data, error } = await supabase
      .from('announcement_messages')
      .select('*')
      .eq('group_id', groupId)
      .order('created_at', { ascending: false })
    if (error) fail('load your announcements', error)
    return (data ?? []).map(toAnnouncement)
  },

  async announceToGroup(groupId, body, notify) {
    const { error } = await supabase.rpc('announce_to_group', {
      target_group: groupId, message: body, also_notify: notify,
    })
    if (error) fail('post that announcement', error)
  },

  async listGroupProgress(groupId) {
    const members = await supabaseSource.listGroupMembers(groupId)
    const sharing = members.filter((m) => m.share_progress && m.class_id)
    if (sharing.length === 0) {
      return members.map((m) => ({
        student_id: m.student_id,
        student_name: m.student_name,
        sharing: false,
        marks: 0,
        average: null,
      }))
    }

    // One query for every sharing member rather than one per member. The policy
    // is what decides which rows come back -- this filter is a narrowing, not
    // the control, and a member who turned sharing off between the two calls
    // simply returns nothing here.
    const { data, error } = await supabase
      .from('grades')
      .select('owner_id, class_id, score, out_of, weight')
      .in('owner_id', sharing.map((m) => m.student_id))
      .in('class_id', sharing.map((m) => m.class_id as string))
    if (error) fail('load how the class is doing', error)

    const byStudent = new Map<string, Array<{ score: number; outOf: number; weight: number }>>()
    for (const row of data ?? []) {
      const r = row as Record<string, unknown>
      const member = sharing.find((m) => m.student_id === r.owner_id && m.class_id === r.class_id)
      // A mark for a class this student did not link to THIS group is not this
      // teacher's to count, even if the policy let it through some other way.
      if (!member) continue
      // An unmarked row is excluded, never counted as zero. An upcoming test is
      // not a test you failed.
      const score = r.score as number | null
      const outOf = r.out_of as number | null
      if (score === null || outOf === null || outOf <= 0) continue
      const list = byStudent.get(member.student_id) ?? []
      list.push({ score, outOf, weight: (r.weight as number | null) ?? 1 })
      byStudent.set(member.student_id, list)
    }

    return members.map((m) => {
      const marks = byStudent.get(m.student_id) ?? []
      const weight = marks.reduce((t, x) => t + x.weight, 0)
      return {
        student_id: m.student_id,
        student_name: m.student_name,
        sharing: Boolean(m.share_progress && m.class_id),
        marks: marks.length,
        average: weight > 0
          ? marks.reduce((t, x) => t + (x.score / x.outOf) * 100 * x.weight, 0) / weight
          : null,
      }
    })
  },

  // ------------------------------------------- teaching, student side --

  async listMyGroups() {
    const { data, error } = await supabase
      .from('teacher_group_members')
      .select('*, group:teacher_groups(name, subject, owner_id)')
      .is('left_at', null)
      .order('joined_at')
    if (error) fail('load the classes you have joined', error)

    const rows = (data ?? []) as Array<Record<string, unknown>>
    // The teacher's name is a second read because it comes through a different
    // policy: a member may read the group, and the profile arm that lets them
    // read the person who owns it is the one on `profiles`. Batched, so this is
    // one request however many classes somebody is in.
    const ownerIds = [...new Set(rows.map((r) => (r.group as { owner_id?: string })?.owner_id)
      .filter((x): x is string => Boolean(x)))]
    const names = new Map<string, string | null>()
    if (ownerIds.length) {
      const { data: people } = await supabase
        .from('profiles').select('id, full_name').in('id', ownerIds)
      for (const p of people ?? []) names.set(p.id as string, (p.full_name as string) ?? null)
    }

    return rows.map((r) => {
      const group = r.group as { name: string; subject: string | null; owner_id: string } | null
      return {
        id: r.id as string,
        group_id: r.group_id as string,
        group_name: group?.name ?? 'A class',
        subject: group?.subject ?? null,
        teacher_name: group ? (names.get(group.owner_id) ?? null) : null,
        class_id: (r.class_id as string | null) ?? null,
        share_progress: Boolean(r.share_progress),
        joined_at: r.joined_at as string,
      }
    })
  },

  async joinGroup(code) {
    const { data, error } = await supabase.rpc('redeem_group_join_code', { code_text: code })
    if (error) {
      // The function raises a sentence written for a person -- "That code is
      // not valid. Ask your teacher for a new one." -- so it is passed through
      // rather than replaced with something vaguer.
      throw new Error(error.message)
    }
    const row = (data as Array<Record<string, unknown>> | null)?.[0]
    return {
      groupName: (row?.out_group_name as string) ?? 'that class',
      teacherName: (row?.out_teacher_name as string | null) ?? null,
    }
  },

  async updateMyGroup(membershipId, patch) {
    const row: Record<string, unknown> = {}
    if (patch.classId !== undefined) row.class_id = patch.classId
    if (patch.shareProgress !== undefined) row.share_progress = patch.shareProgress
    const { error } = await supabase
      .from('teacher_group_members').update(row).eq('id', membershipId)
    if (error) fail('save that', error)
  },

  async leaveGroup(membershipId) {
    const { error } = await supabase
      .from('teacher_group_members')
      .update({ left_at: new Date().toISOString() })
      .eq('id', membershipId)
    if (error) fail('leave that class', error)
  },

  async listMyAnnouncements(limit) {
    const { data, error } = await supabase
      .from('announcement_messages')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(limit)
    if (error) fail('load your announcements', error)
    return (data ?? []).map(toAnnouncement)
  },
}

/** Shared between create and update so the two cannot drift apart. */
function groupRow(input: { name: string; subject?: string; room?: string }) {
  return {
    name: input.name.trim(),
    subject: input.subject?.trim() || null,
    room: input.room?.trim() || null,
  }
}

function withMemberCount(row: unknown): TeachingGroup {
  const r = row as Record<string, unknown>
  const counts = r.teacher_group_members as Array<{ count: number }> | undefined
  return { ...(r as unknown as TeachingGroup), member_count: counts?.[0]?.count ?? 0 }
}

function toAnnouncement(row: unknown): GroupAnnouncement {
  const r = row as Record<string, unknown>
  return {
    id: r.id as string,
    group_id: r.group_id as string,
    group_name: (r.group_name as string) ?? 'A class',
    body: r.body as string,
    notified: Boolean(r.notified),
    created_at: r.created_at as string,
  }
}

/** Shared between create and update so the two cannot drift apart. */
function meetingRow(input: NewMeetingInput) {
  return {
    // Exactly one of these, and null for the other. Sending both would trip
    // the check constraint; sending neither would too.
    day_of_week: input.dayOfWeek ?? null,
    cycle_day: input.cycleDay ?? null,
    starts_at: input.startsAt,
    ends_at: input.endsAt,
    room: input.room?.trim() || null,
    label: input.label?.trim() || null,
  }
}

function gradeRow(input: NewGradeInput) {
  return {
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
  }
}

/** Shared between create and update so the two cannot drift apart. */
function assignmentRow(input: NewAssignmentInput) {
  return {
    title: input.title.trim(),
    description: input.description?.trim() || null,
    due_at: dueInstant(input),
    due_all_day: input.dueAllDay,
    priority: input.priority,
    status: input.status,
    estimated_minutes: input.estimatedMinutes ?? null,
    completed_at: input.status === 'completed' ? new Date().toISOString() : null,
  }
}

/**
 * An all-day deadline means end of that day, not midnight at its start --
 * "due Friday" is not "due Thursday night".
 */
function dueInstant(input: NewAssignmentInput): string | null {
  if (!input.dueDate) return null
  const [y, m, d] = input.dueDate.split('-').map(Number)
  if (!y || !m || !d) return null
  if (input.dueAllDay) return new Date(y, m - 1, d, 23, 59, 0).toISOString()
  const [hh, mm] = (input.dueTime ?? '23:59').split(':').map(Number)
  return new Date(y, m - 1, d, hh ?? 23, mm ?? 59).toISOString()
}
