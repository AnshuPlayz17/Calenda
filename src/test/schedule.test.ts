import { describe, expect, it } from 'vitest'
import {
  awayLabel, clockLabel, cycleDayFor, dayBounds, meetingsOn, minutesOf, nextUp,
} from '@/features/timetable/schedule'
import type { MeetingWithClass } from '@/lib/types'

let seq = 0
function meeting(over: Partial<MeetingWithClass> = {}): MeetingWithClass {
  seq++
  return {
    id: `m${seq}`,
    class_id: 'c1',
    owner_id: 'o1',
    day_of_week: 1,
    cycle_day: null,
    starts_at: '09:00:00',
    ends_at: '10:00:00',
    room: null,
    label: null,
    created_at: '2026-09-01T00:00:00Z',
    updated_at: '2026-09-01T00:00:00Z',
    className: 'Functions',
    courseCode: 'MCR3U',
    classRoom: null,
    colorToken: null,
    ...over,
  }
}

describe('minutesOf / clockLabel', () => {
  it('reads a Postgres time', () => {
    expect(minutesOf('08:50:00')).toBe(530)
    expect(minutesOf('00:00:00')).toBe(0)
    expect(minutesOf('23:59:00')).toBe(1439)
  })

  it('reads a time with no seconds, which is what an input gives you', () => {
    expect(minutesOf('13:20')).toBe(800)
  })

  it('renders noon and midnight without calling either of them zero', () => {
    expect(clockLabel('12:00:00')).toBe('12:00pm')
    expect(clockLabel('00:30:00')).toBe('12:30am')
    expect(clockLabel('13:20:00')).toBe('1:20pm')
    expect(clockLabel('08:50:00')).toBe('8:50am')
  })
})

describe('cycleDayFor', () => {
  // 2026-09-03 is a Thursday.
  const anchor = '2026-09-03'

  it('is the anchor day on the anchor date', () => {
    expect(cycleDayFor(anchor, anchor, 1, 6)).toBe(1)
    expect(cycleDayFor(anchor, anchor, 4, 6)).toBe(4)
  })

  it('advances one per weekday', () => {
    expect(cycleDayFor('2026-09-04', anchor, 1, 6)).toBe(2) // Friday
  })

  it('does not advance across a weekend', () => {
    // Friday is Day 2, so the following Monday is Day 3 -- not Day 5.
    expect(cycleDayFor('2026-09-07', anchor, 1, 6)).toBe(3) // Monday
  })

  it('wraps at the end of the cycle', () => {
    // Thu 1, Fri 2, Mon 3, Tue 4, Wed 5, Thu 6, Fri -> back to 1.
    expect(cycleDayFor('2026-09-11', anchor, 1, 6)).toBe(1)
  })

  it('is null on a weekend, because there is no school day to number', () => {
    expect(cycleDayFor('2026-09-05', anchor, 1, 6)).toBeNull() // Saturday
    expect(cycleDayFor('2026-09-06', anchor, 1, 6)).toBeNull() // Sunday
  })

  it('handles a date before the anchor without producing Day -2', () => {
    // JavaScript's % keeps the sign of the dividend, which is the entire
    // reason there are two modulos in the implementation.
    expect(cycleDayFor('2026-09-02', anchor, 1, 6)).toBe(6) // Wednesday before
    expect(cycleDayFor('2026-09-01', anchor, 1, 6)).toBe(5) // Tuesday before
  })

  it('is null when the school does not run a cycle', () => {
    expect(cycleDayFor('2026-09-07', null, null, null)).toBeNull()
    expect(cycleDayFor('2026-09-07', anchor, 1, null)).toBeNull()
    expect(cycleDayFor('2026-09-07', null, 1, 6)).toBeNull()
    expect(cycleDayFor('2026-09-07', anchor, null, 6)).toBeNull()
  })

  it('never returns zero or a number past the cycle length', () => {
    for (let d = 1; d <= 28; d++) {
      const date = `2026-09-${String(d).padStart(2, '0')}`
      const got = cycleDayFor(date, anchor, 1, 6)
      if (got === null) continue
      expect(got).toBeGreaterThanOrEqual(1)
      expect(got).toBeLessThanOrEqual(6)
    }
  })
})

