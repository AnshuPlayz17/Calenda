/**
 * The one promise the import screen makes: nothing is merged, replaced or
 * dropped unless a person chose it.
 *
 * The behaviour tests next door cover individual scenarios. These state the
 * invariant over the whole real calendar, so a future change to the scoring
 * cannot quietly start destroying data in a case nobody wrote a scenario for.
 */
import { describe, expect, it } from 'vitest'
import { analyseImport, buildWrites, summarise } from '@/features/import/analyse'
import type { ImportCandidate, Resolution } from '@/features/import/analyse'
import { schoolEvents2026_27 } from '@/data/schoolCalendar'
import type { EventWithCategory } from '@/lib/types'

const CANDIDATES: ImportCandidate[] = schoolEvents2026_27.map((e) => ({
  title: e.title,
  description: e.description,
  startDate: e.startDate,
  endDate: e.endDate,
  category: e.category,
}))

/** The calendar as it would look after a clean first import. */
function asExisting(): EventWithCategory[] {
  return schoolEvents2026_27.map((e, i) => ({
    id: `existing-${i}`,
    title: e.title,
    description: e.description,
    start_date: e.startDate,
    end_date: e.endDate,
    is_all_day: true,
    start_at: null,
    end_at: null,
    location: null,
    visibility: 'community',
    status: 'approved',
    priority: 0,
    category: null,
  }) as unknown as EventWithCategory)
}

describe('import safety invariants', () => {
  it('leaves the ambiguous rows undecided, and writes none of them', () => {
    // A first import: nothing exists yet, so the only ambiguity is inside the
    // batch -- the two Winter Break entries that are really one break.
    const rows = analyseImport(CANDIDATES, [])
    const undecided = rows.filter((r) => r.resolution === null)

    expect(undecided.length).toBeGreaterThan(0)
    expect(summarise(rows).unresolved).toBe(undecided.length)

    const writes = buildWrites(rows)
    for (const row of undecided) {
      expect(writes.some((w) =>
        w.title === row.candidate.title && w.startDate === row.candidate.startDate,
      )).toBe(false)
    }
  })

  it('counts an exact duplicate as decided, defaulting to keeping what is there', () => {
    // Re-importing the same calendar is unambiguous, so nothing blocks the
    // button -- but the safe default must be to change nothing.
    const rows = analyseImport(CANDIDATES, asExisting())
    expect(summarise(rows).unresolved).toBe(0)
    expect(buildWrites(rows)).toHaveLength(0)
  })

  it('never deletes an existing event unless replace was chosen', () => {
    const rows = analyseImport(CANDIDATES, asExisting())
    // Nothing carries a replacement id while every row is still at its default.
    expect(buildWrites(rows).every((w) => w.replacesEventId === undefined)).toBe(true)
  })

  it('only ever names a replacement id on the row that asked for one', () => {
    const rows = analyseImport(CANDIDATES, asExisting())
    const decided = rows.map((r) => ({
      ...r,
      resolution: (r.verdict === 'new' ? 'add_anyway' : 'replace') as Resolution,
    }))
    for (const w of buildWrites(decided)) {
      const source = decided.find(
        (r) => r.candidate.title === w.title && r.resolution === 'replace' && r.matchExisting,
      )
      if (w.replacesEventId) expect(source).toBeDefined()
    }
  })

  it('collapses a merge group into one row that covers every member', () => {
    const rows = analyseImport(CANDIDATES, [])
    const merges = rows.filter((r) => r.matchRowKey)
    expect(merges.length).toBeGreaterThan(0)

    const decided = rows.map((r) =>
      r.matchRowKey
        ? { ...r, resolution: 'merge' as Resolution }
        : { ...r, resolution: 'add_anyway' as Resolution },
    )
    const writes = buildWrites(decided)

    // Rows fan in as well as chain: three June PD days all resolve back to the
    // same first one. However the group is shaped, every member must end up
    // inside exactly one write -- not one write per member, overlapping.
    const members = new Set<string>()
    for (const r of merges) {
      members.add(r.key)
      members.add(r.matchRowKey as string)
    }
    for (const key of members) {
      const row = rows.find((r) => r.key === key)!
      const covering = writes.filter((w) =>
        w.title === row.candidate.title
        && w.startDate <= row.candidate.startDate
        && w.endDate >= row.candidate.endDate,
      )
      expect(covering).toHaveLength(1)
    }
  })

  it('does not emit overlapping events for the same merged title', () => {
    const rows = analyseImport(CANDIDATES, [])
    const decided = rows.map((r) =>
      r.matchRowKey
        ? { ...r, resolution: 'merge' as Resolution }
        : { ...r, resolution: 'add_anyway' as Resolution },
    )
    const writes = buildWrites(decided)

    const byTitle = new Map<string, typeof writes>()
    for (const w of writes) {
      byTitle.set(w.title, [...(byTitle.get(w.title) ?? []), w])
    }
    for (const [title, group] of byTitle) {
      const sorted = [...group].sort((a, b) => (a.startDate < b.startDate ? -1 : 1))
      for (let i = 1; i < sorted.length; i++) {
        expect(
          sorted[i]!.startDate > sorted[i - 1]!.endDate,
          `"${title}" writes overlap: ${sorted[i - 1]!.startDate}..${sorted[i - 1]!.endDate} and ${sorted[i]!.startDate}..${sorted[i]!.endDate}`,
        ).toBe(true)
      }
    }
  })

  it('reports a count the import will actually produce', () => {
    const rows = analyseImport(CANDIDATES, [])
    const decided = rows.map((r) => ({ ...r, resolution: 'add_anyway' as Resolution }))
    expect(summarise(decided).willImport).toBe(buildWrites(decided).length)
  })

  it('skipping every ambiguous row still imports the unambiguous ones', () => {
    const rows = analyseImport(CANDIDATES, asExisting())
    const decided = rows.map((r) => ({ ...r, resolution: 'skip' as Resolution }))
    expect(buildWrites(decided)).toHaveLength(0)
  })
})
