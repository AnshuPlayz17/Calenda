import { describe, expect, it } from 'vitest'
import { toPlainRange } from '@/lib/google'
import type { GoogleEvent } from '@/lib/google'

function allDay(start: string, end?: string): GoogleEvent {
  return { id: 'g1', summary: 'Test', start: { date: start }, ...(end ? { end: { date: end } } : {}) }
}

describe('all-day events', () => {
  it('converts Google\'s exclusive end date to an inclusive one', () => {
    // Google represents a ONE-day event on Oct 12 as start 10-12, end 10-13.
    // Taking that end verbatim makes every imported all-day event a day too long.
    expect(toPlainRange(allDay('2026-10-12', '2026-10-13'))).toEqual({
      isAllDay: true, startDate: '2026-10-12', endDate: '2026-10-12',
    })
  })

  it('converts a multi-day range', () => {
    // Winter Break, Dec 21-31 inclusive, is end 2027-01-01 in Google.
    expect(toPlainRange(allDay('2026-12-21', '2027-01-01'))).toEqual({
      isAllDay: true, startDate: '2026-12-21', endDate: '2026-12-31',
    })
  })

  it('handles a range ending on the first of a month', () => {
    expect(toPlainRange(allDay('2027-02-25', '2027-03-01'))?.endDate).toBe('2027-02-28')
  })

  it('handles a leap day', () => {
    expect(toPlainRange(allDay('2028-02-28', '2028-03-01'))?.endDate).toBe('2028-02-29')
  })

  it('falls back to a single day when Google omits the end', () => {
    expect(toPlainRange(allDay('2026-09-08'))).toEqual({
      isAllDay: true, startDate: '2026-09-08', endDate: '2026-09-08',
    })
  })

  it('never produces a range that runs backwards', () => {
    // Malformed data must not render as a negative-length event.
    const r = toPlainRange(allDay('2026-10-12', '2026-10-12'))
    expect(r?.endDate).toBe('2026-10-12')
    expect(r!.endDate >= r!.startDate).toBe(true)
  })
})

describe('timed events', () => {
  it('keeps the day the event falls on', () => {
    const r = toPlainRange({
      id: 'g2', summary: 'Curriculum Night',
      start: { dateTime: '2026-09-22T17:30:00-04:00' },
      end: { dateTime: '2026-09-22T20:30:00-04:00' },
    })
    expect(r?.isAllDay).toBe(false)
    expect(r?.startDate).toBe('2026-09-22')
  })

  it('falls back to the start when the end is missing', () => {
    const r = toPlainRange({
      id: 'g3', start: { dateTime: '2026-09-22T17:30:00-04:00' },
    })
    expect(r?.startDate).toBe(r?.endDate)
  })
})

describe('unusable events', () => {
  it('returns null rather than inventing a date', () => {
    expect(toPlainRange({ id: 'g4', summary: 'No date' })).toBeNull()
    expect(toPlainRange({ id: 'g5', summary: 'Empty', start: {} })).toBeNull()
  })
})
