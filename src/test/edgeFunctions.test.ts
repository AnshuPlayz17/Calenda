// @vitest-environment node
//
// Node, not jsdom. esbuild refuses to start under jsdom -- its TextEncoder
// does not produce a Uint8Array esbuild recognises, and it throws an invariant
// error at import time rather than failing a test. Nothing here touches the
// DOM anyway; these read files off disk.
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { transformSync } from 'esbuild'
import { describe, expect, it } from 'vitest'

/**
 * The Edge Functions, checked as far as they can be checked from here.
 *
 * They run on Deno against a live Supabase project, so nothing here proves they
 * work. What it does prove is that they are not broken in the two ways that
 * would otherwise only be discovered at deploy time or, worse, in production:
 * they parse, and the one security property that makes the assistant safe is
 * still in the file.
 *
 * That property is not a detail. `calenda-chat` forwards the caller's own
 * Authorization header into its Supabase client so every read goes through RLS
 * as that user. Replacing it with the service role would be a small, tidy-
 * looking edit -- one client instead of two -- and it would turn one prompt
 * injection in one shared note into a way to read every account in the
 * database. If somebody makes that edit, this fails.
 */

const ROOT = join(process.cwd(), 'supabase', 'functions')

function tsFiles(dir: string): string[] {
  const out: string[] = []
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry)
    if (statSync(full).isDirectory()) out.push(...tsFiles(full))
    else if (entry.endsWith('.ts')) out.push(full)
  }
  return out
}

const files = tsFiles(ROOT)

