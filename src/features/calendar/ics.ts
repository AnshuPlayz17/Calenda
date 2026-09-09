import type { EventWithCategory } from '@/lib/types'

/**
 * Your calendar, in the format every other calendar reads.
 *
 * WHY THIS EXISTS AT ALL
 *
 * An app that can only be left by abandoning your data is a trap, and this one
 * is a personal project by one student -- it could stop being maintained. A
 * file you can open in Apple Calendar, Google Calendar or Outlook is the
 * difference between "I stopped using Calenda" and "I lost my school year".
 *
 * It costs nothing to run: no server, no request, no quota. The file is built
 * in the browser out of rows already on screen.
 *
 * WHAT IS DELIBERATELY NOT HERE
 *
 * No VALARM. Reminders belong to Calenda's own scheduler, which knows the
 * reader's quiet hours and their timezone; exporting them would put a second,
 * dumber copy of every reminder in a calendar that does not, and somebody would
 * be woken twice.
 */

/**
 * RFC 5545 escaping. Commas, semicolons and backslashes are separators in this
 * format, and a newline in a description silently ends the property -- which
 * corrupts every line after it rather than just that one.
 */
function esc(text: string): string {
  return text
    .replace(/\\/g, '\\\\')
    .replace(/;/g, '\\;')
    .replace(/,/g, '\\,')
    .replace(/\r?\n/g, '\\n')
}

/** 2026-09-10 -> 20260910, the all-day form. */
function dateOnly(plain: string): string {
  return plain.replace(/-/g, '')
}

/** An ISO instant -> 20260910T143000Z. */
function stamp(iso: string): string {
  return new Date(iso).toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '')
}

/**
 * Folds a line to 75 octets, which the spec requires and most parsers forgive
 * -- until one does not, and then a long description breaks a whole file.
 *
 * Counted in UTF-8 bytes rather than characters: an emoji in a title is four
 * octets, and folding by character length would produce lines that are legal
 * to look at and too long to parse.
 */
function fold(line: string): string {
  const bytes = new TextEncoder().encode(line)
  if (bytes.length <= 75) return line

  const out: string[] = []
  let current = ''
  let width = 0
  for (const ch of line) {
    const size = new TextEncoder().encode(ch).length
    // 74, leaving room for the leading space a continuation line carries.
    if (width + size > 74) {
      out.push(current)
      current = ''
      width = 0
    }
    current += ch
    width += size
  }
  if (current) out.push(current)
  return out.join('\r\n ')
}

/**
 * One VEVENT.
 *
 * DTEND on an all-day event is EXCLUSIVE in this format: a one-day event ends
 * the following day. Getting that wrong makes every exported all-day event a
 * day short, which for a "Winter Break" reads as the holiday ending before it
 * does.
 */
function vevent(event: EventWithCategory, domain: string): string[] {
  const lines: string[] = ['BEGIN:VEVENT']
  lines.push(`UID:${event.id}@${domain}`)
  lines.push(`DTSTAMP:${stamp(event.updated_at || event.created_at || new Date().toISOString())}`)

  if (event.is_all_day || !event.start_at) {
    const endPlus = new Date(`${event.end_date}T00:00:00Z`)
    endPlus.setUTCDate(endPlus.getUTCDate() + 1)
    lines.push(`DTSTART;VALUE=DATE:${dateOnly(event.start_date)}`)
    lines.push(`DTEND;VALUE=DATE:${dateOnly(endPlus.toISOString().slice(0, 10))}`)
  } else {
    lines.push(`DTSTART:${stamp(event.start_at)}`)
    lines.push(`DTEND:${stamp(event.end_at ?? event.start_at)}`)
  }

  lines.push(`SUMMARY:${esc(event.title)}`)
  if (event.description) lines.push(`DESCRIPTION:${esc(event.description)}`)
  if (event.location) lines.push(`LOCATION:${esc(event.location)}`)
  if (event.category?.name) lines.push(`CATEGORIES:${esc(event.category.name)}`)
  lines.push('END:VEVENT')
  return lines
}

/**
 * A whole calendar.
 *
 * `\r\n` throughout, not `\n`. The spec says CRLF and several real parsers --
 * Outlook among them -- reject a file that uses bare newlines, which is a
 * failure that only shows up on somebody else's machine.
 */
export function toIcs(
  events: EventWithCategory[],
  { name = 'Calenda', domain = 'calenda.app' }: { name?: string; domain?: string } = {},
): string {
  const lines: string[] = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//Calenda//EN',
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    `X-WR-CALNAME:${esc(name)}`,
  ]
  for (const event of events) lines.push(...vevent(event, domain))
  lines.push('END:VCALENDAR')
  return lines.map(fold).join('\r\n') + '\r\n'
}

/** A filename somebody can find again in a downloads folder. */
export function icsFilename(yearLabel: string | null): string {
  const safe = (yearLabel ?? 'calendar').replace(/[^\w-]+/g, '-').replace(/^-|-$/g, '')
  return `calenda-${safe || 'calendar'}.ics`
}
