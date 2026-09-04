/**
 * The real data source. Every query runs as the signed-in user, so row-level
 * security decides what comes back -- these filters narrow a result set the
 * database has already restricted, they never grant access.
 */
import { supabase } from '@/lib/supabase'
import type {
  CalendarEvent, EventCategory, EventWithCategory, NewEventInput, SchoolYear,
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
}