describe('the Edge Functions', () => {
  it('finds them, so a moved directory fails loudly instead of silently passing', () => {
    // Without this, renaming supabase/functions makes every test below iterate
    // an empty list and report success.
    expect(files.length).toBeGreaterThanOrEqual(4)
  })

  it.each(files.map((f) => [f.replace(ROOT, 'functions'), f]))(
    '%s parses',
    (_label, file) => {
      // Deno globals and URL imports are not resolved here; this is a syntax
      // check, which is the floor rather than the ceiling. It catches the one
      // failure that would otherwise appear as a red deploy after a merge.
      expect(() =>
        transformSync(readFileSync(file, 'utf8'), { loader: 'ts', target: 'es2022' }),
      ).not.toThrow()
    },
  )

  it('the assistant still reads as the user, not as the service role', () => {
    const src = readFileSync(join(ROOT, 'calenda-chat', 'index.ts'), 'utf8')

    // The client used for every read must carry the caller's own header.
    expect(src).toMatch(/global:\s*\{\s*headers:\s*\{\s*Authorization/)

    // And every context read must go through it. `asUser` is that client; if
    // the reads are ever switched to the admin client this count drops.
    const reads = src.match(/asUser\s*\n?\s*\.from\(|asUser\.from\(/g) ?? []
    expect(reads.length).toBeGreaterThanOrEqual(5)
  })

  it('the assistant claims quota before it spends anything', () => {
    const src = readFileSync(join(ROOT, 'calenda-chat', 'index.ts'), 'utf8')
    // The CALL, not the name. The file's own header explains the ordering in
    // prose, so `indexOf('claim_chat_message')` finds the comment at the top
    // and this assertion passes however the code below is arranged -- which is
    // what it did until 2026-09-09.
    const quotaAt = src.indexOf("rpc('claim_chat_message')")
    const askAt = src.indexOf('await ask(')
    expect(quotaAt).toBeGreaterThan(-1)
    expect(askAt).toBeGreaterThan(-1)
    // A refusal has to cost nothing. If the model is asked first, the daily
    // allowance is spent by requests that are then turned away.
    expect(quotaAt).toBeLessThan(askAt)
  })

  it('the assistant checks the thread is the caller\'s before it writes anything', () => {
    const src = readFileSync(join(ROOT, 'calenda-chat', 'index.ts'), 'utf8')

    // Read with the caller's client, so RLS answers the question rather than
    // the function trusting the id it was handed.
    const checkAt = src.indexOf("asUser\n    .from('chat_threads')")
    // Where the admin client is CONSTRUCTED, not where the key is read out of
    // the environment -- that happens at the top of the file, so anchoring on
    // the constant makes this assertion impossible to satisfy and says nothing
    // about ordering.
    const adminAt = src.indexOf('createClient(SUPABASE_URL, SERVICE_KEY')
    const quotaAt = src.indexOf("rpc('claim_chat_message')")
    expect(checkAt).toBeGreaterThan(-1)
    expect(quotaAt).toBeGreaterThan(-1)
    expect(adminAt).toBeGreaterThan(-1)

    // The two writes at the end run as the service role, which does not
    // consult chat_messages_all -- the policy that already says a message may
    // only go into a thread its writer owns. Reversed or removed, this
    // function becomes the one path that can file a row against a stranger's
    // conversation and reorder their list.
    expect(checkAt).toBeLessThan(adminAt)
    // And before the quota, so a request that was never going to be answered
    // costs the caller nothing.
    expect(checkAt).toBeLessThan(quotaAt)
  })

  it('the decoder checks ownership before it opens the file', () => {
    const src = readFileSync(join(ROOT, 'calenda-decode', 'index.ts'), 'utf8')
    const ownershipAt = src.indexOf("asUser\n    .from('report_cards')")
    const downloadAt = src.indexOf('.download(')
    expect(ownershipAt).toBeGreaterThan(-1)
    expect(downloadAt).toBeGreaterThan(-1)
    // Reversed, this reads somebody else's transcript aloud to anyone holding
    // a uuid: the service role can open any object in the bucket.
    expect(ownershipAt).toBeLessThan(downloadAt)
  })

  it('every service-role write names an owner, not just a row id', () => {
    // The service role does not consult RLS, so a write keyed only on an id
    // the caller supplied is a cross-tenant write waiting for a reordering.
    // calenda-decode's `fail` helper was exactly that: reachable from the
    // missing-key branch, which sat above the ownership check, so anyone
    // holding a uuid could stamp "failed" onto a stranger's report card.
    //
    // Checking the shape rather than the ordering is deliberate. Ordering is
    // what keeps being got wrong; a write that carries its own owner is safe
    // wherever somebody later moves it.
    let inspected = 0
    for (const name of ['calenda-decode', 'calenda-chat']) {
      const src = readFileSync(join(ROOT, name, 'index.ts'), 'utf8')

      // Each `admin` chain, up to the semicolon that ends it.
      const chains = src.split(/\badmin\b/).slice(1)
      for (const rest of chains) {
        const chain = rest.split(/\n\n|(?<=\))\n(?=\s*(?:const|let|if|return|await|\/))/)[0] ?? ''
        const writes = /\.(update|delete|insert)\(/.test(chain)
        if (!writes) continue
        inspected++
        // An insert names the owner in the row it writes; an update or a
        // delete has to name it in the filter.
        expect(chain, `${name}: a service-role write with no owner in it:\n${chain}`)
          .toMatch(/owner_id/)
      }
    }

    // Seven of them today. A chunker that quietly stops matching turns the
    // loop above into a no-op that reports success -- which is how a guard
    // ends up passing for a year while guarding nothing.
    expect(inspected).toBeGreaterThanOrEqual(7)
  })

  it('the dispatcher only counts a delivery when something was delivered', () => {
    // `sent` is the number the reminders workflow reads and the number a
    // person trusts when they ask whether this works. On 2026-09-10 it said 1
    // three times over while nothing reached anybody: sendPush returned void,
    // so the caller counted a success whether the loop had zero subscriptions,
    // deleted an expired one, or actually delivered.
    const src = readFileSync(join(ROOT, 'notify-dispatch', 'index.ts'), 'utf8')

    // It has to report a count back...
    expect(src).toMatch(/Promise<\{\s*delivered: number/)
    // ...and the caller has to branch on it rather than assume.
    expect(src).toMatch(/push\.delivered === 0/)

    // A per-subscription failure must not abandon the ones after it. A stale
    // row on an old laptop silenced the phone in your hand.
    const fn = src.slice(src.indexOf('async function sendPush'), src.indexOf('Deno.serve'))
    expect(fn).not.toMatch(/throw err/)
  })

  it('the service worker notifies even when the payload is unreadable', () => {
    // A silent exit there makes three different faults -- no push, an empty
    // push, an undecryptable push -- indistinguishable from everything
    // working.
    //
    // Comments are stripped before searching, because the handler's own
    // doc comment quotes the line it replaced in order to explain why. The
    // first version of this assertion failed on exactly that, which is the
    // trap CLAUDE.md records two paragraphs above where this was written:
    // anchor on the code, never on a name that also appears in the prose.
    const sw = readFileSync(join(process.cwd(), 'public', 'sw.js'), 'utf8')
      .replace(/\/\*[\s\S]*?\*\//g, '')
      .replace(/^\s*\/\/.*$/gm, '')

    expect(sw).not.toMatch(/if \(!event\.data\)\s*return/)
    expect(sw).toMatch(/showNotification/)
    // And it takes over promptly, or a fixed worker waits for every tab on the
    // origin to close before it replaces the broken one.
    expect(sw).toMatch(/skipWaiting/)
  })

  it('the dispatcher can never answer 500 with nothing to say', () => {
    // On 2026-09-11 at 06:04 UTC the hourly workflow got
    //
    //   curl: (22) The requested URL returned error: 500
    //
    // and that was the whole record. The per-reminder loop catches its own
    // errors, so a 500 can only come from the three calls outside it -- and an
    // unhandled throw among them produces a response with no body at all, so
    // there was nothing to read even once `--fail` stopped deleting it.
    //
    // Comments are stripped first. The ones written to explain all of this
    // name `schedule_reminders`, `500` and `try` in prose, so a search over the
    // raw file would match the explanation rather than the code -- the trap
    // CLAUDE.md records, hit twice already by guards in this same file.
    const src = readFileSync(join(ROOT, 'notify-dispatch', 'index.ts'), 'utf8')
      .replace(/\/\*[\s\S]*?\*\//g, '')
      .replace(/^\s*\/\/.*$/gm, '')

    // The handler body is wrapped, so a throw becomes a named answer.
    //
    // Scoped to the Deno.serve callback alone. Slicing from `Deno.serve` to the
    // end of the file was tried first and passed with the wrap deleted, because
    // the per-reminder loop further down has a try/catch of its own -- the
    // assertion was matching a different try/catch entirely. Proven by removing
    // the wrap and watching it still pass.
    const serveBody = src.slice(src.indexOf('Deno.serve'), src.indexOf('async function dispatch'))
    expect(serveBody).toMatch(/try\s*\{/)
    expect(serveBody).toMatch(/catch/)

    // And the top-up's result is read rather than discarded. It was called and
    // thrown away, so a failure there meant the queue was silently not topped
    // up while the run still reported a healthy {"sent":0}.
    const call = src.indexOf("rpc('schedule_reminders')")
    expect(call, 'schedule_reminders is no longer called').toBeGreaterThan(-1)
    expect(src.slice(call, call + 200)).toMatch(/\.error/)

    // Every 500 comes from the one helper, and that helper names where it got
    // to. Searching near each `status: 500` for the word `where` was tried and
    // passed with `where` deleted from the response -- it was matching the
    // helper's own parameter list three lines up.
    const problemFn = src.slice(src.indexOf('function problem'), src.indexOf('Deno.serve'))
    expect(problemFn, 'the one place a 500 is written').toMatch(/status:\s*500/)
    expect(problemFn).toMatch(/JSON\.stringify\(\{[^}]*\bwhere\b[^}]*\}\)/)
    expect(
      [...src.matchAll(/status:\s*500/g)].length,
      'a 500 written somewhere other than problem()',
    ).toBe(1)
  })

  it('no function hardcodes a credential', () => {
    for (const file of files) {
      const src = readFileSync(file, 'utf8')
      // Every secret must come from the environment. A literal key in a repo is
      // a key in every clone of it, forever.
      expect(src).not.toMatch(/(sk|gsk|re)_[A-Za-z0-9]{20,}/)
      expect(src).not.toMatch(/eyJ[A-Za-z0-9_-]{20,}\./)
    }
  })
})
