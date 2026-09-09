import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'

/**
 * The select list and the type it fills, held together.
 *
 * WHAT HAPPENED
 *
 * `loadProfile` named seven columns while `Profile` had grown to twelve, and
 * nothing failed anywhere: a column left out of a select is `undefined` at
 * runtime, which every reader treats as "not set". So `profile.school` was
 * always empty and the walkthrough's closing monogram never appeared for
 * anyone; `timetable_cycle_length` was always null, so a cycle saved from
 * Settings looked right until the page was reloaded, because `updateProfile`
 * merges its patch into local state and only a reload asks the database.
 *
 * Neither the typechecker nor any test could see it. `data as Profile` asserts
 * the shape rather than checking it, and every screen involved reads through
 * `?? null`, which is exactly the right thing to write and exactly what makes
 * a missing column indistinguishable from an empty one.
 *
 * So this reads the source. It is the only place the two facts meet.
 */

const src = readFileSync('src/lib/auth.tsx', 'utf8')

function profileFields(): string[] {
  const start = src.indexOf('export type Profile = {')
  expect(start).toBeGreaterThan(-1)
  const end = src.indexOf('\n}', start)
  const body = src.slice(start, end)
  // Field names at the top level of the type: `  name: ...` or `  name?: ...`.
  // Doc comments and the nested unions inside them are indented further or do
  // not end in a colon, so they do not match.
  return [...body.matchAll(/^ {2}(\w+)\??:/gm)].map((m) => m[1]!)
}

function selectedColumns(): string[] {
  // The literal inside loadProfile's own `.select(...)`. It stays a literal
  // rather than a named constant because supabase-js parses the string at the
  // type level and a joined one widens to `string`, taking that with it.
  const m = src.match(/\.select\('(id,[^']+)'\)/)
  expect(m, "loadProfile's select literal was not found").not.toBeNull()
  return m![1]!.split(',').map((c) => c.trim())
}

describe('the profile select list', () => {
  it('finds both sides, so a rename fails loudly instead of passing on nothing', () => {
    expect(profileFields().length).toBeGreaterThanOrEqual(10)
    expect(selectedColumns().length).toBeGreaterThanOrEqual(10)
  })

  it('names every field the app expects to have', () => {
    const missing = profileFields().filter((f) => !selectedColumns().includes(f))
    expect(missing, `columns in Profile but not fetched: ${missing.join(', ')}`).toEqual([])
  })

  it('fetches nothing the type has no room for', () => {
    // The other direction matters less but costs nothing to hold: a column
    // fetched and not typed is a column somebody meant to use and did not.
    const extra = selectedColumns().filter((c) => !profileFields().includes(c))
    expect(extra, `fetched but not in Profile: ${extra.join(', ')}`).toEqual([])
  })

  it('is the profiles select and not some other table\'s', () => {
    // The regex above would happily match a select on any table that begins
    // with an `id` column, which would make every assertion here about the
    // wrong list.
    const at = src.search(/\.select\('id,[^']+'\)/)
    expect(at).toBeGreaterThan(-1)
    // The nearest `.from(...)` above it, whatever sits in between -- there is a
    // long comment there, so a fixed-size window is the wrong tool.
    const before = [...src.slice(0, at).matchAll(/\.from\('(\w+)'\)/g)]
    expect(before.at(-1)![1]).toBe('profiles')
  })
})
