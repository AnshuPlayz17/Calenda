import { describe, expect, it } from 'vitest'
import { matchesFilters } from '@/data/source'
import type { EventFilters } from '@/data/source'
import type { EventWithCategory } from '@/lib/types'

function event(over: Partial<EventWithCategory> = {}): EventWithCategory {
  return {
    id: 'e1', school_year_id: 'y1', category_id: 'cat-holiday', series_id: null,
    owner_id: 'u1', title: 'Winter Break', description: null, location: null, priority: 0,
    is_all_day: true, start_date: '2026-12-21', end_date: '2026-12-31',
    start_at: null, end_at: null, visibility: 'community', status: 'approved',
    shared_with_parents: false, approved_by: null, approved_at: null, review_note: null,
    source: 'pdf_import', content_hash: 'winter break::2026-12-21',
    created_at: '', updated_at: '', category: null,
    ...over,
  }
}

const window_: EventFilters = { schoolYearId: 'y1', from: '2026-12-01', to: '2026-12-31' }

describe('matchesFilters — date window', () => {
  it('includes an event fully inside the window', () => {
    expect(matchesFilters(event({ start_date: '2026-12-10', end_date: '2026-12-10' }), window_))
      .toBe(true)
  })

  it('includes a multi-day event that only overlaps the edge', () => {
    // Winter Break runs into January. Requiring containment would hide it from
    // December entirely, which is the bug this guards.
    expect(matchesFilters(event({ start_date: '2026-12-21', end_date: '2027-01-03' }), window_))
      .toBe(true)
  })

  it('includes an event that starts before the window and runs into it', () => {
    expect(matchesFilters(event({ start_date: '2026-11-25', end_date: '2026-12-02' }), window_))
      .toBe(true)
  })

  it('excludes events wholly outside', () => {
    expect(matchesFilters(event({ start_date: '2027-01-01', end_date: '2027-01-03' }), window_))
      .toBe(false)
    expect(matchesFilters(event({ start_date: '2026-11-01', end_date: '2026-11-30' }), window_))
      .toBe(false)
  })

  it('includes an event touching exactly one boundary day', () => {
    expect(matchesFilters(event({ start_date: '2026-12-31', end_date: '2027-01-05' }), window_))
      .toBe(true)
    expect(matchesFilters(event({ start_date: '2026-11-01', end_date: '2026-12-01' }), window_))
      .toBe(true)
  })
})

describe('matchesFilters — scope', () => {
  it('separates community from personal', () => {
    const community = event({ start_date: '2026-12-10', end_date: '2026-12-10', visibility: 'community' })
    const personal = event({ start_date: '2026-12-10', end_date: '2026-12-10', visibility: 'private' })
    expect(matchesFilters(community, { ...window_, scope: 'community' })).toBe(true)
    expect(matchesFilters(personal, { ...window_, scope: 'community' })).toBe(false)
    expect(matchesFilters(personal, { ...window_, scope: 'personal' })).toBe(true)
    expect(matchesFilters(community, { ...window_, scope: 'personal' })).toBe(false)
    expect(matchesFilters(community, { ...window_, scope: 'all' })).toBe(true)
  })
})

describe('matchesFilters — categories', () => {
  it('keeps only the selected categories', () => {
    const e = event({ start_date: '2026-12-10', end_date: '2026-12-10', category_id: 'cat-exam' })
    expect(matchesFilters(e, { ...window_, categoryIds: ['cat-exam'] })).toBe(true)
    expect(matchesFilters(e, { ...window_, categoryIds: ['cat-holiday'] })).toBe(false)
  })

  it('excludes uncategorised events when a category filter is on', () => {
    const e = event({ start_date: '2026-12-10', end_date: '2026-12-10', category_id: null })
    expect(matchesFilters(e, { ...window_, categoryIds: ['cat-exam'] })).toBe(false)
    expect(matchesFilters(e, window_)).toBe(true)
  })
})

describe('matchesFilters — search', () => {
  it('matches title and description, case-insensitively', () => {
    const e = event({
      start_date: '2026-12-10', end_date: '2026-12-10',
      title: 'Late Start', description: 'no students in school until 10 a.m.',
    })
    expect(matchesFilters(e, { ...window_, search: 'late' })).toBe(true)
    expect(matchesFilters(e, { ...window_, search: 'LATE START' })).toBe(true)
    expect(matchesFilters(e, { ...window_, search: 'students' })).toBe(true)
    expect(matchesFilters(e, { ...window_, search: 'exam' })).toBe(false)
  })
})
