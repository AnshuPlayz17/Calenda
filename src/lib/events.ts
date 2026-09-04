/**
 * Event identity and all-day date handling.
 *
 * Both rules here come straight from the 2026-27 school calendar (see
 * docs/discovery/FINDINGS.md), which is a genuine stress test:
 *
 *   - "Late Start (no students in school until 10 a.m.)" appears 16 times,
 *     byte-identical, on 16 different dates. Matching on title alone would
 *     collapse all sixteen into one.
 *   - Winter Break is ONE break recorded as two entries -- Dec 21-31 and
 *     Jan 1-3 -- because the source groups by month. Matching on date alone
 *     would miss it.
 *
 * Those pull in opposite directions, which is why identity is the pair.
 */

/** Case, accents, punctuation and whitespace are all noise for matching. */
export function normalizeTitle(title: string): string {
  return title
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

/**
 * Stable identity for an event: normalised title AND start date.
 * Never the title on its own.
 */
export function contentHash(title: string, startDate: string): string {
  return `${normalizeTitle(title)}::${startDate}`
}

/** A calendar date with no time and no zone, as `YYYY-MM-DD`. */
export type PlainDate = string

const PLAIN_DATE = /^\d{4}-\d{2}-\d{2}$/

export function isPlainDate(value: string): value is PlainDate {
  return PLAIN_DATE.test(value)
}

/**
 * Formats an all-day date for display WITHOUT going through Date's timezone
 * handling. `new Date('2026-10-12')` is parsed as UTC midnight, which renders
 * as October 11 anywhere west of UTC -- the exact bug this avoids.
 */
export function formatPlainDate(
  date: PlainDate,
  options: Intl.DateTimeFormatOptions = { month: 'long', day: 'numeric', year: 'numeric' },
  locale = 'en-CA',
): string {
  const [y, m, d] = date.split('-').map(Number)
  if (!y || !m || !d) throw new Error(`Not a plain date: ${date}`)
  // Constructing in local time keeps the calendar day intact.
  return new Intl.DateTimeFormat(locale, options).format(new Date(y, m - 1, d))
}

/** Inclusive day count for a date range, so Dec 21-31 is 11 days, not 10. */
export function spanDays(start: PlainDate, end: PlainDate): number {
  const toUtc = (s: PlainDate) => {
    const [y, m, d] = s.split('-').map(Number)
    return Date.UTC(y!, m! - 1, d!)
  }
  return Math.round((toUtc(end) - toUtc(start)) / 86_400_000) + 1
}

/** True when two inclusive date ranges share at least one day. */
export function rangesOverlap(
  aStart: PlainDate, aEnd: PlainDate,
  bStart: PlainDate, bEnd: PlainDate,
): boolean {
  return aStart <= bEnd && bStart <= aEnd
}

/**
 * Days lying strictly between two ranges: 0 when they overlap or run
 * consecutively (Dec 31 then Jan 1), 20 for two Late Starts three weeks apart.
 *
 * Adjacency is what separates the two Winter Break entries (Dec 21-31 and
 * Jan 1-3, one break split by the source's month headings) from two unrelated
 * Late Starts a month apart. Without it both look identical to a matcher --
 * same title, different dates.
 */
export function gapBetween(
  aStart: PlainDate, aEnd: PlainDate,
  bStart: PlainDate, bEnd: PlainDate,
): number {
  if (rangesOverlap(aStart, aEnd, bStart, bEnd)) return 0
  // spanDays is inclusive of both endpoints, so both ends come off.
  return aEnd < bStart ? spanDays(aEnd, bStart) - 2 : spanDays(bEnd, aStart) - 2
}

/**
 * Whether two events are the same thing. Deliberately conservative: it reports
 * a likely match for review and never merges on its own.
 */
export function duplicateScore(
  a: { title: string; startDate: PlainDate; endDate: PlainDate },
  b: { title: string; startDate: PlainDate; endDate: PlainDate },
): number {
  const sameTitle = normalizeTitle(a.title) === normalizeTitle(b.title)
  const sameStart = a.startDate === b.startDate
  const gap = gapBetween(a.startDate, a.endDate, b.startDate, b.endDate)

  // Identity: same title on the same start date.
  if (sameTitle && sameStart) return 1
  // Same title, overlapping or consecutive -- one event recorded twice, as
  // the source does with Winter Break across the December/January boundary.
  // A one-day tolerance also absorbs a weekend split.
  if (sameTitle && gap <= 1) return 0.8
  // Same title but genuinely apart: 16 separate Late Starts, not duplicates.
  if (sameTitle) return 0.2
  if (sameStart) return 0.15
  return 0
}
