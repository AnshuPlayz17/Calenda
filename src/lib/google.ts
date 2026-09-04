/**
 * Google Calendar, read-only.
 *
 * Import only, and deliberately so: we never store a refresh token. The access
 * token Supabase hands back after sign-in lives about an hour, is used
 * immediately, and is never persisted by us. That has three consequences worth
 * stating, because they are the reason this is simple:
 *
 *   - nothing to leak, since no long-lived Google credential is kept
 *   - no background job, so no 7-day refresh-token expiry (Google expires
 *     those for apps still in Testing, which an unverified app must be)
 *   - no app verification needed to use it
 *
 * Exporting to Google would need the opposite of all three.
 */
import type { PlainDate } from './events'

const API = 'https://www.googleapis.com/calendar/v3'

export type GoogleCalendar = {
  id: string
  summary: string
  primary?: boolean
  backgroundColor?: string
  accessRole: string
  selected?: boolean
}

export type GoogleEvent = {
  id: string
  status?: string
  summary?: string
  description?: string
  location?: string
  start?: { date?: string; dateTime?: string; timeZone?: string }
  end?: { date?: string; dateTime?: string; timeZone?: string }
  recurringEventId?: string
}

export class GoogleAuthExpired extends Error {
  constructor() {
    super('Your Google session expired. Connect again to keep importing.')
    this.name = 'GoogleAuthExpired'
  }
}

async function call<T>(token: string, path: string, params: URLSearchParams): Promise<T> {
  const res = await fetch(`${API}${path}?${params}`, {
    headers: { Authorization: `Bearer ${token}` },
  })

  if (res.status === 401 || res.status === 403) throw new GoogleAuthExpired()
  if (!res.ok) {
    throw new Error("We couldn't reach Google Calendar. Please try again.")
  }
  return res.json() as Promise<T>
}

export async function listCalendars(token: string): Promise<GoogleCalendar[]> {
  const data = await call<{ items?: GoogleCalendar[] }>(
    token, '/users/me/calendarList', new URLSearchParams({ minAccessRole: 'reader' }),
  )
  return (data.items ?? []).sort((a, b) =>
    Number(b.primary ?? false) - Number(a.primary ?? false) || a.summary.localeCompare(b.summary))
}

/**
 * Events in a date window, with recurring series already expanded into
 * individual occurrences by Google (`singleEvents`), because a raw RRULE is
 * not something the duplicate check can reason about.
 */
export async function listEvents(
  token: string,
  calendarId: string,
  from: PlainDate,
  to: PlainDate,
): Promise<GoogleEvent[]> {
  const events: GoogleEvent[] = []
  let pageToken: string | undefined

  do {
    const params = new URLSearchParams({
      timeMin: `${from}T00:00:00Z`,
      timeMax: `${to}T23:59:59Z`,
      singleEvents: 'true',
      orderBy: 'startTime',
      maxResults: '2500',
      showDeleted: 'false',
    })
    if (pageToken) params.set('pageToken', pageToken)

    const data = await call<{ items?: GoogleEvent[]; nextPageToken?: string }>(
      token, `/calendars/${encodeURIComponent(calendarId)}/events`, params,
    )
    events.push(...(data.items ?? []))
    pageToken = data.nextPageToken
  } while (pageToken)

  // Cancelled occurrences of a recurring series come back as tombstones.
  return events.filter((e) => e.status !== 'cancelled')
}

/**
 * Google's all-day end date is EXCLUSIVE -- a one-day event on Oct 12 ends on
 * Oct 13 -- while Calenda stores an inclusive end. Getting this wrong makes
 * every imported all-day event one day too long.
 */
export function toPlainRange(event: GoogleEvent): {
  isAllDay: boolean
  startDate: PlainDate
  endDate: PlainDate
} | null {
  const rawStart = event.start?.date ?? event.start?.dateTime
  if (!rawStart) return null

  if (event.start?.date) {
    const startDate = event.start.date as PlainDate
    const exclusiveEnd = event.end?.date
    const endDate = exclusiveEnd ? previousDay(exclusiveEnd as PlainDate) : startDate
    return {
      isAllDay: true,
      startDate,
      // A malformed range (end before start) collapses to a single day rather
      // than producing an event that renders backwards.
      endDate: endDate < startDate ? startDate : endDate,
    }
  }

  const start = new Date(rawStart)
  const end = event.end?.dateTime ? new Date(event.end.dateTime) : start
  return {
    isAllDay: false,
    startDate: localPlain(start),
    endDate: localPlain(end),
  }
}

function previousDay(date: PlainDate): PlainDate {
  const [y, m, d] = date.split('-').map(Number)
  const dt = new Date(Date.UTC(y!, m! - 1, d! - 1))
  return dt.toISOString().slice(0, 10) as PlainDate
}

/** A timed event's calendar day, in the viewer's own timezone. */
function localPlain(d: Date): PlainDate {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}` as PlainDate
}
