import { describe, expect, it } from 'vitest'
import { icsFilename, toIcs } from '@/features/calendar/ics'
import type { EventWithCategory } from '@/lib/types'

/**
 * The export, which is the thing standing between somebody and their year if
 * this project ever stops being maintained.
 *
 * Most of what is checked here is the class of bug that only appears on
 * somebody else's machine: an all-day event a day short, a file Outlook
 * rejects over line endings, a description that swallows every line after it.
 */

let seq = 0
function event(over: Partial<EventWithCategory> = {}): EventWithCategory {
  seq++
  return {
    id: `e${seq}`,
    school_year_id: 'y1',
    category_id: null,
    series_id: null,
    owner_id: 'o1',
    title: `Event ${seq}`,
    description: null,
    location: null,
    priority: 'normal',
    is_all_day: true,
    start_date: '2026-10-20',
    end_date: '2026-10-20',
    start_at: null,
    end_at: null,
    visibility: 'private',
    status: 'approved',
    shared_with_parents: false,
    approved_by: null,
    approved_at: null,
    review_note: null,
    source: 'manual',
    content_hash: 'h',
    created_at: '2026-09-01T00:00:00Z',
    updated_at: '2026-09-01T00:00:00Z',
    category: null,
    ...over,
  } as EventWithCategory
}

describe('toIcs', () => {
  it('wraps events in a calendar a parser will accept', () => {
    const out = toIcs([event()])
    expect(out).toContain('BEGIN:VCALENDAR')
    expect(out).toContain('VERSION:2.0')
    expect(out).toContain('BEGIN:VEVENT')
    expect(out).toContain('END:VEVENT')
    expect(out.trimEnd().endsWith('END:VCALENDAR')).toBe(true)
  })

  it('uses CRLF everywhere, because bare newlines are rejected by real clients', () => {
    const out = toIcs([event()])
    // Every newline in the file must be preceded by a carriage return.
    expect(out.match(/(?<!\r)\n/)).toBeNull()
  })

  it('ends an all-day event on the FOLLOWING day, because DTEND is exclusive', () => {
    // The bug this prevents: every exported holiday one day short, so a break
    // that runs to the 3rd reads as ending on the 2nd.
    const out = toIcs([event({ start_date: '2026-12-20', end_date: '2027-01-03' })])
    expect(out).toContain('DTSTART;VALUE=DATE:20261220')
    expect(out).toContain('DTEND;VALUE=DATE:20270104')
  })

  it('handles a single all-day event the same way', () => {
    const out = toIcs([event({ start_date: '2026-10-20', end_date: '2026-10-20' })])
    expect(out).toContain('DTEND;VALUE=DATE:20261021')
  })

  it('crosses a month and a year boundary correctly', () => {
    const out = toIcs([event({ start_date: '2026-12-31', end_date: '2026-12-31' })])
    expect(out).toContain('DTEND;VALUE=DATE:20270101')
  })

  it('writes timed events as instants', () => {
    const out = toIcs([event({
      is_all_day: false,
      start_at: '2026-10-20T18:00:00.000Z',
      end_at: '2026-10-20T20:30:00.000Z',
    })])
    expect(out).toContain('DTSTART:20261020T180000Z')
    expect(out).toContain('DTEND:20261020T203000Z')
  })

  it('falls back to the start when a timed event has no end', () => {
    const out = toIcs([event({
      is_all_day: false, start_at: '2026-10-20T18:00:00.000Z', end_at: null,
    })])
    expect(out).toContain('DTEND:20261020T180000Z')
  })

  it('escapes the characters that are separators in this format', () => {
    const out = toIcs([event({ title: 'Maths, Physics; and a \\ backslash' })])
    expect(out).toContain('SUMMARY:Maths\\, Physics\\; and a \\\\ backslash')
  })

  it('escapes a newline rather than letting it end the property', () => {
    // An unescaped newline does not corrupt one line, it corrupts every line
    // after it -- the parser reads the rest of the description as properties.
    const out = toIcs([event({ description: 'line one\nline two' })])
    expect(out).toContain('DESCRIPTION:line one\\nline two')
    expect(out).not.toContain('DESCRIPTION:line one\r\nline two')
  })

  it('folds long lines, counting bytes rather than characters', () => {
    const out = toIcs([event({ title: 'A'.repeat(200) })])
    for (const line of out.split('\r\n')) {
      expect(new TextEncoder().encode(line).length).toBeLessThanOrEqual(75)
    }
  })

  it('folds correctly when the long line is made of multi-byte characters', () => {
    // An emoji is four octets. Folding by character length produces lines that
    // look legal and are not.
    const out = toIcs([event({ title: '🎓'.repeat(60) })])
    for (const line of out.split('\r\n')) {
      expect(new TextEncoder().encode(line).length).toBeLessThanOrEqual(75)
    }
  })

  it('gives every event a unique id, so a re-import updates rather than duplicates', () => {
    const out = toIcs([event({ id: 'aaa' }), event({ id: 'bbb' })])
    expect(out).toContain('UID:aaa@calenda.app')
    expect(out).toContain('UID:bbb@calenda.app')
  })

  it('exports no reminders, deliberately', () => {
    // Calenda's scheduler knows the reader's quiet hours and timezone. A second
    // dumber copy in another calendar means being woken twice.
    expect(toIcs([event()])).not.toContain('BEGIN:VALARM')
  })

  it('produces a valid empty calendar rather than nothing', () => {
    const out = toIcs([])
    expect(out).toContain('BEGIN:VCALENDAR')
    expect(out).toContain('END:VCALENDAR')
    expect(out).not.toContain('BEGIN:VEVENT')
  })
})

describe('icsFilename', () => {
  it('is findable in a downloads folder', () => {
    expect(icsFilename('2026–27')).toMatch(/^calenda-.*\.ics$/)
  })

  it('strips anything a filesystem would object to', () => {
    expect(icsFilename('2026/27 <term>')).toBe('calenda-2026-27-term.ics')
  })

  it('has an answer when there is no year', () => {
    expect(icsFilename(null)).toBe('calenda-calendar.ics')
  })
})
