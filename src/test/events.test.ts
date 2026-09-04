import { describe, expect, it } from 'vitest'
import {
  contentHash, duplicateScore, formatPlainDate, gapBetween, normalizeTitle, spanDays,
} from '@/lib/events'

// Real rows from the 2026-27 school calendar, chosen because they are the
// cases that break naive implementations.
const LATE_START = 'Late Start (no students in school until 10 a.m.)'

describe('normalizeTitle', () => {
  it('ignores case, punctuation and spacing', () => {
    expect(normalizeTitle('PA  Day!')).toBe('pa day')
    expect(normalizeTitle('PA Day')).toBe(normalizeTitle('pa day.'))
  })
})

describe('contentHash', () => {
  it('keeps the 16 identical Late Start entries distinct', () => {
    // Byte-identical titles, different dates: these are 16 separate events.
    const dates = ['2026-09-23', '2026-10-14', '2026-10-21', '2026-11-18']
    const hashes = new Set(dates.map((d) => contentHash(LATE_START, d)))
    expect(hashes.size).toBe(dates.length)
  })

  it('matches the same event written slightly differently', () => {
    expect(contentHash('PA Day', '2026-12-01')).toBe(contentHash('pa day.', '2026-12-01'))
  })
})

describe('formatPlainDate', () => {
  it('does not shift an all-day date across a timezone boundary', () => {
    // new Date('2026-10-12') is UTC midnight and renders as Oct 11 in Toronto.
    expect(formatPlainDate('2026-10-12')).toContain('12')
    expect(formatPlainDate('2026-10-12')).toContain('October')
  })

  it('handles the first of a month, where off-by-one bugs surface', () => {
    expect(formatPlainDate('2027-01-01')).toContain('1')
    expect(formatPlainDate('2027-01-01')).toContain('January')
  })
})

describe('spanDays', () => {
  it('counts inclusively', () => {
    expect(spanDays('2026-12-21', '2026-12-31')).toBe(11) // Winter Break, part 1
    expect(spanDays('2027-01-01', '2027-01-03')).toBe(3)  // Winter Break, part 2
    expect(spanDays('2026-09-08', '2026-09-08')).toBe(1)
  })

  it('spans a year boundary', () => {
    expect(spanDays('2026-12-21', '2027-01-03')).toBe(14)
  })
})

describe('gapBetween', () => {
  it('reports zero for overlapping and for consecutive ranges', () => {
    expect(gapBetween('2026-12-21', '2026-12-31', '2026-12-30', '2027-01-03')).toBe(0)
    // Dec 31 then Jan 1: nothing lies between them.
    expect(gapBetween('2026-12-21', '2026-12-31', '2027-01-01', '2027-01-03')).toBe(0)
  })

  it('measures real separation regardless of argument order', () => {
    expect(gapBetween('2026-09-23', '2026-09-23', '2026-10-14', '2026-10-14')).toBe(20)
    expect(gapBetween('2026-10-14', '2026-10-14', '2026-09-23', '2026-09-23')).toBe(20)
  })
})

describe('duplicateScore', () => {
  it('does not treat two different Late Starts as duplicates', () => {
    const score = duplicateScore(
      { title: LATE_START, startDate: '2026-09-23', endDate: '2026-09-23' },
      { title: LATE_START, startDate: '2026-10-14', endDate: '2026-10-14' },
    )
    expect(score).toBeLessThan(0.5)
  })

  it('flags the two Winter Break entries for review without merging them', () => {
    // The source records one break as two entries because it groups by month.
    // They are adjacent, not overlapping, and must be surfaced -- but never
    // merged automatically, so the score stays below an exact match.
    const score = duplicateScore(
      { title: 'Winter Break', startDate: '2026-12-21', endDate: '2026-12-31' },
      { title: 'Winter Break', startDate: '2027-01-01', endDate: '2027-01-03' },
    )
    expect(score).toBeGreaterThan(0.5)
    expect(score).toBeLessThan(1)
  })

  it('separates adjacency from mere title equality', () => {
    // Both pairs share a title. Only the adjacent pair is a merge candidate.
    const adjacent = duplicateScore(
      { title: 'Winter Break', startDate: '2026-12-21', endDate: '2026-12-31' },
      { title: 'Winter Break', startDate: '2027-01-01', endDate: '2027-01-03' },
    )
    const apart = duplicateScore(
      { title: LATE_START, startDate: '2026-09-23', endDate: '2026-09-23' },
      { title: LATE_START, startDate: '2026-10-14', endDate: '2026-10-14' },
    )
    expect(adjacent).toBeGreaterThan(apart)
  })

  it('reports an exact match only when title and start date both agree', () => {
    expect(
      duplicateScore(
        { title: 'PA Day', startDate: '2026-12-01', endDate: '2026-12-01' },
        { title: 'PA Day', startDate: '2026-12-01', endDate: '2026-12-01' },
      ),
    ).toBe(1)
  })
})
