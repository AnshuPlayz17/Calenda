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
