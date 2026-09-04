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
import type { DataSource, EventFilters } from './source'

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
}
