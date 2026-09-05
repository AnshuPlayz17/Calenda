/** The offsets worth offering. Anything finer is noise for a school calendar. */
export const OFFSETS: Array<{ minutes: number; label: string }> = [
  { minutes: 10080, label: '1 week' },
  { minutes: 4320, label: '3 days' },
  { minutes: 1440, label: '1 day' },
  { minutes: 720, label: '12 hours' },
  { minutes: 180, label: '3 hours' },
  { minutes: 60, label: '1 hour' },
  { minutes: 30, label: '30 min' },
]

export function offsetLabel(minutes: number): string {
  return OFFSETS.find((o) => o.minutes === minutes)?.label ?? `${minutes} min`
}
