/**
 * No school is named anywhere in this repository.
 *
 * Calenda started at one school and its name was scattered across the UI, the
 * disclaimers, the brand lockup, the design-system notes and the discovery
 * archive. The owner asked for all of it gone, because the product is meant to
 * serve more than one school and a named one in the footer is a promise about
 * whose product this is.
 *
 * Removing it once is easy; keeping it out is the part that needs a test.
 * "Not affiliated with X" is exactly the phrase somebody reaches for when
 * writing a disclaimer, so the name comes back through the door marked
 * caution. This walks the tracked text files and fails on any of it.
 *
 * The needles are assembled from fragments so this file is not itself a match
 * for the thing it forbids.
 */
import { describe, expect, it } from 'vitest'
import { execFileSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import path from 'node:path'

const ROOT = path.resolve(__dirname, '../..')

/** Built rather than written, so the guard does not trip over itself. */
const FORBIDDEN = [
  ['university', 'of', 'toronto'].join(' '),
  ['u', 'of', 't'].join(' '),
  'utschools',
]

const TEXT = /\.(ts|tsx|js|jsx|css|html|md|json|sql|yml|yaml|py|sh|toml)$/
/** The abbreviation on its own. Plenty of ordinary words contain it: shortcuts,
 *  outputs, puts -- so a bare substring search would fail on the whole codebase. */
const ABBREVIATION = new RegExp(`(^|[^a-z])${'u' + 't' + 's'}([^a-z]|$)`)

function trackedTextFiles(): string[] {
  return execFileSync('git', ['ls-files'], { cwd: ROOT, encoding: 'utf8' })
    .split('\n')
    .filter((f) => f && TEXT.test(f))
    .filter((f) => !f.endsWith('noSchoolName.test.ts'))
    .filter((f) => f !== 'package-lock.json')
}

describe('no school is named in the source', () => {
  it('has no occurrence of the school Calenda started at', () => {
    const offenders: string[] = []

    for (const file of trackedTextFiles()) {
      const lines = readFileSync(path.join(ROOT, file), 'utf8').split('\n')
      lines.forEach((line, i) => {
        const lower = line.toLowerCase()
        if (FORBIDDEN.some((needle) => lower.includes(needle)) || ABBREVIATION.test(lower)) {
          offenders.push(`${file}:${i + 1}`)
        }
      })
    }

    expect(offenders).toEqual([])
  })

  it('has no occurrence in a file or directory name either', () => {
    const all = execFileSync('git', ['ls-files'], { cwd: ROOT, encoding: 'utf8' })
      .split('\n')
      .filter(Boolean)
    const offenders = all.filter((f) => {
      const lower = f.toLowerCase()
      return (
        FORBIDDEN.some((needle) => lower.includes(needle.replace(/ /g, '-')))
        || ABBREVIATION.test(lower.replace(/[^a-z]/g, ' '))
      )
    })
    expect(offenders).toEqual([])
  })

  it('checks a meaningful number of files, so a broken glob cannot pass it', () => {
    expect(trackedTextFiles().length).toBeGreaterThan(50)
  })
})
