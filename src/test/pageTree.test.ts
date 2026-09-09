import { describe, expect, it } from 'vitest'
import {
  buildPageTree, canMoveUnder, descendantsOf, positionBetween,
} from '@/features/notebook/pageTree'
import type { NotebookPage } from '@/lib/types'

/**
 * The notebook tree.
 *
 * These call the shipping functions rather than reproducing them, and they
 * concentrate on the shapes that are hard to produce by clicking: a page whose
 * parent has been archived out from under it, and a cycle.
 */

let seq = 0
function page(over: Partial<NotebookPage> = {}): NotebookPage {
  seq++
  return {
    id: `p${seq}`,
    class_id: 'c1',
    owner_id: 'o1',
    parent_page_id: null,
    title: `Page ${seq}`,
    icon: null,
    content: {},
    content_text: '',
    position: seq * 1000,
    is_archived: false,
    shared_with_parents: false,
    // Fixed and increasing, so the created_at tie-break is deterministic.
    created_at: `2026-09-0${Math.min(seq, 9)}T00:00:00Z`,
    updated_at: '2026-09-09T00:00:00Z',
    ...over,
  }
}

describe('buildPageTree', () => {
  it('nests children under their parent, depth-first', () => {
    const a = page({ id: 'a', position: 1000 })
    const b = page({ id: 'b', position: 2000 })
    const a1 = page({ id: 'a1', parent_page_id: 'a', position: 1000 })

    const rows = buildPageTree([b, a1, a])

    expect(rows.map((r) => r.page.id)).toEqual(['a', 'a1', 'b'])
    expect(rows.map((r) => r.depth)).toEqual([0, 1, 0])
  })

  it('orders siblings by position, not by the order they arrived', () => {
    const first = page({ id: 'first', position: 100 })
    const second = page({ id: 'second', position: 200 })
    expect(buildPageTree([second, first]).map((r) => r.page.id))
      .toEqual(['first', 'second'])
  })

  it('breaks a tie on position with created_at rather than leaving it unstable', () => {
    // Fractional midpoints eventually stop being distinguishable, and a list
    // that reshuffles itself between renders is worse than one in a slightly
    // arbitrary order.
    const early = page({ id: 'early', position: 500, created_at: '2026-01-01T00:00:00Z' })
    const late = page({ id: 'late', position: 500, created_at: '2026-06-01T00:00:00Z' })
    expect(buildPageTree([late, early]).map((r) => r.page.id)).toEqual(['early', 'late'])
  })

  it('marks which rows have children so a row knows to draw a disclosure', () => {
    const parent = page({ id: 'parent' })
    const child = page({ id: 'child', parent_page_id: 'parent' })
    const rows = buildPageTree([parent, child])
    expect(rows.find((r) => r.page.id === 'parent')!.hasChildren).toBe(true)
    expect(rows.find((r) => r.page.id === 'child')!.hasChildren).toBe(false)
  })

  it('hides descendants of a collapsed page but still marks it as having them', () => {
    const parent = page({ id: 'parent' })
    const child = page({ id: 'child', parent_page_id: 'parent' })
    const rows = buildPageTree([parent, child], new Set(['parent']))
    expect(rows.map((r) => r.page.id)).toEqual(['parent'])
    expect(rows[0]!.hasChildren).toBe(true)
  })

  it('shows a page whose parent is missing rather than dropping it', () => {
    // listPages filters archived rows out, so archiving a parent orphans its
    // children. They are not archived, they still exist, and walking only from
    // true roots would make them invisible AND unreachable -- somebody's notes
    // gone with no way left to ask for them back.
    const orphan = page({ id: 'orphan', parent_page_id: 'archived-parent' })
    const rows = buildPageTree([orphan])
    expect(rows.map((r) => r.page.id)).toEqual(['orphan'])
    expect(rows[0]!.depth).toBe(0)
  })

  it('survives a cycle instead of hanging', () => {
    // Not reachable through the interface, but two clients moving pages at
    // once can write it. The cost of not guarding is an infinite loop that
    // takes down the whole route rather than showing one wrong row.
    const a = page({ id: 'a', parent_page_id: 'b' })
    const b = page({ id: 'b', parent_page_id: 'a' })
    const rows = buildPageTree([a, b])
    // Neither is reachable from a real root, so the important assertion is
    // that this returns at all.
    expect(rows.length).toBeLessThanOrEqual(2)
  })

  it('is empty for an empty notebook', () => {
    expect(buildPageTree([])).toEqual([])
  })
})

describe('descendantsOf', () => {
  it('finds every level, not just the children', () => {
    const a = page({ id: 'a' })
    const b = page({ id: 'b', parent_page_id: 'a' })
    const c = page({ id: 'c', parent_page_id: 'b' })
    const unrelated = page({ id: 'z' })
    const found = descendantsOf([a, b, c, unrelated], 'a').map((p) => p.id)
    expect(found.sort()).toEqual(['b', 'c'])
  })

  it('counts nothing for a leaf, which is what makes a confirmation honest', () => {
    const a = page({ id: 'a' })
    expect(descendantsOf([a], 'a')).toEqual([])
  })

  it('terminates on a cycle', () => {
    const a = page({ id: 'a', parent_page_id: 'b' })
    const b = page({ id: 'b', parent_page_id: 'a' })
    expect(() => descendantsOf([a, b], 'a')).not.toThrow()
  })
})

describe('canMoveUnder', () => {
  it('refuses to put a page inside itself', () => {
    const a = page({ id: 'a' })
    expect(canMoveUnder([a], 'a', 'a')).toBe(false)
  })

  it('refuses to put a page inside its own descendant', () => {
    // This is the move that detaches a whole branch from every root: the rows
    // still exist and point at each other in a ring, and nothing lists them.
    const a = page({ id: 'a' })
    const b = page({ id: 'b', parent_page_id: 'a' })
    expect(canMoveUnder([a, b], 'a', 'b')).toBe(false)
  })

  it('allows a move to the top level', () => {
    const a = page({ id: 'a' })
    expect(canMoveUnder([a], 'a', null)).toBe(true)
  })

  it('allows an ordinary move under an unrelated page', () => {
    const a = page({ id: 'a' })
    const b = page({ id: 'b' })
    expect(canMoveUnder([a, b], 'a', 'b')).toBe(true)
  })
})

describe('positionBetween', () => {
  it('takes the midpoint of two neighbours', () => {
    expect(positionBetween(1000, 2000)).toBe(1500)
  })

  it('appends past the end', () => {
    expect(positionBetween(1000, undefined)).toBe(2000)
  })

  it('prepends before the start', () => {
    expect(positionBetween(undefined, 1000)).toBe(0)
  })

  it('has an answer for an empty list', () => {
    expect(positionBetween(undefined, undefined)).toBe(1000)
  })

  it('stays strictly between, which is the whole property', () => {
    // One row is rewritten per reorder rather than every sibling after it, and
    // that only holds while the midpoint is genuinely between the two.
    let lo = 1000
    const hi = 2000
    for (let i = 0; i < 20; i++) {
      const mid = positionBetween(lo, hi)
      expect(mid).toBeGreaterThan(lo)
      expect(mid).toBeLessThan(hi)
      lo = mid
    }
  })
})
