import { SCHOOLS } from '@/data/schools'

/**
 * What to draw for the school somebody said they go to.
 *
 * THE RULE THIS EXISTS TO KEEP
 *
 * `schools.ts` says it plainly: the monogram of each of the fifteen is
 * hand-curated because "inventing one for the rest would put made-up initials
 * next to a real institution's name". One of them takes a single letter;
 * another takes four initials that read as one but are not an acronym anybody
 * uses. No formula produces either, and a formula that tried would be asserting
 * an acronym on a school's behalf.
 *
 * So this never derives initials. A school on the list gets its curated
 * monogram. A school typed into the "another school" box gets its own name,
 * set in the same face at a smaller size. That is honest at both ends: we show
 * exactly what we were told, and we never assert an acronym on behalf of a
 * school that may not use one.
 */
export type SchoolMark =
  | { kind: 'monogram'; text: string; name: string }
  | { kind: 'name'; text: string; name: string }
  | null

export function schoolMark(school: string | null | undefined): SchoolMark {
  const raw = (school ?? '').trim()
  if (!raw) return null

  const match = SCHOOLS.find(
    (s) => s.name.toLowerCase() === raw.toLowerCase()
      || s.acronym?.toLowerCase() === raw.toLowerCase(),
  )
  if (match) return { kind: 'monogram', text: match.monogram, name: match.name }

  // Their own words, shown back. Long names are handled by type size rather
  // than by truncation -- cutting a school's name in half is worse than
  // setting it small.
  return { kind: 'name', text: raw, name: raw }
}

/**
 * Type size as a fraction of the mark's box, by how much there is to set.
 *
 * The same problem the landing tiles have and the same shape of answer: a one
 * letter monogram is an initial and can be large, a four letter one is an
 * acronym and has to be small. Names carry on down the same curve rather than
 * getting a rule of their own, so a two-word school and a four-letter acronym
 * do not sit at wildly different weights beside the same wordmark.
 */
export function markSize(mark: NonNullable<SchoolMark>): number {
  const n = mark.text.length
  if (mark.kind === 'monogram') {
    if (n <= 1) return 0.44
    if (n === 2) return 0.355
    if (n === 3) return 0.275
    return 0.225
  }
  if (n <= 10) return 0.13
  if (n <= 20) return 0.095
  if (n <= 32) return 0.072
  return 0.055
}
