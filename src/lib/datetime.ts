/**
 * Calendar grid maths, all in plain dates.
 *
 * Nothing here converts a calendar day through a timestamp. `new Date('2026-10-12')`
 * parses as UTC midnight and formats as October 11 anywhere west of UTC, which
 * would shift every all-day event in the app by a day.
 */
import type { PlainDate } from './events'

export const WEEKDAY_LABELS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'] as const

/** Splits `YYYY-MM-DD` into its parts without touching Date. */
export function parts(date: PlainDate): { y: number; m: number; d: number } {
  const [y, m, d] = date.split('-').map(Number)
  if (!y || !m || !d) throw new Error(`Not a plain date: ${date}`)
  return { y, m, d }
}

/** Builds `YYYY-MM-DD`, normalising overflow (month 13 becomes January next year). */
export function plain(y: number, m: number, d: number): PlainDate {
  const dt = new Date(Date.UTC(y, m - 1, d))
  return dt.toISOString().slice(0, 10) as PlainDate
}

export function todayPlain(): PlainDate {
  const now = new Date()
  return plain(now.getFullYear(), now.getMonth() + 1, now.getDate())
}

export function addDays(date: PlainDate, days: number): PlainDate {
  const { y, m, d } = parts(date)
  return plain(y, m, d + days)
}

export function addMonths(date: PlainDate, months: number): PlainDate {
  const { y, m, d } = parts(date)
  // Clamp to the last day of the target month, so 31 Jan + 1 month is 28 Feb
  // rather than rolling into March.
  const target = new Date(Date.UTC(y, m - 1 + months, 1))
  const lastDay = new Date(Date.UTC(target.getUTCFullYear(), target.getUTCMonth() + 1, 0)).getUTCDate()
  return plain(target.getUTCFullYear(), target.getUTCMonth() + 1, Math.min(d, lastDay))
}

/** 0 = Sunday, matching WEEKDAY_LABELS. */
export function weekday(date: PlainDate): number {
  const { y, m, d } = parts(date)
  return new Date(Date.UTC(y, m - 1, d)).getUTCDay()
}

export function startOfWeek(date: PlainDate): PlainDate {
  return addDays(date, -weekday(date))
}

export function startOfMonth(date: PlainDate): PlainDate {
  const { y, m } = parts(date)
  return plain(y, m, 1)
}

export function endOfMonth(date: PlainDate): PlainDate {
  const { y, m } = parts(date)
  return plain(y, m + 1, 0)
}

export function isSameMonth(a: PlainDate, b: PlainDate): boolean {
  return a.slice(0, 7) === b.slice(0, 7)
}

/**
 * The six-week grid a month view draws: always 42 cells, so the calendar does
 * not change height from month to month.
 */
export function monthGrid(anchor: PlainDate): PlainDate[] {
  const first = startOfWeek(startOfMonth(anchor))
  return Array.from({ length: 42 }, (_, i) => addDays(first, i))
}

export function weekGrid(anchor: PlainDate): PlainDate[] {
  const first = startOfWeek(anchor)
  return Array.from({ length: 7 }, (_, i) => addDays(first, i))
}

const MONTHS = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
]

export function monthLabel(date: PlainDate): string {
  const { y, m } = parts(date)
  return `${MONTHS[m - 1]} ${y}`
}

export function dayNumber(date: PlainDate): number {
  return parts(date).d
}

/** `Mon 12 Oct` style, for agenda headers. */
export function agendaLabel(date: PlainDate): string {
  const { y, m, d } = parts(date)
  return new Intl.DateTimeFormat('en-CA', {
    weekday: 'short', day: 'numeric', month: 'short',
  }).format(new Date(y, m - 1, d))
}

/**
 * The school's zone, and the default for every profile.
 *
 * Times are read and written in the profile's zone rather than the browser's,
 * because that is the zone the reminder scheduler uses in SQL. A parent opening
 * the app from another province should see the 3:30 p.m. their child's school
 * means, and the same 3:30 the reminder will quote.
 */
export const SCHOOL_TIME_ZONE = 'America/Toronto'

/** Renders a timed event's clock, e.g. `5:30 p.m.` */
export function timeLabel(iso: string, timeZone: string = SCHOOL_TIME_ZONE): string {
  return new Intl.DateTimeFormat('en-CA', {
    hour: 'numeric', minute: '2-digit', hour12: true, timeZone,
  }).format(new Date(iso))
}

/** How far `timeZone` is from UTC at a given instant, in milliseconds. */
function offsetAt(utcMs: number, timeZone: string): number {
  const p = Object.fromEntries(
    new Intl.DateTimeFormat('en-US', {
      timeZone, hour12: false,
      year: 'numeric', month: '2-digit', day: '2-digit',
      hour: '2-digit', minute: '2-digit', second: '2-digit',
    })
      .formatToParts(new Date(utcMs))
      .map((part) => [part.type, part.value]),
  ) as Record<string, string>

  // hourCycle h23 still renders midnight as '24' in some engines.
  const asIfUtc = Date.UTC(
    Number(p.year), Number(p.month) - 1, Number(p.day),
    Number(p.hour) % 24, Number(p.minute), Number(p.second),
  )
  return asIfUtc - utcMs
}

/**
 * Combines a plain date and `HH:mm` into an instant, reading the clock in
 * `timeZone` rather than wherever the browser happens to be.
 *
 * Two passes: the offset depends on the instant, and the instant depends on
 * the offset. Guessing with the offset at the UTC-interpreted time lands within
 * a day of the answer, which is close enough that the second pass is exact
 * everywhere except inside a DST gap.
 */
export function toInstant(
  date: PlainDate,
  time: string,
  timeZone: string = SCHOOL_TIME_ZONE,
): string {
  const { y, m, d } = parts(date)
  const [hh, mm] = time.split(':').map(Number)
  const wall = Date.UTC(y, m - 1, d, hh ?? 0, mm ?? 0)
  const firstPass = wall - offsetAt(wall, timeZone)
  return new Date(wall - offsetAt(firstPass, timeZone)).toISOString()
}
