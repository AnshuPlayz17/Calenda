import { describe, expect, it } from 'vitest'
import { assignmentToItem, mergeCalendarItems } from '@/features/assignments/toCalendarItem'
import type { Assignment, EventCategory, EventWithCategory } from '@/lib/types'

const category: EventCategory = {
  id: 'cat-assignment', slug: 'assignment', name: 'Assignment',
  color_token: 'cat-assignment', icon: null, sort_order: 60,
}

function assignment(over: Partial<Assignment> = {}): Assignment {
  return {
    id: 'a1', class_id: 'c1', owner_id: 'u1', title: 'Recursion lab',
    description: null, due_at: null, due_all_day: true, priority: 'normal',
    status: 'not_started', estimated_minutes: null, event_id: null,
    completed_at: null, shared_with_parents: false,
    created_at: '', updated_at: '',
    ...over,
  }
}

describe('assignmentToItem', () => {
  it('places the assignment on its due day', () => {
    // 11:59pm local on Oct 20.
    const due = new Date(2026, 9, 20, 23, 59).toISOString()
    const item = assignmentToItem(assignment({ due_at: due }), category)
    expect(item?.start_date).toBe('2026-10-20')
    expect(item?.end_date).toBe('2026-10-20')
  })

  it('does not spill an end-of-day deadline into the next day', () => {
    // The classic bug: 23:59 stored as UTC would land on the 21st in some
    // zones. It must stay on the day the student sees it as due.
    const due = new Date(2026, 9, 20, 23, 59).toISOString()
    expect(assignmentToItem(assignment({ due_at: due }), category)?.start_date)
      .toBe('2026-10-20')
  })

  it('skips an assignment with no due date rather than inventing one', () => {
    expect(assignmentToItem(assignment({ due_at: null }), category)).toBeNull()
  })

  it('is always private, whatever the class', () => {
    const due = new Date(2026, 9, 20, 23, 59).toISOString()
    expect(assignmentToItem(assignment({ due_at: due }), category)?.visibility).toBe('private')
  })

  it('carries the assignment id so the calendar can open it', () => {
    const due = new Date(2026, 9, 20, 23, 59).toISOString()
    const item = assignmentToItem(assignment({ due_at: due }), category)
    expect(item?.assignmentId).toBe('a1')
    // The synthetic row id must not collide with a real event id.
    expect(item?.id).toBe('assignment:a1')
  })

  it('keeps the time for a timed deadline', () => {
    const due = new Date(2026, 9, 20, 15, 0).toISOString()
    const item = assignmentToItem(assignment({ due_at: due, due_all_day: false }), category)
    expect(item?.is_all_day).toBe(false)
    expect(item?.start_at).toBe(due)
  })
})

describe('mergeCalendarItems', () => {
  const event: EventWithCategory = {
    id: 'e1', school_year_id: 'y1', category_id: null, series_id: null, owner_id: 'u1',
    title: 'PA Day', description: null, location: null, priority: 0,
    is_all_day: true, start_date: '2026-10-19', end_date: '2026-10-19',
    start_at: null, end_at: null, visibility: 'community', status: 'approved',
    shared_with_parents: false, approved_by: null, approved_at: null, review_note: null,
    source: 'pdf_import', content_hash: '', created_at: '', updated_at: '', category: null,
  }

  it('interleaves events and assignments in date order', () => {
    const due = new Date(2026, 9, 20, 23, 59).toISOString()
    const merged = mergeCalendarItems([event], [assignment({ due_at: due })], category)
    expect(merged.map((m) => m.start_date)).toEqual(['2026-10-19', '2026-10-20'])
  })

  it('drops assignments with no deadline', () => {
    const merged = mergeCalendarItems([event], [assignment({ due_at: null })], category)
    expect(merged).toHaveLength(1)
  })
})
