/**
 * Which origins may call these functions from a browser.
 *
 * WHAT THIS IS AND IS NOT
 *
 * It is not authentication and must never be described as such. `calenda-chat`
 * and `calenda-decode` both require a Bearer token and read everything through
 * a client carrying it, so RLS is the control. A browser on another origin
 * cannot read this app's token anyway -- it is in `localStorage` on the
 * Calenda origin, and the same-origin policy is what stops that, not this.
 *
 * So the honest value here is narrow: it stops another site's page from
 * spending this project's free-tier function quota through a visitor's
 * browser, and it removes a wildcard that reads, to anybody auditing, as
 * though nobody had thought about it. Both are worth having. Neither is a
 * permission boundary.
 *
 * ALLOWED_ORIGIN is a comma-separated Supabase secret. It is not required: the
 * default is the deployed site, so forgetting to set it fails closed to the one
 * origin that has to work rather than open to every origin.
 */
const DEFAULT_ORIGINS = [
  'https://anshuplayz17.github.io',
  // Vite's dev server, so the functions can be called while developing without
  // anybody having to remember a secret exists.
  'http://localhost:5173',
  'http://127.0.0.1:5173',
]

const ALLOWED = (Deno.env.get('ALLOWED_ORIGIN') ?? '')
  .split(',')
  .map((o) => o.trim())
  .filter(Boolean)

const ORIGINS = ALLOWED.length > 0 ? ALLOWED : DEFAULT_ORIGINS

/**
 * Headers for one request, decided by its own Origin.
 *
 * An origin that is not on the list is answered with the first allowed origin
 * instead of its own, which the browser compares and refuses. Sending no
 * header at all would do the same thing; sending the wrong one makes the
 * refusal legible in a network tab rather than looking like a server that
 * forgot.
 *
 * `Vary: Origin` because the answer differs per origin. Without it a shared
 * cache can hand one origin's headers to another, which turns a correct
 * allowlist into an incorrect one.
 */
export function corsFor(req: Request): Record<string, string> {
  const origin = req.headers.get('Origin') ?? ''
  const allowed = ORIGINS.includes(origin) ? origin : (ORIGINS[0] ?? '')
  return {
    'Access-Control-Allow-Origin': allowed,
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Vary': 'Origin',
  }
}
