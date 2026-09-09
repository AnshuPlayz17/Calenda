/**
 * One dated thing, before it becomes a row.
 *
 * This type lived in `schoolCalendar.ts`, alongside one school's real calendar,
 * which meant every file that wanted the shape imported the file holding the
 * data. A type import is erased at compile time so nothing shipped because of
 * it -- but it put the real document one careless line away from the bundle,
 * and twice it got there. The type lives on its own now and the data does not
 * live in `src/data` at all.
 */
import type { PlainDate } from '@/lib/events'

export type SeedEvent = {
  title: string
  description: string | null
  startDate: PlainDate
  endDate: PlainDate
  category: string
}
