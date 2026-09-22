import { describe, expect, it } from 'vitest'
import { SEAMS } from '@/features/landing/seams'
import { LANDING_SECTIONS } from '@/features/landing/sections'

/**
 * The seam table, held against what was measured.
 *
 * Where a mark may go is not a matter of taste and it is not derivable from the
 * chapter list either -- it depends on whether both chapters fade out at their
 * edges, which depends on which frame primitive each scene uses and, for the
 * founder chapter, on whether its panel happens to fit the window. So it was
 * measured, by `scripts/seamcheck.mjs`, at four viewports.
 *
 * The measurement is not repeatable from a unit test -- it needs a browser and
 * a built page. What a unit test can do is stop the table drifting away from
 * it: the four boundaries that were measured as occupied are named here with
 * the numbers that disqualified them, and a seam appearing on one of them fails
 * before anybody has to look at the page again.
 */

/**
 * Measured 2026-09-22 at 1440x900, 1280x700, 1024x760 and 390x844. The number
 * is chapter ink -- the fraction of the window covered by something belonging
 * to a chapter -- at the worst viewport, at the point where a mark would be.
 */
const OCCUPIED: Record<string, string> = {
  'morph->pipeline': '0.129 -- the pipeline is an Approach chapter and arrives full',
  'pipeline->import': '0.113 -- the gap at the end of an Approach chapter is not centred on the boundary',
  'privacy->founder': '0.221 -- FounderScene pins only where its panel fits',
  'founder->start': '0.272 -- the closing chapter is deliberately still',
}

const ids = LANDING_SECTIONS.map((s) => s.id)

describe('the seam table', () => {
  it('has seams at all, so a table emptied by an edit fails loudly', () => {
    // Every assertion below is a filter over SEAMS. An empty table satisfies
    // all of them and reports a clean sweep of nothing, which this project has
    // shipped twice.
    expect(SEAMS.length).toBeGreaterThanOrEqual(5)
  })

  it('names only real chapters, in page order', () => {
    for (const s of SEAMS) {
      expect(ids, `${s.from} is not a chapter`).toContain(s.from)
      expect(ids, `${s.to} is not a chapter`).toContain(s.to)
      // A mark travels forwards. Reversed, it would appear as the reader
      // arrives at the chapter it was supposed to leave.
      expect(ids.indexOf(s.from), `${s.from} -> ${s.to} runs backwards`)
        .toBeLessThan(ids.indexOf(s.to))
    }
  })

  it('puts no mark on a boundary measured as occupied', () => {
    for (const s of SEAMS) {
      const key = `${s.from}->${s.to}`
      expect(OCCUPIED[key], `${key} was measured as occupied: ${OCCUPIED[key]}`).toBeUndefined()
    }
  })

  it('crosses each boundary at most once', () => {
    const keys = SEAMS.map((s) => `${s.from}->${s.to}`)
    expect(new Set(keys).size).toBe(keys.length)
  })

  it('carries a different object every time', () => {
    // The rule that orders the chapters is that no two adjacent ones move the
    // same way, because a fourth identical pinned section is the failure mode
    // of this genre. Identical marks would reintroduce it at the seams: a
    // rectangle announcing every boundary is punctuation, not a transition.
    const kinds = SEAMS.map((s) => s.kind)
    expect(new Set(kinds).size).toBe(kinds.length)
  })

  it('actually changes the shape it is carrying', () => {
    for (const s of SEAMS) {
      const key = `${s.from}->${s.to}`
      const moved = s.a[0] !== s.b[0] || s.a[1] !== s.b[1]
      const resized = s.size[0] !== s.size[1] || s.ratio[0] !== s.ratio[1]
      // A mark that neither travels nor changes proportion is a rectangle
      // fading in and out in one place, which announces a boundary instead of
      // carrying something across it -- and would pass every other assertion
      // in this file.
      expect(moved, `${key} does not travel`).toBe(true)
      expect(resized, `${key} does not change shape`).toBe(true)
    }
  })

  it('keeps every interpolated pair finite and positive where it has to be', () => {
    for (const s of SEAMS) {
      const key = `${s.from}->${s.to}`
      for (const [name, pair] of [['size', s.size], ['ratio', s.ratio]] as const) {
        for (const v of pair) {
          expect(Number.isFinite(v), `${key} ${name} is not finite`).toBe(true)
          expect(v, `${key} ${name} is not positive`).toBeGreaterThan(0)
        }
      }
      // Viewport fractions. Outside [0, 1] the mark is off screen for part of
      // its own crossing, which is invisible in code and obvious on the page.
      for (const v of [...s.a, ...s.b]) {
        expect(v, `${key} sits outside the viewport`).toBeGreaterThanOrEqual(0)
        expect(v).toBeLessThanOrEqual(1)
      }
    }
  })
})
