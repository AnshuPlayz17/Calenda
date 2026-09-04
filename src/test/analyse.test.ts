import { describe, expect, it } from 'vitest'
import { analyseImport, buildWrites, summarise, unresolvedCount } from '@/features/import/analyse'
import type { ImportCandidate, Resolution } from '@/features/import/analyse'
import { schoolEvents2026_27 } from '@/data/schoolCalendar'
import type { EventWithCategory } from '@/lib/types'

const candidates: ImportCandidate[] = schoolEvents2026_27.map((e) => ({
  title: e.title,
  description: e.description,
  startDate: e.startDate,
  endDate: e.endDate,
  category: e.category,
}))

function existing(over: Partial<EventWithCategory>): EventWithCategory {
  return {
    id: 'x', school_year_id: 'y', category_id: null, series_id: null, owner_id: 'u',
    title: 'Untitled', description: null, location: null, priority: 0,
    is_all_day: true, start_date: '2026-01-01', end_date: '2026-01-01',
    start_at: null, end_at: null, visibility: 'community', status: 'approved',
    shared_with_parents: false, approved_by: null, approved_at: null, review_note: null,
    source: 'manual', content_hash: '', created_at: '', updated_at: '', category: null,
    ...over,
  }
}

describe('first import into an empty database', () => {
  const rows = analyseImport(candidates, [])

  it('processes every row from the PDF', () => {
    expect(rows).toHaveLength(49)
  })

  it('does NOT collapse the 16 identical Late Starts', () => {
    // Byte-identical titles on 16 different dates. Treating these as
    // duplicates would silently drop 15 real events.
    const lateStarts = rows.filter((r) => r.candidate.title === 'Late Start')
    expect(lateStarts).toHaveLength(16)
    expect(lateStarts.every((r) => r.verdict === 'new')).toBe(true)
  })

  it('catches Winter Break being one break split across two entries', () => {
    // The source groups by month, so Dec 21-31 and Jan 1-3 arrive separately.
    // Nothing exists to compare against, so only intra-batch comparison can
    // find this.
    const winter = rows.filter((r) => r.candidate.title === 'Winter Break')
    expect(winter).toHaveLength(2)
    expect(winter[0]!.verdict).toBe('new')
    expect(winter[1]!.verdict).toBe('likely_duplicate')
    expect(winter[1]!.matchRowKey).toBe(winter[0]!.key)
  })

  it('leaves the ambiguous row for a person to decide', () => {
    const winter = rows.filter((r) => r.candidate.title === 'Winter Break')
    expect(winter[1]!.resolution).toBeNull()
    expect(unresolvedCount(rows)).toBeGreaterThan(0)
  })

  it('imports everything else without asking', () => {
    const s = summarise(rows)
    expect(s.total).toBe(49)
    expect(s.exact).toBe(0)
    expect(s.unresolved).toBe(s.likely)
  })
})

describe('re-importing a calendar that is already loaded', () => {
  it('marks every row as an exact duplicate rather than doubling the calendar', () => {
    const loaded = candidates.map((c, i) =>
      existing({ id: `e${i}`, title: c.title, start_date: c.startDate, end_date: c.endDate }))

    const rows = analyseImport(candidates, loaded)
    const s = summarise(rows)

    expect(s.exact).toBe(49)
    expect(s.fresh).toBe(0)
    // Every row defaults to keeping what is already there, so a careless
    // re-import adds nothing.
    expect(s.willImport).toBe(0)
    expect(s.unresolved).toBe(0)
  })
})

describe('a partially loaded calendar', () => {
  it('separates what is already there from what is genuinely new', () => {
    const firstTen = candidates.slice(0, 10).map((c, i) =>
      existing({ id: `e${i}`, title: c.title, start_date: c.startDate, end_date: c.endDate }))

    const rows = analyseImport(candidates, firstTen)
    expect(rows.slice(0, 10).every((r) => r.verdict === 'exact_duplicate')).toBe(true)
    expect(rows.filter((r) => r.verdict === 'exact_duplicate')).toHaveLength(10)
  })
})

describe('an exact duplicate names what it collided with', () => {
  it('links to the existing event so the two can be compared', () => {
    const loaded = [existing({
      id: 'pa-day-1', title: 'PA Day', start_date: '2026-12-01', end_date: '2026-12-01',
    })]
    const rows = analyseImport(
      [{ title: 'PA Day', description: null, startDate: '2026-12-01', endDate: '2026-12-01', category: 'pa-day' }],
      loaded,
    )
    expect(rows[0]!.verdict).toBe('exact_duplicate')
    expect(rows[0]!.matchExisting?.id).toBe('pa-day-1')
  })
})

