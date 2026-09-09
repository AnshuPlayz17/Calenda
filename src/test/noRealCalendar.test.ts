import { describe, expect, it } from 'vitest'
import { execFileSync } from 'node:child_process'

/**
 * The real calendar must not reach the app.
 *
 * One school's actual 2026-27 calendar is kept as a test fixture, because the
 * import and duplicate-review work needs a real document to be honest about --
 * the repeated titles, the one break filed as two entries, the corrupt
 * punctuation. Those are properties of real school calendars, which is the
 * whole reason the software has to survive them.
 *
 * It used to live in src/data, where it was imported by the preview dataset and
 * by the import screen. So it was in the production bundle twice over, and the
 * preview banner announced it: "Showing the real 2026-27 school calendar as
 * sample data". No school was named, so the name guard passed -- while the
 * landing page had already moved to invented data precisely because one
 * school's dates are somebody else's dates.
 *
 * Moving it under src/test makes shipping it require an import across that
 * boundary. This makes it fail instead.
 */

const files = execFileSync('git', ['ls-files', 'src'], { encoding: 'utf8' })
  .split('\n')
  .filter(Boolean)
  .filter((f) => !f.startsWith('src/test/'))

describe('the real school calendar', () => {
  it('is not imported by anything that ships', () => {
    const offenders = files.filter((f) => {
      const body = execFileSync('cat', [f], { encoding: 'utf8' })
      // Comments stripped first. sampleSchoolYear's own doc comment explains
      // that it exists *instead of* the real calendar and names it to do so,
      // which is the opposite of a violation -- the first version of this test
      // failed on exactly that.
      const code = body
        .replace(/\/\*[\s\S]*?\*\//g, '')
        .replace(/^\s*\/\/.*$/gm, '')
      return /realCalendar2026_27|schoolEvents2026_27|SCHOOL_YEAR_2026_27/.test(code)
    })
    expect(offenders).toEqual([])
  })

  it('still exists for the tests that need a real document', async () => {
    const { schoolEvents2026_27 } = await import('./fixtures/realCalendar2026_27')
    expect(schoolEvents2026_27.length).toBeGreaterThan(40)
  })
})
