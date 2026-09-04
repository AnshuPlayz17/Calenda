/**
 * The app talks to this interface, never to Supabase directly.
 *
 * Two implementations exist: the real Supabase one, and an in-memory preview
 * seeded with the actual 2026-27 school calendar. The preview is selected only
 * when Supabase is unconfigured, so the app is usable and demonstrable before
 * a project exists -- and the UI never learns which one it is talking to.
 */
import type {
  CalendarEvent, EventCategory, EventWithCategory, NewEventInput, SchoolYear,
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
  search?: string
}

export interface DataSource {
  readonly kind: 'supabase' | 'preview'
  listSchoolYears(): Promise<SchoolYear[]>
  listCategories(): Promise<EventCategory[]>
  listEvents(filters: EventFilters): Promise<EventWithCategory[]>
  createEvent(input: NewEventInput, schoolYearId: string): Promise<CalendarEvent>
  updateEvent(id: string, input: NewEventInput): Promise<CalendarEvent>
  deleteEvent(id: string): Promise<void>
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
  if (f.search) {
    const q = f.search.toLowerCase()
    const haystack = `${e.title} ${e.description ?? ''} ${e.location ?? ''}`.toLowerCase()
    if (!haystack.includes(q)) return false
  }
  return true
}
