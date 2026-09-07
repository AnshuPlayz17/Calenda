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
import { existsSync, readFileSync } from 'node:fs'
import path from 'node:path'

const ROOT = path.resolve(__dirname, '../..')

/** Built rather than written, so the guard does not trip over itself. */
const FORBIDDEN = [
  ['university', 'of', 'toronto'].join(' '),
  ['u', 'of', 't'].join(' '),
  'utschools',
]

const TEXT = /\.(ts|tsx|js|jsx|mjs|cjs|css|html|md|json|sql|yml|yaml|py|sh|toml)$/
/** The abbreviation on its own. Plenty of ordinary words contain it: shortcuts,
 *  outputs, puts -- so a bare substring search would fail on the whole codebase. */
const ABBREVIATION = new RegExp(`(^|[^a-z])${'u' + 't' + 's'}([^a-z]|$)`)

/**
 * Everything git would consider part of the project: tracked files plus new
 * ones that are not ignored.
 *
 * `--others --exclude-standard` matters. Plain `ls-files` misses a brand-new
 * file until it is staged, which is precisely when a fresh mention of the name
 * would be introduced and precisely when this test should catch it. And a file
 * deleted but not yet staged is still listed, so anything gone from disk is
 * skipped rather than crashing the run.
 */
function projectFiles(): string[] {
  return execFileSync('git', ['ls-files', '--cached', '--others', '--exclude-standard'], {
    cwd: ROOT,
    encoding: 'utf8',
  })
    .split('\n')
    .filter(Boolean)
    .filter((f) => existsSync(path.join(ROOT, f)))
}

function trackedTextFiles(): string[] {
  return projectFiles()
    .filter((f) => TEXT.test(f))
    .filter((f) => !f.endsWith('noSchoolName.test.ts'))
    // The landing page names fifteen schools. They live in exactly one file so
    // that this guard can keep its teeth everywhere else: a school named in a
    // disclaimer, a headline, a component or a doc still fails, which is where
    // the claim of ownership would actually be made.
    .filter((f) => f !== 'src/data/schools.ts')
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
    const offenders = projectFiles().filter((f) => {
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
