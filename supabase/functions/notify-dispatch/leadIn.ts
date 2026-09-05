/**
 * How a reminder says when the thing is.
 *
 * This used to be built from the offset alone -- "In 1 day(s): Test" -- which
 * was awkward to read and, worse, could be wrong. Quiet hours deliberately
 * delay a reminder into the next morning, so a "1 day before" reminder can
 * arrive on the day itself and still claim there is a day to go.
 *
 * So it counts from the thing's own date instead, and falls back to the offset
 * only when there is no date to count from. Days are counted on calendar days
 * in the school's zone, not in 24-hour blocks: a reminder that lands at 8 a.m.
 * about an event tomorrow morning is "Tomorrow", not "In 1 day".
 *
 * No Deno APIs here, so the same file is unit-tested from the web test suite.
 */

export const SCHOOL_TIME_ZONE = 'America/Toronto'

/** The calendar day an instant falls on, as YYYY-MM-DD, in a given zone. */
function localDay(at: Date, timeZone: string): string {
  // en-CA formats as YYYY-MM-DD, which is the shape the rest of the app uses.
  return new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(at)
}

/** Whole calendar days from one YYYY-MM-DD to another. */
function daysApart(from: string, to: string): number {
  const ms = Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)
  return Math.round(ms / 86_400_000)
}

function plural(n: number, unit: string): string {
  return `In ${n} ${unit}${n === 1 ? '' : 's'}`
}

function fromDays(days: number): string {
  if (days <= 0) return 'Today'
  if (days === 1) return 'Tomorrow'
  if (days === 7) return 'In 1 week'
  return `In ${days} days`
}

/** Last resort: the thing has no date, so all we know is the lead time asked for. */
function fromOffset(minutes: number): string {
  if (minutes >= 10080) return plural(Math.round(minutes / 10080), 'week')
  if (minutes >= 1440) return fromDays(Math.round(minutes / 1440))
  if (minutes >= 60) return plural(Math.round(minutes / 60), 'hour')
  if (minutes <= 0) return 'Now'
  return plural(minutes, 'minute')
}

/**
 * @param when  an event's all-day date (YYYY-MM-DD) or an assignment's
 *              due timestamp (ISO). Empty when the thing has no date.
 * @param offsetMinutes  the lead time the reminder was set for, used only
 *              when `when` is missing or unreadable.
 */
export function leadIn(
  when: string,
  offsetMinutes: number,
  now: Date = new Date(),
  timeZone: string = SCHOOL_TIME_ZONE,
): string {
  if (!when) return fromOffset(offsetMinutes)

  // A timestamp means a real time of day, so hours and minutes are meaningful.
  if (when.includes('T')) {
    const at = Date.parse(when)
    if (Number.isNaN(at)) return fromOffset(offsetMinutes)

    const minutes = Math.round((at - now.getTime()) / 60_000)
    if (minutes <= 0) return 'Now'
    if (minutes < 60) return plural(minutes, 'minute')
    if (minutes < 1440) return plural(Math.round(minutes / 60), 'hour')
    return fromDays(daysApart(localDay(now, timeZone), localDay(new Date(at), timeZone)))
  }

  if (!/^\d{4}-\d{2}-\d{2}$/.test(when)) return fromOffset(offsetMinutes)
  return fromDays(daysApart(localDay(now, timeZone), when))
}
