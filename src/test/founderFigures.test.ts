import { describe, it, expect } from 'vitest'
import { computeStats } from '../../scripts/projectStats.mjs'
import { projectStats } from '../data/stats'

/**
 * The founder panel prints how much of this project exists. It used to print a
 * hardcoded array in which every figure had drifted -- 27 tables against 33, 54
 * policies against 72, 117 tests against 318 -- on a page whose whole argument
 * is that its contents can be checked.
 *
 * Most of those figures are substituted at build time now, so they cannot go
 * stale. What can still break is the substitution itself: drop the `define`
 * from vite.config.ts and `__PROJECT_STATS__` is simply not there, every figure
 * reads `undefined`, and `CountUp` renders NaN on the live page while every
 * other test passes. This calls the same `computeStats()` the config calls
 * rather than re-counting here -- a test that reproduces the logic it is
 * checking tests that a copy behaves, not that the app does.
 */
describe('the founder panel figures', () => {
  const computed = computeStats(process.cwd())

  it.each(Object.keys(computed) as (keyof typeof computed)[])(
    'is substituted from the repository: %s',
    (key) => {
      expect(projectStats[key]).toBe(computed[key])
    },
  )

  it('has a test count, which only the runner can supply', () => {
    // A regex over the source gives 314 where vitest gives 318: one `it.each`
    // over five files is one match and five tests. If this ever reads as a
    // plausible number counted the cheap way, the panel is back to claiming
    // something nothing verified. `posttest` holds it to the run itself.
    expect(Number.isInteger(projectStats.tests)).toBe(true)
    expect(projectStats.tests).toBeGreaterThan(0)
  })

  it('is all real figures, so nothing on the page can render NaN', () => {
    for (const [key, value] of Object.entries(projectStats)) {
      expect(Number.isFinite(value), `${key} is ${value}`).toBe(true)
    }
  })
})
