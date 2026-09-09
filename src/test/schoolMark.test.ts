import { describe, expect, it } from 'vitest'
import { markSize, schoolMark } from '@/features/welcome/schoolMark'
import { SCHOOLS } from '@/data/schools'

/**
 * The closing mark, and the rule it exists to keep.
 *
 * `schools.ts` curates each of the fifteen monograms by hand because inventing
 * one would put made-up initials next to a real institution's name. These
 * check that nothing here ever derives a set.
 */

describe('schoolMark', () => {
  it('uses the curated monogram for a school on the list', () => {
    const first = SCHOOLS[0]!
    const mark = schoolMark(first.name)
    expect(mark).toEqual({ kind: 'monogram', text: first.monogram, name: first.name })
  })

  it('matches on the acronym too, since that is what people type', () => {
    const withAcronym = SCHOOLS.find((s) => s.acronym)
    if (!withAcronym) return
    expect(schoolMark(withAcronym.acronym!)).toEqual({
      kind: 'monogram', text: withAcronym.monogram, name: withAcronym.name,
    })
  })

  it('ignores case and surrounding space', () => {
    const first = SCHOOLS[0]!
    expect(schoolMark(`  ${first.name.toUpperCase()}  `)?.text).toBe(first.monogram)
  })

  it('NEVER derives initials for a school it does not know', () => {
    // The whole point. A formula would turn "Springfield Secondary" into "SS",
    // which is an acronym that school may not use and that Calenda has no
    // standing to assert on its behalf.
    const mark = schoolMark('Springfield Secondary')
    expect(mark).toEqual({
      kind: 'name', text: 'Springfield Secondary', name: 'Springfield Secondary',
    })
    expect(mark?.text).not.toBe('SS')
  })

  it('shows an unknown school in full rather than truncating it', () => {
    const long = 'The Very Long Name Of A School Somebody Typed In'
    expect(schoolMark(long)?.text).toBe(long)
  })

  it('is null when no school was given, so nothing is drawn', () => {
    expect(schoolMark(null)).toBeNull()
    expect(schoolMark(undefined)).toBeNull()
    expect(schoolMark('')).toBeNull()
    expect(schoolMark('   ')).toBeNull()
  })
})

describe('markSize', () => {
  it('makes a single initial large and an acronym small', () => {
    // Invented letters, not any school's real monogram. The name guard fails
    // on a real one appearing anywhere but src/data/schools.ts -- including
    // in a test fixture, which is where I first put one.
    const one = markSize({ kind: 'monogram', text: 'Q', name: 'x' })
    const four = markSize({ kind: 'monogram', text: 'QZQZ', name: 'x' })
    expect(one).toBeGreaterThan(four)
  })

  it('shrinks monotonically as there is more to set', () => {
    // A four-letter acronym rendering LARGER than a three-letter one would be
    // the kind of thing that only shows up on one school's screen.
    const sizes = ['Q', 'QZ', 'QZQ', 'QZQZ']
      .map((text) => markSize({ kind: 'monogram', text, name: 'x' }))
    for (let i = 1; i < sizes.length; i++) {
      expect(sizes[i]!).toBeLessThan(sizes[i - 1]!)
    }
  })

  it('sets a typed-in name smaller than any acronym, and smaller as it grows', () => {
    const acronym = markSize({ kind: 'monogram', text: 'QZQZ', name: 'x' })
    const shortName = markSize({ kind: 'name', text: 'Northview', name: 'x' })
    const longName = markSize({
      kind: 'name', text: 'The Very Long Name Of A School Somebody Typed', name: 'x',
    })
    expect(shortName).toBeLessThan(acronym)
    expect(longName).toBeLessThan(shortName)
  })

  it('never returns zero or a negative, at any length', () => {
    const absurd = 'x'.repeat(400)
    expect(markSize({ kind: 'name', text: absurd, name: absurd })).toBeGreaterThan(0)
  })

  it('handles every real school on the list', () => {
    for (const school of SCHOOLS) {
      const mark = schoolMark(school.name)!
      expect(mark.kind).toBe('monogram')
      expect(markSize(mark)).toBeGreaterThan(0)
    }
  })
})