describe('buildWrites', () => {
  const rows = analyseImport(candidates, [])
  function resolveAll(resolution: Resolution) {
    return rows.map((r) => (r.resolution === null ? { ...r, resolution } : r))
  }

  it('writes one combined row when two halves are merged', () => {
    const merged = resolveAll('merge')
    const writes = buildWrites(merged)

    const winter = writes.filter((w) => w.title === 'Winter Break')
    // ONE row, not two -- merging must not leave the half behind.
    expect(winter).toHaveLength(1)
    // ...spanning the outer bounds of both halves.
    expect(winter[0]!.startDate).toBe('2026-12-21')
    expect(winter[0]!.endDate).toBe('2027-01-03')
  })

  it('writes both rows when the duplicate is added anyway', () => {
    const kept = resolveAll('add_anyway')
    const winter = buildWrites(kept).filter((w) => w.title === 'Winter Break')
    expect(winter).toHaveLength(2)
    expect(winter[0]!.endDate).toBe('2026-12-31')
    expect(winter[1]!.startDate).toBe('2027-01-01')
  })

  it('writes neither half when the duplicate is skipped', () => {
    const skipped = rows.map((r) => (r.resolution === null ? { ...r, resolution: 'skip' as const } : r))
    const winter = buildWrites(skipped).filter((w) => w.title === 'Winter Break')
    // The first half still imports; only the flagged second one is dropped.
    expect(winter).toHaveLength(1)
    expect(winter[0]!.startDate).toBe('2026-12-21')
  })

  it('keeps all 16 Late Starts as separate writes', () => {
    const writes = buildWrites(resolveAll('merge'))
    expect(writes.filter((w) => w.title === 'Late Start')).toHaveLength(16)
  })

  it('carries the id to remove when replacing', () => {
    const loaded = [existing({ id: 'old-1', title: 'PA Day', start_date: '2026-12-01', end_date: '2026-12-01' })]
    const one = analyseImport(
      [{ title: 'PA Day', description: null, startDate: '2026-12-01', endDate: '2026-12-01', category: 'pa-day' }],
      loaded,
    ).map((r) => ({ ...r, resolution: 'replace' as const }))

    const writes = buildWrites(one)
    expect(writes).toHaveLength(1)
    expect(writes[0]!.replacesEventId).toBe('old-1')
  })

  it('writes nothing when everything is kept as-is', () => {
    const loaded = candidates.map((c, i) =>
      existing({ id: `e${i}`, title: c.title, start_date: c.startDate, end_date: c.endDate }))
    const allDupes = analyseImport(candidates, loaded)
    expect(buildWrites(allDupes)).toHaveLength(0)
  })

  it('reports a count that matches what it will actually write', () => {
    const merged = resolveAll('merge')
    expect(summarise(merged).willImport).toBe(buildWrites(merged).length)
  })
})

describe('a row judged new reports no match', () => {
  it('does not claim two distant Late Starts look alike', () => {
    // They share a title but are weeks apart. Reporting a match here would
    // contradict the "new" verdict and appear on nearly every row.
    const rows = analyseImport(candidates, [])
    const lateStarts = rows.filter((r) => r.candidate.title === 'Late Start')

    expect(lateStarts.every((r) => r.verdict === 'new')).toBe(true)
    expect(lateStarts.every((r) => r.matchRowKey === null)).toBe(true)
    expect(lateStarts.every((r) => r.matchExisting === null)).toBe(true)
  })

  it('still reports a match on rows that are genuine duplicates', () => {
    const rows = analyseImport(candidates, [])
    const winter = rows.filter((r) => r.candidate.title === 'Winter Break')
    expect(winter[1]!.matchRowKey).toBe(winter[0]!.key)
  })
})

describe('what the real 2026-27 calendar actually flags', () => {
  // Locked in after running the first real import: the document contains
  // three same-titled adjacent pairs, not one. Winter Break is the case where
  // merging is right; the two June PD Days are genuinely separate days that
  // happen to run consecutively.
  it('flags exactly three rows, and names them', () => {
    const rows = analyseImport(candidates, [])
    const flagged = rows
      .filter((r) => r.resolution === null)
      .map((r) => `${r.candidate.title} ${r.candidate.startDate}`)

    expect(flagged).toEqual([
      'Winter Break 2027-01-01',
      'PD Day 2027-06-29',
      'PD Day 2027-06-30',
    ])
  })

  it('does not merge the consecutive June PD days automatically', () => {
    // Jun 25, 28, 29 and 30 are four separate PD days. Silently collapsing
    // the consecutive three would erase two real days off the calendar.
    // Note "PD Day" and "PA Day" are different titles in the source -- Jun 22
    // is a PA Day. Only the four PD Days run consecutively.
    const rows = analyseImport(candidates, [])
    const june = rows.filter(
      (r) => r.candidate.title === 'PD Day' && r.candidate.startDate.startsWith('2027-06'))
    expect(june.map((r) => r.candidate.startDate)).toEqual([
      '2027-06-25', '2027-06-28', '2027-06-29', '2027-06-30',
    ])
    // Two are flagged for a decision; none is resolved on the user's behalf.
    expect(june.filter((r) => r.resolution === null)).toHaveLength(2)
  })

  it('keeps all four June PD days when they are added anyway', () => {
    const rows = analyseImport(candidates, []).map((r) =>
      r.resolution === null && r.candidate.title === 'PD Day'
        ? { ...r, resolution: 'add_anyway' as const }
        : r.resolution === null
          ? { ...r, resolution: 'merge' as const }
          : r)

    const writes = buildWrites(rows)
    const june = writes.filter((w) => w.title === 'PD Day' && w.startDate.startsWith('2027-06'))
    expect(june.map((w) => w.startDate)).toEqual([
      '2027-06-25', '2027-06-28', '2027-06-29', '2027-06-30',
    ])
  })
})
