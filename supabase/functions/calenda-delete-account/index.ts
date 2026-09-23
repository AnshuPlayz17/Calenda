/**
 * Delete an account, and everything attached to it.
 *
 * Deploy:  supabase functions deploy calenda-delete-account  (or merge --
 *          functions.yml does it)
 * Secrets: none of its own. SUPABASE_URL, SUPABASE_ANON_KEY and
 *          SUPABASE_SERVICE_ROLE_KEY are injected by the platform.
 *
 * THE ID COMES FROM THE TOKEN AND NEVER FROM THE REQUEST
 *
 * This is the whole security design and it is one line: the uid deleted is the
 * one `auth.getUser()` returns for the presented Bearer token. There is no id
 * in the body, no id in the query string, and no branch anywhere that would
 * accept one. A function that takes an id and deletes it is a function that
 * deletes any account the moment somebody moves an ownership check -- and this
 * project has already found three service-role writes keyed on a caller-
 * supplied id (see the note in CLAUDE.md about `.eq('id', id)`).
 *
 * So the service role appears exactly twice below, both times against a uid
 * that was read out of a verified JWT a few lines above, and the request body
 * is not parsed at all.
 *
 * WHY THE SERVICE ROLE IS NEEDED AT ALL
 *
 * Deleting a row from `auth.users` is an admin operation -- there is no RLS
 * policy a client could satisfy, by design, because `auth.users` is not a
 * table the app is allowed to write. `calenda-chat` is JWT-scoped for every
 * read precisely so it cannot reach another account; this one cannot be, so
 * it is instead narrowed until the only account it can name is the caller's.
 *
 * STORAGE IS NOT A FOREIGN KEY
 *
 * `profiles.id references auth.users on delete cascade` takes every row in
 * every table with it. It does not take the files: `storage.objects` has no
 * key into `profiles`, so deleting the user leaves their uploads sitting in
 * the private `attachments` bucket forever -- report cards included, which are
 * the most sensitive thing this app holds.
 *
 * Every path in that bucket is `<uid>/...` (20260909000400 refuses anything
 * else), so the caller's uploads are exactly one folder and it can be emptied
 * without consulting any table.
 *
 * THE ORDER IS FILES FIRST, THEN THE ACCOUNT, AND IT MATTERS
 *
 * The other order can strand files permanently. Once the auth user is gone the
 * uid is the only thing that names their folder, and nothing is left that
 * knows it -- a failure between the two steps would leave report cards in the
 * bucket with no record anywhere that they belong to a deleted account.
 *
 * This way a failure between the steps leaves the account intact with some
 * uploads missing, which is recoverable and is reported rather than swallowed:
 * the response says the account was NOT deleted, and pressing the button again
 * is safe because removing a file that is already gone is not an error.
 */
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { corsFor } from '../_shared/cors.ts'

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!
const SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
const ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY')!

const BUCKET = 'attachments'

function json(body: unknown, cors: Record<string, string>, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...cors, 'Content-Type': 'application/json' },
  })
}

/**
 * Every 500 says where it got to.
 *
 * `notify-dispatch` answered a bare 500 once and the one sentence explaining
 * it was discarded by the caller's `curl --fail`; the fix there was that every
 * failure names its own point. The same helper is here for the same reason,
 * and it matters more: a person pressing "Delete my account" and seeing
 * "something went wrong" has no idea whether their data is gone.
 */
function problem(where: string, detail: unknown, cors: Record<string, string>) {
  const detailText = detail instanceof Error
    ? detail.message
    : typeof detail === 'object' && detail !== null && 'message' in detail
      ? String((detail as { message: unknown }).message)
      : String(detail)

  // `message` is the key, not `error`. supabase-js reports every non-2xx as
  // one generic FunctionsHttpError and the client's `functionMessage()` reads
  // `body.message` out of the response to recover what was actually said --
  // so a failure written under any other key arrives as "please try again",
  // which is the one thing a person deleting their account must not be told.
  return json({
    error: where,
    message: `Your account was not deleted. It failed while ${where}: ${detailText}`,
    deleted: false,
  }, cors, 500)
}

/**
 * Every object under one prefix, followed into subfolders.
 *
 * `list()` returns one directory level and pages at 100 by default, so a
 * single call is a partial answer that looks like a complete one -- exactly
 * the shape of bug this project keeps finding. It walks and pages instead, and
 * the caller checks the walk finished before anything is deleted.
 */
async function pathsUnder(
  storage: ReturnType<typeof createClient>['storage'],
  prefix: string,
): Promise<string[]> {
  const found: string[] = []
  const queue = [prefix]

  while (queue.length > 0) {
    const dir = queue.shift()!
    let offset = 0
    for (;;) {
      const { data, error } = await storage
        .from(BUCKET)
        .list(dir, { limit: 100, offset })
      if (error) throw error
      if (!data || data.length === 0) break
      for (const entry of data) {
        // A folder comes back with no id. A file has one.
        if (entry.id === null) queue.push(`${dir}/${entry.name}`)
        else found.push(`${dir}/${entry.name}`)
      }
      if (data.length < 100) break
      offset += data.length
    }
  }

  return found
}

Deno.serve(async (req) => {
  const CORS = corsFor(req)
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS })

  const auth = req.headers.get('Authorization') ?? ''
  if (!auth.startsWith('Bearer ')) return json({ error: 'not signed in' }, CORS, 401)

  // The only client that reads anything. `persistSession: false` because a
  // server has no session to persist and leaving it on shares state between
  // concurrent requests.
  const asUser = createClient(SUPABASE_URL, ANON_KEY, {
    global: { headers: { Authorization: auth } },
    auth: { persistSession: false, autoRefreshToken: false },
  })

  const { data: userData, error: userError } = await asUser.auth.getUser()
  const user = userData?.user
  if (userError || !user) return json({ error: 'not signed in' }, CORS, 401)

  // From here down, `uid` is the only account this function can name. It was
  // read out of the verified token above and nothing else can set it.
  const uid = user.id

  const admin = createClient(SUPABASE_URL, SERVICE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  })

  // ---- 1. the uploads, which no foreign key would have taken -------------

  let files: string[]
  try {
    files = await pathsUnder(admin.storage, uid)
  } catch (e) {
    return problem('listing your files', e, CORS)
  }

  if (files.length > 0) {
    // `remove` takes at most a thousand at a time, and a person with more than
    // that is not a case to discover in production.
    for (let i = 0; i < files.length; i += 500) {
      const { error } = await admin.storage.from(BUCKET).remove(files.slice(i, i + 500))
      if (error) return problem('deleting your files', error, CORS)
    }

    // Asked rather than assumed. `remove` reports per-object results and this
    // project's recurring bug is a success signal that is not downstream of
    // the success -- so the check is a fresh listing, not the call's own
    // return value.
    let left: string[]
    try {
      left = await pathsUnder(admin.storage, uid)
    } catch (e) {
      return problem('checking your files were deleted', e, CORS)
    }
    if (left.length > 0) {
      return problem(
        'deleting your files',
        `${left.length} of ${files.length} could not be removed`,
        CORS,
      )
    }
  }

  // ---- 2. the account, which takes every row with it ---------------------

  const { error: deleteError } = await admin.auth.admin.deleteUser(uid)
  if (deleteError) return problem('deleting your account', deleteError, CORS)

  return json({ deleted: true, files: files.length }, CORS)
})
