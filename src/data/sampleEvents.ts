import { addDays, todayPlain } from '@/lib/datetime'
import type { SeedEvent } from './schoolCalendar'

/**
 * Invented events for the landing page's screenshots.
 *
 * The page used to show the real 2026-27 school calendar here. That was
 * accurate but confusing: someone arriving at the page has not signed up, so
 * a list of genuine dates looked like a feed they were already reading rather
 * than a picture of what the app does with their own.
 *
 * These are made up, and deliberately mixed -- school-wide dates next to the
 * kind of personal deadline you would add yourself -- because that mixture is
 * the thing being demonstrated. Nothing here is a real University of Toronto
 * Schools date, and nothing on the page says it is.
 *
 * Offsets from today rather than fixed dates, so a mockup of "coming up"
 * always shows dates that are actually coming up, in any school year.
 */
function at(offset: number, event: Omit<SeedEvent, 'startDate' | 'endDate'> & { days?: number }): SeedEvent {
  const startDate = addDays(todayPlain(), offset)
  const { days = 1, ...rest } = event
  return { ...rest, startDate, endDate: addDays(startDate, days - 1) }
}

/** The hero card: a week or two of a term, as it would actually look. */
export function sampleUpcoming(): SeedEvent[] {
  return [
    at(3, { title: 'Physics unit test', description: 'Kinematics and forces', category: 'exam' }),
    at(5, { title: 'Cross country meet', description: 'Leaving at 3:15 p.m.', category: 'sports' }),
    at(9, { title: 'English essay draft', description: 'Comparative — 1200 words', category: 'assignment' }),
    at(12, { title: 'PD Day', description: 'no students in school', category: 'pa-day' }),
    at(17, { title: 'Fall concert', description: 'Senior band, 7 p.m.', category: 'performance' }),
  ]
}

/** The tour's calendar panel: the school's own dates, after an import. */
export function sampleImported(): SeedEvent[] {
  return [
    at(2, { title: 'Late start', description: 'no students until 10 a.m.', category: 'school' }),
    at(6, { title: 'Picture day', description: null, category: 'school' }),
    at(12, { title: 'PD Day', description: 'no students in school', category: 'pa-day' }),
    at(20, { title: 'Reports posted', description: null, category: 'academic' }),
    at(26, { title: 'Thanksgiving', description: null, category: 'holiday', days: 3 }),
  ]
}
