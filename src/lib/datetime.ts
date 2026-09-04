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

/** Renders a timed event's clock, e.g. `5:30 p.m.` */
export function timeLabel(iso: string, timeZone?: string): string {
  return new Intl.DateTimeFormat('en-CA', {
    hour: 'numeric', minute: '2-digit', hour12: true, timeZone,
  }).format(new Date(iso))
}

/**
 * Combines a plain date and `HH:mm` into an instant in the user's zone.
 * Used only when an event is explicitly timed.
 */
export function toInstant(date: PlainDate, time: string): string {
  const { y, m, d } = parts(date)
  const [hh, mm] = time.split(':').map(Number)
  return new Date(y, m - 1, d, hh ?? 0, mm ?? 0).toISOString()
}
