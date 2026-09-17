import { describe, expect, it } from 'vitest'
import { readFileSync, readdirSync } from 'node:fs'
import { join, relative } from 'node:path'
import { DATA_CATEGORIES, DORMANT_TABLES, PRIVACY, TERMS, NEEDS_OWNER } from '@/content/legal'

/**
 * The privacy policy must not drift from the database.
 *
 * This file exists because of the thing this project keeps getting caught by:
 * a claim that is not downstream of the fact it describes. The founder panel's
 * figures drifted for weeks. FACTS.md said reminders were verified end to end
 * when none had ever been delivered. A privacy policy is the same shape of
 * claim and a worse one to get wrong -- it is a statement to the people using
 * the app about what is held on them, and nothing about prose fails when a
 * migration adds a table.
 *
 * So the policy names its tables, and this holds the two together in both
 * directions: every table in the schema must be accounted for, and every table
 * the policy names must exist. Adding a table without saying what is in it
 * turns the suite red.
 *
 * Mutation-tested, because an assertion that has never been seen to fail is a
 * comment. Four things were broken on purpose: dropping a category, renaming a
 * table inside one, adding a `create table` to a migration, and making the app
 * reference a table listed as dormant.
 *
 * Three failed and THE MIGRATION ONE PASSED, which is the whole reason the
 * mutation run is not optional. Both file lists came from `git ls-files`,
 * copied from the guard next door -- and that lists *tracked* files only, so a
 * migration written five seconds ago is invisible to it. A guard whose entire
 * purpose is to fire when somebody adds a table could not see a table being
 * added. It walks the directory now, and all four mutations fail.
 */

const root = process.cwd()

