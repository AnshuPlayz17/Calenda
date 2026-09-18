import { describe, expect, it } from 'vitest'
import { readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'

/**
 * No real school's own documents in this repository.
 *
 * `docs/discovery/source/` held a real school's "Important Dates" PDF and the
 * JSON extracted from it, in a public repo, for the life of the project. It
 * was flagged in CLAUDE.md as known and left there, because nothing imported
 * it and the rule it broke -- never associate Calenda with a named school --
 * was being read as being about the app rather than about the repository.
 *
 * `noRealCalendar.test.ts` already stops the real calendar reaching the
 * shipped bundle. This stops a source document reaching the repository at all,
 * which is the earlier and cheaper place to catch it.
 *
 * Extensions rather than contents: a PDF's text layer is a font subset and
 * grepping one for a school's name finds nothing even when the name is printed
 * on page one, which is exactly how this survived every check.
 */
const FORBIDDEN = ['.pdf', '.doc', '.docx', '.xls', '.xlsx', '.ppt', '.pptx']

function walk(dir: string): string[] {
  const out: string[] = []
  for (const entry of readdirSync(dir)) {
    if (entry === 'node_modules' || entry === 'dist' || entry.startsWith('.')) continue
    const full = join(dir, entry)
    if (statSync(full).isDirectory()) out.push(...walk(full))
    else out.push(full)
  }
  return out
}

describe('documents belonging to somebody else', () => {
  it('are not in this repository', () => {
    const files = walk(process.cwd())
    // The scan has to have looked at something, or this passes forever.
    expect(files.length, 'the walk found no files').toBeGreaterThan(100)

    const documents = files.filter((f) =>
      FORBIDDEN.some((ext) => f.toLowerCase().endsWith(ext)))

    expect(
      documents,
      `${documents.join(', ')} — a document like this is somebody else's, and `
        + 'this repository is public. If one is genuinely needed for testing, it '
        + 'belongs in src/test/fixtures/ with a guard, like the real calendar.',
    ).toEqual([])
  })
})
