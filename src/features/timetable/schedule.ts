import type { MeetingWithClass } from '@/lib/types'

/**
 * Turning a timetable into "you have Functions in twenty minutes".
 *
 * All of it is pure and all of it takes the current moment as an argument,
 * because a function that reads the clock itself can only be tested at the
 * time of day it happens to be run -- and every interesting case here is about
 * a specific time of day.
 */

/** 'HH:MM:SS' or 'HH:MM' to minutes since midnight. */
export function minutesOf(time: string): number {
  const [h = 0, m = 0] = time.split(':').map(Number)
  return h * 60 + m
}

/** Minutes since midnight to 'H:MM am/pm', which is how a timetable reads. */
export function clockLabel(time: string): string {
  const total = minutesOf(time)
  const h24 = Math.floor(total / 60)
  const m = total % 60
  const h12 = h24 % 12 === 0 ? 12 : h24 % 12
  return `${h12}:${String(m).padStart(2, '0')}${h24 < 12 ? 'am' : 'pm'}`
}

export const DAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'] as const
export const DAY_SHORT = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'] as const

/** Days a school runs, which is the only reason a cycle advances. */
function isWeekday(d: Date): boolean {
  const day = d.getUTCDay()
  return day >= 1 && day <= 5
}

/**
 * Whole weekdays from `from` to `to`, signed.
 *
 * Counted rather than derived from a formula on purpose. The closed form for
 * weekdays between two dates is four lines of modular arithmetic that is wrong
 * at one boundary in a way nobody notices for a month, and a school year is
 * about two hundred iterations -- which is nothing, once, on a date change.
 */
function weekdaysBetween(from: string, to: string): number {
  if (from === to) return 0
  const forward = from < to
  const start = new Date(`${forward ? from : to}T00:00:00Z`)
  const end = new Date(`${forward ? to : from}T00:00:00Z`)
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) return 0

  let count = 0
  const cursor = new Date(start)
  while (cursor < end) {
    cursor.setUTCDate(cursor.getUTCDate() + 1)
    if (isWeekday(cursor)) count++
  }
  return forward ? count : -count
}

/**
 * Which day of a rotating cycle a date is, or null.
 *
 * Null means one of three honest things: this school does not run a cycle, we
 * have not been told where the cycle is, or the date is a weekend and there is
 * no school day to number.
 *
 * THE LIMIT, STATED
 *
 * This counts weekdays. Real cycles skip every day the school is closed, so a
 * single unexpected closure puts every subsequent day off by one for the rest
 * of the year. That is why the anchor is stored and re-settable: the timetable
 * says which day it thinks it is and offers "today is actually Day N", which
 * re-anchors in one tap by the only person who knows. Deriving school days from
 * the imported calendar sounds better and would be confidently wrong in a new
 * way every time that calendar was incomplete.
 */
export function cycleDayFor(
  date: string,
  anchor: string | null,
  anchorDay: number | null,
  cycleLength: number | null,
): number | null {
  if (!cycleLength || !anchor || !anchorDay) return null
  const d = new Date(`${date}T00:00:00Z`)
  if (Number.isNaN(d.getTime()) || !isWeekday(d)) return null

  const elapsed = weekdaysBetween(anchor, date)
  // Two modulos, because JavaScript's % keeps the sign of the dividend and a
  // date before the anchor would otherwise produce Day -2.
  const zeroBased = (((anchorDay - 1 + elapsed) % cycleLength) + cycleLength) % cycleLength
  return zeroBased + 1
}

/**
 * The meetings on one day, in order.
 *
 * Takes both ways of naming a day because a timetable holds one or the other
 * and the caller should not have to know which -- a school that switches to a
 * cycle mid-year has rows of both kinds, and dropping either would silently
 * empty half the week.
 */
export function meetingsOn(
  meetings: MeetingWithClass[],
  dayOfWeek: number,
  cycleDay: number | null,
): MeetingWithClass[] {
  return meetings
    .filter((m) =>
      (m.day_of_week !== null && m.day_of_week === dayOfWeek)
      || (m.cycle_day !== null && cycleDay !== null && m.cycle_day === cycleDay))
    .sort((a, b) => minutesOf(a.starts_at) - minutesOf(b.starts_at))
}

export type NextUp = {
  meeting: MeetingWithClass
  /** Whether it is happening right now rather than coming up. */
  now: boolean
  /** Minutes until it starts. Zero or less while it is running. */
  minutesAway: number
}

/**
 * What is happening now, or next, out of today's meetings.
 *
 * Returns null once the school day is over, which is the common case for most
 * of the hours anybody looks at this app -- and a dashboard that says "next:
 * Functions" at eleven at night, meaning tomorrow morning, is worse than one
 * that says nothing.
 */
export function nextUp(
  today: MeetingWithClass[],
  minutesNow: number,
): NextUp | null {
  const ordered = [...today].sort((a, b) => minutesOf(a.starts_at) - minutesOf(b.starts_at))

  const running = ordered.find((m) =>
    minutesOf(m.starts_at) <= minutesNow && minutesNow < minutesOf(m.ends_at))
  if (running) {
    return { meeting: running, now: true, minutesAway: minutesOf(running.starts_at) - minutesNow }
  }

  const upcoming = ordered.find((m) => minutesOf(m.starts_at) > minutesNow)
  if (!upcoming) return null
  return {
    meeting: upcoming,
    now: false,
    minutesAway: minutesOf(upcoming.starts_at) - minutesNow,
  }
}

/** "in 20 minutes", "in 1 hour 5 minutes", "now". */
export function awayLabel(next: NextUp): string {
  if (next.now) return 'now'
  const mins = next.minutesAway
  if (mins <= 1) return 'in a minute'
  if (mins < 60) return `in ${mins} minutes`
  const h = Math.floor(mins / 60)
  const m = mins % 60
  const hours = `${h} hour${h === 1 ? '' : 's'}`
  return m === 0 ? `in ${hours}` : `in ${hours} ${m} min`
}

/**
 * The earliest start and latest end across a set of meetings, so a week grid
 * is exactly as tall as the days in it.
 *
 * A fixed 8am-to-5pm grid wastes a third of its height on a timetable that
 * runs 8:50 to 3:15, and clips one that starts at half seven.
 */
export function dayBounds(meetings: MeetingWithClass[]): { from: number; to: number } {
  if (meetings.length === 0) return { from: 8 * 60, to: 16 * 60 }
  let from = Infinity
  let to = -Infinity
  for (const m of meetings) {
    from = Math.min(from, minutesOf(m.starts_at))
    to = Math.max(to, minutesOf(m.ends_at))
  }
  // Rounded out to the hour so the row labels are whole hours rather than
  // 08:50, 09:50, 10:50 -- which reads as a mistake even when it is accurate.
  return { from: Math.floor(from / 60) * 60, to: Math.ceil(to / 60) * 60 }
}