describe('meetingsOn', () => {
  it('picks the weekday rows for that weekday', () => {
    const mon = meeting({ day_of_week: 1 })
    const tue = meeting({ day_of_week: 2 })
    expect(meetingsOn([mon, tue], 1, null).map((m) => m.id)).toEqual([mon.id])
  })

  it('picks cycle rows by cycle day', () => {
    const d3 = meeting({ day_of_week: null, cycle_day: 3 })
    const d4 = meeting({ day_of_week: null, cycle_day: 4 })
    expect(meetingsOn([d3, d4], 1, 3).map((m) => m.id)).toEqual([d3.id])
  })

  it('returns both kinds together, because a school mid-switch has both', () => {
    // Dropping either would silently empty half of somebody's week.
    const weekday = meeting({ day_of_week: 1, starts_at: '09:00:00' })
    const cycle = meeting({ day_of_week: null, cycle_day: 3, starts_at: '11:00:00' })
    expect(meetingsOn([cycle, weekday], 1, 3).map((m) => m.id))
      .toEqual([weekday.id, cycle.id])
  })

  it('ignores cycle rows when the day has no cycle number', () => {
    const cycle = meeting({ day_of_week: null, cycle_day: 3 })
    expect(meetingsOn([cycle], 1, null)).toEqual([])
  })

  it('sorts by start time', () => {
    const late = meeting({ starts_at: '13:20:00' })
    const early = meeting({ starts_at: '08:50:00' })
    expect(meetingsOn([late, early], 1, null).map((m) => m.id)).toEqual([early.id, late.id])
  })
})

describe('nextUp', () => {
  const first = meeting({ starts_at: '08:50:00', ends_at: '10:05:00', className: 'Functions' })
  const second = meeting({ starts_at: '13:20:00', ends_at: '14:35:00', className: 'CS' })

  it('finds the next one before the day starts', () => {
    const got = nextUp([first, second], minutesOf('08:00'))
    expect(got?.meeting.className).toBe('Functions')
    expect(got?.now).toBe(false)
    expect(got?.minutesAway).toBe(50)
  })

  it('reports the one running rather than the one after it', () => {
    const got = nextUp([first, second], minutesOf('09:30'))
    expect(got?.meeting.className).toBe('Functions')
    expect(got?.now).toBe(true)
  })

  it('treats the end time as over, not still running', () => {
    // Standing outside the room at 10:05 is not being in the lesson.
    const got = nextUp([first, second], minutesOf('10:05'))
    expect(got?.meeting.className).toBe('CS')
    expect(got?.now).toBe(false)
  })

  it('is null once the day is done', () => {
    // A dashboard saying "next: Functions" at eleven at night, meaning
    // tomorrow, is worse than one that says nothing.
    expect(nextUp([first, second], minutesOf('23:00'))).toBeNull()
  })

  it('is null when there is nothing on', () => {
    expect(nextUp([], minutesOf('09:00'))).toBeNull()
  })
})

describe('awayLabel', () => {
  const m = meeting()
  it('says now while it is running', () => {
    expect(awayLabel({ meeting: m, now: true, minutesAway: -10 })).toBe('now')
  })
  it('counts minutes under an hour', () => {
    expect(awayLabel({ meeting: m, now: false, minutesAway: 20 })).toBe('in 20 minutes')
  })
  it('does not say "in 1 minutes"', () => {
    expect(awayLabel({ meeting: m, now: false, minutesAway: 1 })).toBe('in a minute')
  })
  it('breaks an hour out', () => {
    expect(awayLabel({ meeting: m, now: false, minutesAway: 65 })).toBe('in 1 hour 5 min')
    expect(awayLabel({ meeting: m, now: false, minutesAway: 120 })).toBe('in 2 hours')
  })
})

describe('dayBounds', () => {
  it('rounds out to whole hours so the row labels are not 8:50, 9:50', () => {
    const got = dayBounds([meeting({ starts_at: '08:50:00', ends_at: '14:35:00' })])
    expect(got).toEqual({ from: 8 * 60, to: 15 * 60 })
  })

  it('has a sensible default for an empty timetable', () => {
    expect(dayBounds([])).toEqual({ from: 8 * 60, to: 16 * 60 })
  })

  it('spans every meeting given, not just the first', () => {
    const got = dayBounds([
      meeting({ starts_at: '10:00:00', ends_at: '11:00:00' }),
      meeting({ starts_at: '07:30:00', ends_at: '08:00:00' }),
      meeting({ starts_at: '15:10:00', ends_at: '16:20:00' }),
    ])
    expect(got).toEqual({ from: 7 * 60, to: 17 * 60 })
  })
})