/** The migrations, comments already stripped. */
function migrationSql(): string[] {
  const dir = join(root, 'supabase/migrations')
  return readdirSync(dir)
    .filter((f) => f.endsWith('.sql'))
    .map((f) =>
      readFileSync(join(dir, f), 'utf8')
        .replace(/\/\*[\s\S]*?\*\//g, '')
        .replace(/^\s*--.*$/gm, ''),
    )
}

/** Every table the migrations create, in the order they appear. */
function schemaTables(): string[] {
  const dir = join(root, 'supabase/migrations')
  const files = readdirSync(dir).filter((f) => f.endsWith('.sql')).map((f) => join(dir, f))

  const found = new Set<string>()
  for (const f of files) {
    // Comments first, always. This repo has shipped four guards that matched
    // the paragraph explaining a property rather than the property, and a
    // migration header that says "create table profiles" while describing
    // something else is exactly that trap again.
    const sql = readFileSync(f, 'utf8')
      .replace(/\/\*[\s\S]*?\*\//g, '')
      .replace(/^\s*--.*$/gm, '')

    for (const m of sql.matchAll(/create\s+table\s+(?:if\s+not\s+exists\s+)?(?:public\.)?([a-z_][a-z0-9_]*)/gi)) {
      if (m[1]) found.add(m[1].toLowerCase())
    }
  }
  return [...found]
}

/**
 * The one file excluded below: the policy module itself.
 *
 * It declares DORMANT_TABLES, so it names all four of them in code rather than
 * in a comment, and stripping comments cannot tell that apart from a query.
 * This is the trap this repo has now hit five times -- an assertion anchored on
 * a name that also appears in the thing doing the asserting -- and the honest
 * fix is to name the declaring file rather than to widen the pattern until it
 * stops noticing. It is asserted to be exactly one file, so the exclusion
 * cannot quietly grow into a list that swallows a real offender.
 */
const DECLARES_THE_LIST = 'src/content/legal.ts'

/** Source that ships or runs, with comments removed. */
function walk(dir: string): string[] {
  const out: string[] = []
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    if (e.name === 'node_modules' || e.name === 'dist') continue
    const full = join(dir, e.name)
    if (e.isDirectory()) out.push(...walk(full))
    else if (/\.(ts|tsx)$/.test(e.name)) out.push(full)
  }
  return out
}

function liveSource(): Array<[string, string]> {
  const files = [...walk(join(root, 'src')), ...walk(join(root, 'supabase/functions'))]
    .filter((f) => !relative(root, f).startsWith('src/test/'))
    .filter((f) => relative(root, f) !== DECLARES_THE_LIST)

  return files.map((f) => [
    relative(root, f),
    readFileSync(f, 'utf8')
      .replace(/\/\*[\s\S]*?\*\//g, '')
      .replace(/^\s*\/\/.*$/gm, ''),
  ])
}

const TABLES = schemaTables()
const CLAIMED = [...DATA_CATEGORIES.flatMap((c) => c.tables), ...DORMANT_TABLES]

describe('the privacy policy against the schema', () => {
  // The rule this repo learned the hard way: a parser that silently matches
  // nothing passes every assertion built on it. Say what was found.
  it('found the schema at all', () => {
    expect(TABLES.length).toBeGreaterThan(30)
    expect(TABLES).toContain('profiles')
  })

  it('accounts for every table in the schema', () => {
    const unexplained = TABLES.filter((t) => !CLAIMED.includes(t))
    expect(unexplained).toEqual([])
  })

  it('really does protect every table, as the page says it does', () => {
    // "Every table is protected by rules inside the database itself" is the
    // strongest sentence on the privacy page and the one a reader is most
    // entitled to have checked. A table created without RLS is open to every
    // signed-in client, and nothing else here would notice.
    const enabled = new Set<string>()
    for (const sql of migrationSql()) {
      for (const m of sql.matchAll(
        /alter\s+table\s+(?:public\.)?([a-z_][a-z0-9_]*)\s+enable\s+row\s+level\s+security/gi,
      )) {
        if (m[1]) enabled.add(m[1].toLowerCase())
      }
    }
    expect(enabled.size).toBeGreaterThan(30)
    expect(TABLES.filter((t) => !enabled.has(t))).toEqual([])
  })

  it('names no table that does not exist', () => {
    const invented = CLAIMED.filter((t) => !TABLES.includes(t))
    expect(invented).toEqual([])
  })

  it('puts each table in exactly one place', () => {
    const seen = new Map<string, number>()
    for (const t of CLAIMED) seen.set(t, (seen.get(t) ?? 0) + 1)
    expect([...seen].filter(([, n]) => n > 1).map(([t]) => t)).toEqual([])
  })
})

describe('the tables the policy calls dormant', () => {
  it('really are unwritten by anything that ships or runs', () => {
    const offenders: string[] = []
    for (const [file, code] of liveSource()) {
      for (const t of DORMANT_TABLES) {
        // Word-bounded: `files` must not match `file_links`, and
        // `google_accounts` must not be found inside a longer identifier.
        if (new RegExp(`\\b${t}\\b`).test(code)) offenders.push(`${file}: ${t}`)
      }
    }
    // toCalendarItem.ts names google_event_map in a comment to explain that it
    // is unused, which is why comments are stripped above rather than this
    // being a list of exceptions that would eventually swallow a real one.
    expect(offenders).toEqual([])
  })

  it('inspected real files, and excludes exactly one', () => {
    const files = liveSource().map(([f]) => f)
    expect(files.length).toBeGreaterThan(100)
    expect(files).not.toContain(DECLARES_THE_LIST)
    // The exclusion is one named file, not a pattern. If DORMANT_TABLES moves,
    // this fails rather than silently covering wherever it went.
    expect(readFileSync(join(root, DECLARES_THE_LIST), 'utf8')).toContain('DORMANT_TABLES')
  })
})

describe('the claims the privacy page makes about the app', () => {
  // These are the three sentences on that page a reader could most reasonably
  // want checked, and the only ones on it that a code change could quietly
  // falsify. A privacy policy is a claim, and a claim not downstream of the
  // fact is what this whole file is about.
  it('sets no cookies, so the "no cookie banner" answer stays true', () => {
    const offenders = liveSource()
      .filter(([, code]) => /document\s*\.\s*cookie|document\s*\[\s*['"`]cookie/.test(code))
      .map(([f]) => f)
    expect(offenders).toEqual([])
  })

  it('loads no third-party script or stylesheet from the document', () => {
    const html = readFileSync(join(root, 'index.html'), 'utf8')
    const remote = [...html.matchAll(/(?:src|href)="(https?:)?\/\/[^"]+"/g)].map((m) => m[0])
    // The fonts were moved off the Google CDN deliberately and the comment in
    // src/styles/fonts.ts says not to reintroduce it. This is the check.
    expect(remote).toEqual([])
  })

  it('has no analytics or error-reporting SDK', () => {
    const offenders = liveSource()
      .filter(([, code]) => /gtag\(|googletagmanager|google-analytics|posthog|mixpanel|hotjar|@sentry\//.test(code))
      .map(([f]) => f)
    expect(offenders).toEqual([])
  })
})

describe('both documents', () => {
  it('say in the reader’s own words that they are not legal advice', () => {
    // Asserted on the rendered page rather than here -- see legal.test.tsx.
    // What this checks is that the two placeholders are still visible, because
    // a half-filled legal document is worse than an obviously unfinished one.
    const text = [...PRIVACY, ...TERMS].flatMap((s) => s.body).join('\n')
    expect(text).toContain(NEEDS_OWNER)
  })

  it('have a heading and a body for every section', () => {
    for (const s of [...PRIVACY, ...TERMS]) {
      expect(s.heading.length).toBeGreaterThan(0)
      expect(s.body.length).toBeGreaterThan(0)
      for (const p of s.body) expect(p.trim().length).toBeGreaterThan(0)
    }
    expect(PRIVACY.length).toBeGreaterThan(5)
    expect(TERMS.length).toBeGreaterThan(5)
  })
})
