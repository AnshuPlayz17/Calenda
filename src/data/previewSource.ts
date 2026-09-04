/**
 * In-memory data source, seeded with the real 2026-27 school calendar.
 *
 * Used only when Supabase is not configured, so the app is fully usable before
 * a project exists. Edits live for the session and are not persisted -- the UI
 * says so, rather than pretending they are saved.
 */
import type {
  EventCategory, EventWithCategory, NewEventInput, SchoolYear,
} from '@/lib/types'
import { contentHash } from '@/lib/events'
import { toInstant } from '@/lib/datetime'
import { SCHOOL_YEAR_2026_27, schoolEvents2026_27 } from './schoolCalendar'
import { matchesFilters, type DataSource, type EventFilters } from './source'

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
}
