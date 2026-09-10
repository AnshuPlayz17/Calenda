/**
 * Counts the things the founder panel claims, from the repository itself.
 *
 * The panel used to hold a hardcoded array: 27 tables, 54 policies, 117 tests,
 * 13,421 lines. By 2026-09-10 there were 33 tables, 72 policies and 318 tests,
 * and the array had been wrong for weeks. That is the exact failure this
 * project's own rule exists to prevent -- "anything that counts them reads the
 * array rather than repeating a number in prose, so the copy cannot drift from
 * the data." The rule was written about the landing page's sample calendar and
 * then never applied to the one set of figures on the page that describes the
 * project, which is the set a reader is most likely to check.
 *
 * Exported rather than inlined into the writer so a test can run the same
 * function and fail when the committed file no longer matches. A generated file
 * nothing checks is a hardcoded file with extra steps.
 *
 * The test count is deliberately NOT counted here. Counting `it(` in the source
 * gave 314 against the runner's 318: `src/test/edgeFunctions.test.ts` has one
 * `it.each` over five files, which is one match and five tests. A regex would
 * have to evaluate the argument to know that. So the count comes from the far
 * end -- vitest's own JSON report -- and `readTestCount()` reads it.
 */
import { readdirSync, readFileSync, statSync, existsSync } from 'node:fs'
import { join, extname } from 'node:path'

function walk(dir, keep) {
  const out = []
  for (const entry of readdirSync(dir)) {
    if (entry === 'node_modules' || entry === 'dist' || entry.startsWith('.')) continue
    const full = join(dir, entry)
    if (statSync(full).isDirectory()) out.push(...walk(full, keep))
    else if (keep(full)) out.push(full)
  }
  return out
}

const count = (text, re) => (text.match(re) ?? []).length

/** Where vite.config.ts tells vitest to write its JSON report. */
export const REPORT = join('node_modules', '.vitest-report.json')

/** Every test file on disk, the set a full run has to have covered. */
export function testFiles(root = process.cwd()) {
  return walk(join(root, 'src'), (f) => /\.test\.tsx?$/.test(f))
}

/**
 * How many tests the runner last ran. Null when there is no report, and null
 * when the report describes only part of the suite -- `npx vitest run one.test.ts`
 * leaves behind a perfectly well-formed report saying 8, and writing that into
 * the founder panel would be the project's own recurring bug: a number taken
 * from something that was not the thing being measured. Null is a real answer
 * and not zero; the caller decides whether it is fatal.
 */
export function readTestCount(root = process.cwd()) {
  const path = join(root, REPORT)
  if (!existsSync(path)) return null
  const report = JSON.parse(readFileSync(path, 'utf8'))
  if (typeof report.numTotalTests !== 'number') return null
  const ran = Array.isArray(report.testResults) ? report.testResults.length : 0
  if (ran < testFiles(root).length) return null
  return report.numTotalTests
}

/** Everything that can be counted from the files, with no runner involved. */
export function computeStats(root = process.cwd()) {
  const migrations = walk(join(root, 'supabase', 'migrations'), (f) => f.endsWith('.sql'))
  const sqlTests = walk(join(root, 'supabase', 'tests'), (f) => f.endsWith('.sql'))
  const migrationText = migrations.map((f) => readFileSync(f, 'utf8')).join('\n')
  const sqlTestText = sqlTests.map((f) => readFileSync(f, 'utf8')).join('\n')

  const tsFiles = [
    ...walk(join(root, 'src'), (f) => ['.ts', '.tsx'].includes(extname(f))),
    ...walk(join(root, 'supabase', 'functions'), (f) => extname(f) === '.ts'),
  ]
  const isTest = (f) => f.includes('/test/') || f.endsWith('.test.ts') || f.endsWith('.test.tsx')

  let appLines = 0
  let testLines = 0
  for (const f of tsFiles) {
    const lines = readFileSync(f, 'utf8').split('\n').length
    if (isTest(f)) testLines += lines
    else appLines += lines
  }

  return {
    // `create table` covers both plain and `if not exists`.
    tables: count(migrationText, /create table (if not exists )?[a-z_]/gi),
    policies: count(migrationText, /create policy /gi),
    migrations: migrations.length,
    // Both helpers: rls_test.sql defines expect(), features_test.sql feat_expect().
    sqlAssertions: count(sqlTestText, /perform (feat_)?expect\(/g),
    appLines,
    testLines,
  }
}
