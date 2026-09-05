/**
 * The reminder said "In 1 day(s): Test".
 *
 * Two things wrong with that. It read like a placeholder, and it was built
 * from the offset rather than the date -- so a reminder held back by quiet
 * hours until the next morning still claimed there was a day to go.
 */
import { describe, expect, it } from 'vitest'
import { leadIn } from '../../supabase/functions/notify-dispatch/leadIn.ts'

// 9 a.m. in Toronto on a Monday, as the instant a dispatcher would run at.
const NOW = new Date('2026-09-07T13:00:00Z')

describe('leadIn', () => {
  it('never says "day(s)"', () => {
    for (const minutes of [30, 60, 180, 720, 1440, 4320, 10080]) {
      expect(leadIn('', minutes, NOW)).not.toMatch(/\(s\)/)
    }
  })

  it('names the day rather than counting to it', () => {
    expect(leadIn('2026-09-07', 1440, NOW)).toBe('Today')
    expect(leadIn('2026-09-08', 1440, NOW)).toBe('Tomorrow')
    expect(leadIn('2026-09-10', 4320, NOW)).toBe('In 3 days')
    expect(leadIn('2026-09-14', 10080, NOW)).toBe('In 1 week')
  })

  it('counts from the date, so a delayed reminder still tells the truth', () => {
    // Queued as "1 day before", but quiet hours held it until the morning of.
    // The offset still says 1440; the date says today, and the date wins.
    expect(leadIn('2026-09-07', 1440, NOW)).toBe('Today')
  })

  it('uses hours and minutes for a timed assignment due the same day', () => {
    expect(leadIn('2026-09-07T14:00:00Z', 60, NOW)).toBe('In 1 hour')
    expect(leadIn('2026-09-07T16:00:00Z', 180, NOW)).toBe('In 3 hours')
    expect(leadIn('2026-09-07T13:30:00Z', 30, NOW)).toBe('In 30 minutes')
    expect(leadIn('2026-09-07T13:01:00Z', 30, NOW)).toBe('In 1 minute')
  })

  it('rolls a timed deadline up to days once it is far enough out', () => {
    expect(leadIn('2026-09-09T20:00:00Z', 4320, NOW)).toBe('In 2 days')
  })

  it('says Now rather than a negative count for something already due', () => {
    expect(leadIn('2026-09-07T12:00:00Z', 60, NOW)).toBe('Now')
  })

  it('counts calendar days in the school zone, not 24-hour blocks', () => {
    // 11 p.m. Toronto on the 7th. An event on the 8th is tomorrow, even
    // though it is only an hour away -- and in UTC it is already the 8th.
    const lateEvening = new Date('2026-09-08T03:00:00Z')
    expect(leadIn('2026-09-08', 1440, lateEvening)).toBe('Tomorrow')
    expect(leadIn('2026-09-07', 1440, lateEvening)).toBe('Today')
  })

  it('falls back to the offset when the thing has no date', () => {
    expect(leadIn('', 1440, NOW)).toBe('Tomorrow')
    expect(leadIn('', 4320, NOW)).toBe('In 3 days')
    expect(leadIn('', 60, NOW)).toBe('In 1 hour')
    expect(leadIn('', 30, NOW)).toBe('In 30 minutes')
    expect(leadIn('', 10080, NOW)).toBe('In 1 week')
    expect(leadIn('', 20160, NOW)).toBe('In 2 weeks')
  })

  it('falls back rather than throwing on an unreadable date', () => {
    expect(leadIn('not a date', 1440, NOW)).toBe('Tomorrow')
    expect(leadIn('2026-13-45T99:99:99Z', 60, NOW)).toBe('In 1 hour')
  })

  it('reads as a sentence with the title after it', () => {
    expect(`${leadIn('2026-09-08', 1440, NOW)}: Physics unit test`)
      .toBe('Tomorrow: Physics unit test')
  })
})
