import type { Grade } from '@/lib/types'

/**
 * What an average is, and what it deliberately leaves out.
 *
 * No average is stored anywhere. It is computed on read, every time, because a
 * stored average is a second copy of a fact that goes stale silently -- and a
 * mark somebody did not expect is the worst possible thing for this app to be
 * confidently wrong about.
 *
 * `counted` and `ignored` come back with the number for the same reason. "82%"
 * is a claim; "82%, from 5 of 7 marks" is a claim you can check, and it makes
 * visible the two rows that were left out rather than quietly folding them in
 * as zeroes.
 */
export type Average = {
  /** 0..100, or null when nothing could be counted. */
  percent: number | null
  /** Rows that contributed. */
  counted: number
  /**
   * Rows that could not: not marked yet, or a letter with no number behind it.
   * They are excluded rather than treated as zero -- an unmarked test is not
   * a test you failed.
   */
  ignored: number
}

/**
 * Weighted, because a test is not worth the same as a homework and an average
 * that pretends otherwise is wrong in the direction that matters most.
 */
export function averageOf(grades: Grade[]): Average {
  let weighted = 0
  let weight = 0
  let counted = 0
  let ignored = 0

  for (const g of grades) {
    // Both halves, and a non-zero denominator. `out_of` is constrained > 0 in
    // the database, so a zero here would mean a row that predates that -- and
    // dividing by it would put Infinity into somebody's average.
    if (g.score === null || g.out_of === null || g.out_of <= 0) {
      ignored++
      continue
    }
    // A zero-weight row is a real thing -- a practice test you want recorded
    // and not counted -- and it must not contribute or be called ignored.
    if (g.weight === 0) continue

    weighted += (g.score / g.out_of) * g.weight
    weight += g.weight
    counted++
  }

  if (weight === 0) return { percent: null, counted: 0, ignored }
  return {
    // Rounded to one place. Two is false precision on five marks, and none
    // makes a 79.6 look like a 79 flat.
    percent: Math.round((weighted / weight) * 1000) / 10,
    counted,
    ignored,
  }
}

/** How the average was reached, in words, so the number can be checked. */
export function averageNote(avg: Average): string | null {
  if (avg.percent === null) return null
  const from = `from ${avg.counted} mark${avg.counted === 1 ? '' : 's'}`
  if (avg.ignored === 0) return `Weighted, ${from}.`
  return `Weighted, ${from}. ${avg.ignored} not counted — not marked yet, or no number to count.`
}

/** "17 / 20", "B+", or an em dash. Never an invented number. */
export function scoreLabel(g: Pick<Grade, 'score' | 'out_of' | 'letter'>): string {
  if (g.score !== null && g.out_of !== null) return `${trim(g.score)} / ${trim(g.out_of)}`
  if (g.letter) return g.letter
  return '—'
}

/** The percentage for one row, or null. */
export function percentOf(g: Pick<Grade, 'score' | 'out_of'>): number | null {
  if (g.score === null || g.out_of === null || g.out_of <= 0) return null
  return Math.round((g.score / g.out_of) * 1000) / 10
}

/** 17.000 reads as a mistake; 17 does not. */
function trim(n: number): string {
  return String(Math.round(n * 1000) / 1000)
}
