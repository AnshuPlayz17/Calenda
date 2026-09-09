import { describe, expect, it } from 'vitest'
import {
  averageNote, averageOf, percentOf, scoreLabel,
} from '@/features/grades/average'
import type { Grade } from '@/lib/types'

let seq = 0
function grade(over: Partial<Grade> = {}): Grade {
  seq++
  return {
    id: `g${seq}`,
    owner_id: 'o1',
    class_id: 'c1',
    assignment_id: null,
    title: `Mark ${seq}`,
    score: 10,
    out_of: 10,
    letter: null,
    weight: 1,
    category: null,
    term: null,
    recorded_on: null,
    notes: null,
    source: 'manual',
    shared_with_parents: false,
    created_at: '2026-09-01T00:00:00Z',
    updated_at: '2026-09-01T00:00:00Z',
    ...over,
  }
}

describe('averageOf', () => {
  it('is the plain mean when everything weighs the same', () => {
    const got = averageOf([
      grade({ score: 8, out_of: 10 }),
      grade({ score: 6, out_of: 10 }),
    ])
    expect(got.percent).toBe(70)
    expect(got.counted).toBe(2)
  })

  it('weights, because a test is not a homework', () => {
    // 90% at weight 3 and 50% at weight 1 is 80, not 70.
    const got = averageOf([
      grade({ score: 90, out_of: 100, weight: 3 }),
      grade({ score: 50, out_of: 100, weight: 1 }),
    ])
    expect(got.percent).toBe(80)
  })

  it('keeps what a mark was out of rather than averaging percentages badly', () => {
    // 17/20 and 41/50 are 85% and 82%.
    const got = averageOf([
      grade({ score: 17, out_of: 20 }),
      grade({ score: 41, out_of: 50 }),
    ])
    expect(got.percent).toBe(83.5)
  })

  it('leaves an unmarked row out instead of counting it as zero', () => {
    // The single most important behaviour here. An upcoming test is not a test
    // you failed, and an app that says so will not be trusted again.
    const got = averageOf([
      grade({ score: 18, out_of: 20 }),
      grade({ score: null, out_of: null }),
    ])
    expect(got.percent).toBe(90)
    expect(got.counted).toBe(1)
    expect(got.ignored).toBe(1)
  })

  it('leaves a letter-only row out, having no number to count', () => {
    const got = averageOf([
      grade({ score: 18, out_of: 20 }),
      grade({ score: null, out_of: null, letter: 'B+' }),
    ])
    expect(got.percent).toBe(90)
    expect(got.ignored).toBe(1)
  })

  it('excludes a zero-weight row without calling it ignored', () => {
    // A practice test you want recorded and not counted is a real thing, and
    // it is not the same as a row that could not be read.
    const got = averageOf([
      grade({ score: 20, out_of: 20 }),
      grade({ score: 0, out_of: 20, weight: 0 }),
    ])
    expect(got.percent).toBe(100)
    expect(got.counted).toBe(1)
    expect(got.ignored).toBe(0)
  })

  it('never divides by zero, however old the row', () => {
    const got = averageOf([grade({ score: 5, out_of: 0 })])
    expect(got.percent).toBeNull()
    expect(Number.isFinite(got.percent ?? 0)).toBe(true)
  })

  it('is null rather than zero for a class with nothing marked', () => {
    // Zero is a mark. Null is "no marks", and the difference is the whole
    // reason this returns a nullable number.
    const got = averageOf([grade({ score: null, out_of: null })])
    expect(got.percent).toBeNull()
    expect(got.counted).toBe(0)
  })

  it('is null for an empty list', () => {
    expect(averageOf([]).percent).toBeNull()
  })

  it('rounds to one place, which is as precise as five marks can be', () => {
    const got = averageOf([grade({ score: 2, out_of: 3 })])
    expect(got.percent).toBe(66.7)
  })

  it('handles a mark above full without clamping it', () => {
    // Bonus marks exist. Silently capping at 100 would hide them.
    expect(averageOf([grade({ score: 22, out_of: 20 })]).percent).toBe(110)
  })
})

describe('averageNote', () => {
  it('says nothing when there is no average', () => {
    expect(averageNote({ percent: null, counted: 0, ignored: 0 })).toBeNull()
  })

  it('says how many it counted', () => {
    expect(averageNote({ percent: 80, counted: 5, ignored: 0 }))
      .toBe('Weighted, from 5 marks.')
  })

  it('does not say "1 marks"', () => {
    expect(averageNote({ percent: 80, counted: 1, ignored: 0 }))
      .toBe('Weighted, from 1 mark.')
  })

  it('names what it left out rather than hiding it', () => {
    expect(averageNote({ percent: 80, counted: 5, ignored: 2 }))
      .toContain('2 not counted')
  })
})

describe('scoreLabel', () => {
  it('keeps the denominator', () => {
    expect(scoreLabel({ score: 17, out_of: 20, letter: null })).toBe('17 / 20')
  })

  it('falls back to a letter when there is no number', () => {
    expect(scoreLabel({ score: null, out_of: null, letter: 'Level 3' })).toBe('Level 3')
  })

  it('shows a dash rather than inventing anything', () => {
    expect(scoreLabel({ score: null, out_of: null, letter: null })).toBe('—')
  })

  it('does not render 17.000', () => {
    expect(scoreLabel({ score: 17.0, out_of: 20.0, letter: null })).toBe('17 / 20')
  })

  it('keeps a genuine half mark', () => {
    expect(scoreLabel({ score: 17.5, out_of: 20, letter: null })).toBe('17.5 / 20')
  })
})

describe('percentOf', () => {
  it('is null when there is nothing to divide', () => {
    expect(percentOf({ score: null, out_of: 20 })).toBeNull()
    expect(percentOf({ score: 10, out_of: null })).toBeNull()
    expect(percentOf({ score: 10, out_of: 0 })).toBeNull()
  })

  it('rounds to one place', () => {
    expect(percentOf({ score: 2, out_of: 3 })).toBe(66.7)
  })
})
