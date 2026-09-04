/**
 * Import duplicate analysis.
 *
 * Produces a decision for every incoming row, but never acts on one. Nothing
 * is merged, replaced or discarded without a person choosing -- the whole
 * point of the review step.
 *
 * Two kinds of collision matter, and the 2026-27 PDF contains both:
 *
 *   against the database -- re-importing a calendar that is already loaded
 *   within the batch itself -- Winter Break is ONE break recorded as two
 *     entries (Dec 21-31 and Jan 1-3) because the source groups by month.
 *     On a first import into an empty database neither collides with
 *     anything existing, so intra-batch comparison is the only thing that
 *     can catch it.
 */
import { duplicateScore } from '@/lib/events'
import type { PlainDate } from '@/lib/events'
import type { EventWithCategory } from '@/lib/types'
import type { ImportWrite } from '@/data/source'

export type ImportCandidate = {
  title: string
  description: string | null
  startDate: PlainDate
  endDate: PlainDate
  category: string
}

export type Verdict = 'new' | 'likely_duplicate' | 'exact_duplicate'

export type Resolution = 'add_anyway' | 'keep_existing' | 'merge' | 'replace' | 'skip'

export type AnalysedRow = {
  /** Stable within a batch, so React keys and selections survive re-renders. */
  key: string
  candidate: ImportCandidate
  verdict: Verdict
  score: number
  /** The existing event it collides with, if any. */
  matchExisting: EventWithCategory | null
  /** The earlier row in this same batch it collides with, if any. */
  matchRowKey: string | null
  /** Pre-selected only when the choice is obvious; null means "you decide". */
  resolution: Resolution | null
}

/** Above this, two rows are the same event. Below it, they merely look alike. */
export const LIKELY_THRESHOLD = 0.5

export function analyseImport(
  candidates: ImportCandidate[],
  existing: EventWithCategory[],
): AnalysedRow[] {
  const rows: AnalysedRow[] = []

  candidates.forEach((candidate, index) => {
    const key = `row-${index}`

    let best: EventWithCategory | null = null
    let bestScore = 0
    for (const e of existing) {
      const score = duplicateScore(candidate, {
        title: e.title,
        startDate: e.start_date,
        endDate: e.end_date,
      })
      if (score > bestScore) {
        bestScore = score
        best = e
      }
    }

    // Compare against rows already accepted into this batch, so a source that
    // splits one event across two entries is caught on a first import.
    let bestRowKey: string | null = null
    let bestRowScore = 0
    for (const prior of rows) {
      const score = duplicateScore(candidate, prior.candidate)
      if (score > bestRowScore) {
        bestRowScore = score
        bestRowKey = prior.key
      }
    }

    const score = Math.max(bestScore, bestRowScore)
    const againstRow = bestRowScore > bestScore

    let verdict: Verdict = 'new'
    let resolution: Resolution | null = 'add_anyway'

    if (score >= 1) {
      verdict = 'exact_duplicate'
      // Identical title and start date: keeping what is already there is
      // almost certainly right, but it is still shown and still changeable.
      resolution = 'keep_existing'
    } else if (score >= LIKELY_THRESHOLD) {
      verdict = 'likely_duplicate'
      // Genuinely ambiguous. Nothing is pre-selected, so the batch cannot be
      // committed until a person has looked at it.
      resolution = null
    }

    // A row judged 'new' reports no match at all. Two different Late Starts
    // score alike on title but are weeks apart, so surfacing "looks like
    // another row" there is noise on almost every row -- and it contradicts
    // the verdict shown beside it.
    const isDuplicate = verdict !== 'new'

    rows.push({
      key,
      candidate,
      verdict,
      score,
      matchExisting: isDuplicate && !againstRow ? best : null,
      matchRowKey: isDuplicate && againstRow ? bestRowKey : null,
      resolution,
    })
  })

  return rows
}

/**
 * Turns resolved rows into the writes to perform.
 *
 * A merge writes ONE combined row spanning both halves, so the row it merged
 * into must not also be written on its own -- otherwise Winter Break would be
 * imported twice, which is the exact thing the merge was chosen to prevent.
 */
export function buildWrites(rows: AnalysedRow[]): ImportWrite[] {
  const byKey = new Map(rows.map((r) => [r.key, r]))

  // Merges are grouped, not applied pairwise. Several rows can point at the
  // same match -- the four consecutive June PD days all resolve back to the
  // first -- and merging each one against its target separately would emit an
  // overlapping event per row, which is the duplication this screen exists to
  // prevent. Union-find collapses a group, however it is shaped, into one row.
  const parent = new Map<string, string>()
  const find = (key: string): string => {
    const seen = parent.get(key)
    if (seen === undefined || seen === key) return key
    const root = find(seen)
    parent.set(key, root)
    return root
  }
  const union = (a: string, b: string) => {
    parent.set(a, parent.get(a) ?? a)
    parent.set(b, parent.get(b) ?? b)
    const rootA = find(a)
    const rootB = find(b)
    if (rootA !== rootB) parent.set(rootA, rootB)
  }

  const merging = new Set<string>()
  for (const row of rows) {
    if (row.resolution !== 'merge' || !row.matchRowKey) continue
    if (!byKey.has(row.matchRowKey)) continue
    union(row.key, row.matchRowKey)
    merging.add(row.key)
    merging.add(row.matchRowKey)
  }

  const writes: ImportWrite[] = []
  const emitted = new Set<string>()

  for (const row of rows) {
    if (merging.has(row.key)) {
      const root = find(row.key)
      if (emitted.has(root)) continue
      emitted.add(root)

      const members = rows.filter((r) => merging.has(r.key) && find(r.key) === root)
      // The earliest member names the combined event; the group spans the
      // outer bounds of every member, so no half is silently dropped.
      const lead = members.reduce((a, b) =>
        b.candidate.startDate < a.candidate.startDate ? b : a)
      let { startDate, endDate } = lead.candidate
      for (const m of members) {
        if (m.candidate.startDate < startDate) startDate = m.candidate.startDate
        if (m.candidate.endDate > endDate) endDate = m.candidate.endDate
      }

      writes.push({
        title: lead.candidate.title,
        description: lead.candidate.description,
        startDate,
        endDate,
        categorySlug: lead.candidate.category,
      })
      continue
    }

    if (row.resolution !== 'add_anyway' && row.resolution !== 'replace') continue

    writes.push({
      title: row.candidate.title,
      description: row.candidate.description,
      startDate: row.candidate.startDate,
      endDate: row.candidate.endDate,
      categorySlug: row.candidate.category,
      ...(row.resolution === 'replace' && row.matchExisting
        ? { replacesEventId: row.matchExisting.id }
        : {}),
    })
  }

  return writes
}

/** A batch is ready when every ambiguous row has been decided. */
export function unresolvedCount(rows: AnalysedRow[]): number {
  return rows.filter((r) => r.resolution === null).length
}

export function summarise(rows: AnalysedRow[]) {
  return {
    total: rows.length,
    fresh: rows.filter((r) => r.verdict === 'new').length,
    likely: rows.filter((r) => r.verdict === 'likely_duplicate').length,
    exact: rows.filter((r) => r.verdict === 'exact_duplicate').length,
    unresolved: unresolvedCount(rows),
    // Counted from the actual writes, so the button never promises a number
    // the import does not produce.
    willImport: buildWrites(rows).length,
  }
}
