/**
 * The real data source. Every query runs as the signed-in user, so row-level
 * security decides what comes back -- these filters narrow a result set the
 * database has already restricted, they never grant access.
 */
import { supabase } from '@/lib/supabase'
import type {
  Assignment, CalendarEvent, EventCategory, EventWithCategory, NewAssignmentInput,
  NewEventInput, NotebookPage, ParentLink, SchoolClass, SchoolYear, Shareable, Task,
} from '@/lib/types'
import { contentHash } from '@/lib/events'
import { toInstant } from '@/lib/datetime'
import type {
  DataSource, EventFilters, ImportOptions, ImportWrite, ReviewAction,
} from './source'

const EVENT_COLUMNS = '*, category:event_categories(*)'

/** Turns a Postgres error into something a person can act on. */
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
      // Overlap, not containment, so a multi-day break spanning the window
      // edge still appears.
      .lte('start_date', filters.to)
      .gte('end_date', filters.from)
      .order('start_date')

    if (filters.categoryIds?.length) query = query.in('category_id', filters.categoryIds)
    if (filters.scope === 'community') query = query.eq('visibility', 'community')
    if (filters.scope === 'personal') query = query.eq('visibility', 'private')
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
    if (Object.keys(row).length === 0) return

    const { error } = await supabase.from('notebook_pages').update(row).eq('id', id)
    if (error) fail('save that page', error)
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
