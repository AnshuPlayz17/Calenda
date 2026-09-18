import { describe, expect, it } from 'vitest'
import { execFileSync } from 'node:child_process'
import { readFileSync, statSync } from 'node:fs'

/**
 * No key-shaped string may enter the tree.
 *
 * "Check git for secrets" was one line on a list, and a one-time check is the
 * wrong answer to it: a scan that passes today says nothing about the commit
 * somebody makes at midnight with a Groq key pasted into a function to see
 * whether it works. History was scanned once (clean, every commit, every
 * pattern below). This is the part that keeps being true.
 *
 * The patterns are provider prefixes rather than entropy, because entropy
 * flags minified output, hashes, base64 fixtures and the CSP's own sha256
 * digests, and a guard that cries wolf gets deleted rather than obeyed -- which
 * this project has already written down about a different check.
 *
 * JWTs are included deliberately even though the Supabase anon key is safe in a
 * browser by design. **An anon key and a service-role key are the same shape**:
 * both are `eyJhbGciOi...`, and the second one bypasses every row-level policy
 * in the database. Nothing reading a string can tell them apart, so neither
 * belongs in a file. The anon key arrives through `import.meta.env` at build
 * time, which is the whole reason `.env.example` holds a placeholder.
 *
 * Mutation-tested: each pattern below was planted in a source file in turn and
 * this failed on every one.
 */

const PATTERNS: Array<[string, RegExp]> = [
  ['OpenAI', /\bsk-[A-Za-z0-9_-]{20,}/],
  ['Groq', /\bgsk_[A-Za-z0-9]{20,}/],
  ['Google API', /\bAIza[0-9A-Za-z_-]{30,}/],
  ['Brevo', /\bxkeysib-[A-Za-z0-9-]{30,}/],
  ['Resend', /\bre_[A-Za-z0-9]{20,}/],
  ['GitHub token', /\bgh[pousr]_[A-Za-z0-9]{30,}/],
  ['JWT (anon or service-role -- same shape)', /\beyJhbGciOi[A-Za-z0-9_-]{20,}/],
  ['private key block', /-----BEGIN [A-Z ]*PRIVATE KEY-----/],
  ['Supabase service role', /\bservice_role[^\n]{0,40}eyJ/],
]

/** Tracked text files only. Binary and lockfiles are noise here. */
function trackedText(): string[] {
  return execFileSync('git', ['ls-files'], { encoding: 'utf8', cwd: process.cwd() })
    .split('\n')
    .filter(Boolean)
    .filter((f) => !/package-lock\.json$/.test(f))
    .filter((f) => !/\.(png|jpe?g|gif|webp|ico|woff2?|ttf|otf|pdf|zip)$/i.test(f))
    .filter((f) => {
      try { return statSync(f).isFile() } catch { return false }
    })
}

describe('secrets', () => {
  it('scanned a real tree', () => {
    // A scan that matched no files would pass forever.
    const files = trackedText()
    expect(files.length).toBeGreaterThan(100)
    expect(files).toContain('.env.example')
  })

  it('appear nowhere in the tracked tree', () => {
    const offenders: string[] = []
    for (const file of trackedText()) {
      let body: string
      try { body = readFileSync(file, 'utf8') } catch { continue }
      for (const [name, re] of PATTERNS) {
        const m = re.exec(body)
        // The match itself is never printed. A test failure is written to CI
        // logs, and a guard that leaks the credential it caught is worse than
        // no guard -- name the file and the kind, and let a person look.
        if (m) offenders.push(`${file}: ${name}`)
      }
    }
    expect(offenders).toEqual([])
  })

  it('are not what .env.example hands a new contributor', () => {
    const example = readFileSync('.env.example', 'utf8')
    // Only the two values that are safe in a browser, and both placeholders.
    expect(example).toMatch(/VITE_SUPABASE_URL=/)
    expect(example).toMatch(/VITE_SUPABASE_ANON_KEY=/)
    expect(example).not.toMatch(/SERVICE_ROLE|MODEL_API_KEY|BREVO_API_KEY|VAPID_PRIVATE/)
    for (const [, re] of PATTERNS) expect(re.test(example)).toBe(false)
  })

  it('cannot reach the browser through anything but the two VITE_ values', () => {
    // A secret in an Edge Function is correct; the same name read through
    // import.meta.env in src/ would bake it into the bundle. Vite only exposes
    // VITE_-prefixed names, so this is about the ones deliberately added.
    const src = execFileSync('git', ['ls-files', 'src'], { encoding: 'utf8' })
      .split('\n')
      .filter((f) => /\.(ts|tsx)$/.test(f))
    const names = new Set<string>()
    for (const f of src) {
      for (const m of readFileSync(f, 'utf8').matchAll(/import\.meta\.env\.([A-Z0-9_]+)/g)) {
        if (m[1]) names.add(m[1])
      }
    }
    expect(names.size).toBeGreaterThan(0)
    // VITE_VAPID_PUBLIC_KEY is a public key by construction -- it is what the
    // browser subscribes with, and its private half lives in Supabase.
    const allowed = new Set([
      'VITE_SUPABASE_URL', 'VITE_SUPABASE_ANON_KEY', 'VITE_VAPID_PUBLIC_KEY',
      // Vite's own, not one of ours: the path the app is served from, which is
      // /Calenda/ on Pages. Listed because the assertion is about names that
      // were deliberately added, and this one was not.
      'BASE_URL',
    ])
    expect([...names].filter((n) => !allowed.has(n))).toEqual([])
  })
})
