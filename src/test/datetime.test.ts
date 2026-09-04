import { describe, expect, it } from 'vitest'
import {
  addDays, addMonths, agendaLabel, dayNumber, endOfMonth, isSameMonth,
  monthGrid, monthLabel, parts, plain, startOfMonth, startOfWeek, weekday,
  weekGrid,
} from '@/lib/datetime'

describe('plain / parts', () => {
  it('round-trips', () => {
    expect(plain(2026, 10, 12)).toBe('2026-10-12')
    expect(parts('2026-10-12')).toEqual({ y: 2026, m: 10, d: 12 })
  })

  it('normalises overflow', () => {
    expect(plain(2026, 13, 1)).toBe('2027-01-01')
    expect(plain(2026, 12, 32)).toBe('2027-01-01')
    // Day 0 means "last day of the previous month".
    expect(plain(2026, 10, 0)).toBe('2026-09-30')
  })

  it('pads single digits', () => {
    expect(plain(2027, 1, 3)).toBe('2027-01-03')
  })
})

describe('addDays', () => {
  it('crosses month and year boundaries', () => {
    expect(addDays('2026-09-30', 1)).toBe('2026-10-01')
    expect(addDays('2026-12-31', 1)).toBe('2027-01-01')
    expect(addDays('2027-01-01', -1)).toBe('2026-12-31')
  })

  it('handles a leap day', () => {
    // 2028 is a leap year; 2027 is not.
    expect(addDays('2028-02-28', 1)).toBe('2028-02-29')
    expect(addDays('2027-02-28', 1)).toBe('2027-03-01')
  })

  it('is unaffected by daylight saving', () => {
    // DST in Toronto starts 2027-03-14. A naive local-time implementation
    // that adds 86,400,000 ms lands on the wrong day here.
    expect(addDays('2027-03-13', 1)).toBe('2027-03-14')
    expect(addDays('2027-03-14', 1)).toBe('2027-03-15')
    // ...and ends 2027-11-07.
    expect(addDays('2027-11-06', 1)).toBe('2027-11-07')
    expect(addDays('2027-11-07', 1)).toBe('2027-11-08')
  })
})

describe('addMonths', () => {
  it('clamps to the last day rather than rolling over', () => {
    // 31 Jan + 1 month must be 28 Feb, not 3 March.
    expect(addMonths('2027-01-31', 1)).toBe('2027-02-28')
    expect(addMonths('2028-01-31', 1)).toBe('2028-02-29')
    expect(addMonths('2026-10-31', 1)).toBe('2026-11-30')
  })

  it('steps backwards across a year boundary', () => {
    expect(addMonths('2027-01-15', -1)).toBe('2026-12-15')
    expect(addMonths('2026-09-08', -12)).toBe('2025-09-08')
  })
})

describe('weekday', () => {
  it('matches the real calendar', () => {
    expect(weekday('2026-09-08')).toBe(2) // First day of school, a Tuesday
    expect(weekday('2026-10-12')).toBe(1) // Thanksgiving, a Monday
    expect(weekday('2026-09-23')).toBe(3) // A Late Start, a Wednesday
    expect(weekday('2027-06-23')).toBe(3) // Last day, a Wednesday
  })
})

describe('startOfWeek', () => {
  it('rewinds to Sunday and is idempotent', () => {
    expect(startOfWeek('2026-10-14')).toBe('2026-10-11')
    expect(startOfWeek('2026-10-11')).toBe('2026-10-11')
  })
})

describe('startOfMonth / endOfMonth', () => {
  it('finds the real bounds, including February', () => {
    expect(startOfMonth('2026-10-14')).toBe('2026-10-01')
    expect(endOfMonth('2026-10-14')).toBe('2026-10-31')
    expect(endOfMonth('2027-02-10')).toBe('2027-02-28')
    expect(endOfMonth('2028-02-10')).toBe('2028-02-29')
  })
})

describe('monthGrid', () => {
  it('is always 42 cells, so the calendar never changes height', () => {
    for (const anchor of ['2026-09-15', '2027-02-10', '2026-11-01', '2027-05-31']) {
      expect(monthGrid(anchor)).toHaveLength(42)
    }
  })

  it('starts on a Sunday and runs consecutively', () => {
    const grid = monthGrid('2026-10-14')
    expect(weekday(grid[0]!)).toBe(0)
    for (let i = 1; i < grid.length; i++) {
      expect(grid[i]).toBe(addDays(grid[i - 1]!, 1))
    }
  })

  it('contains every day of the anchor month', () => {
    const grid = new Set(monthGrid('2027-02-10'))
    for (let d = 1; d <= 28; d++) expect(grid.has(plain(2027, 2, d))).toBe(true)
  })
})

describe('weekGrid', () => {
  it('is seven consecutive days from Sunday', () => {
    const week = weekGrid('2026-10-14')
    expect(week).toHaveLength(7)
    expect(week[0]).toBe('2026-10-11')
    expect(week[6]).toBe('2026-10-17')
  })
})

describe('labels', () => {
  it('names the month and day without shifting', () => {
    expect(monthLabel('2026-10-01')).toBe('October 2026')
    expect(monthLabel('2027-01-31')).toBe('January 2027')
    expect(dayNumber('2026-10-12')).toBe(12)
  })

  it('renders an agenda date on the correct day', () => {
    // The classic off-by-one: UTC-midnight parsing shows Oct 11 here.
    const label = agendaLabel('2026-10-12')
    expect(label).toContain('12')
    expect(label).toContain('Mon')
  })
})

describe('isSameMonth', () => {
  it('compares year and month, not just month', () => {
    expect(isSameMonth('2026-10-01', '2026-10-31')).toBe(true)
    expect(isSameMonth('2026-10-01', '2027-10-01')).toBe(false)
    expect(isSameMonth('2026-10-31', '2026-11-01')).toBe(false)
  })
})
