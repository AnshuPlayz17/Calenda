/**
 * Pulling a recovery token out of the address bar, wherever it landed.
 *
 * Calenda is hash-routed, because GitHub Pages has no server to rewrite deep
 * links. That makes the address bar an awkward place to receive credentials
 * from, and it is the reason this file exists rather than the code just
 * trusting supabase-js to notice.
 *
 * A recovery link can deliver its token in three shapes, and which one you get
 * depends on the flow type, the Supabase version, and whether the configured
 * redirect URL already contained a `#`:
 *
 *   .../Calenda/?code=abc#/reset-password        PKCE, redirect had no fragment
 *   .../Calenda/#/reset-password?code=abc        PKCE, appended inside the hash
 *   .../Calenda/#/reset-password#access_token=…  implicit, two fragments
 *
 * supabase-js reads `window.location.search` and the first fragment. In the
 * second and third shapes the token is inside the *route's* portion of the
 * hash, where it never looks -- so `detectSessionInUrl` quietly finds nothing
 * and the page reports a link that is actually fine as expired.
 *
 * This was going to be settled by testing it against the live site instead.
 * That turned out to be unanswerable: the route did not exist in the deployed
 * build, so the link fell through to the catch-all, and RequireAuth's
 * `<Navigate replace>` to /sign-in discarded the whole query string and hash
 * before anything could be read off it. The evidence destroyed itself. Reading
 * every position is cheaper than another round of guessing, and it stays
 * correct if Supabase changes which one it uses.
 */

export type RecoveryCredentials =
  | { kind: 'code'; code: string }
  | { kind: 'tokens'; accessToken: string; refreshToken: string }
  | { kind: 'error'; message: string }

/**
 * Every place in the URL that could hold parameters, outermost first.
 *
 * `?a=1#/route?b=2#c=3` yields the top-level query, then each fragment, then
 * the query portion of each fragment. Order matters only in that the first
 * chunk carrying a credential wins, and a link never carries two.
 */
function parameterChunks(href: string): string[] {
  const chunks: string[] = []

  const topQuery = href.split('#')[0]!.split('?').slice(1).join('?')
  if (topQuery) chunks.push(topQuery)

  for (const fragment of href.split('#').slice(1)) {
    chunks.push(fragment)
    const nested = fragment.split('?').slice(1).join('?')
    if (nested) chunks.push(nested)
  }

  return chunks
}

/**
 * What the URL is carrying, if anything.
 *
 * Three passes over the chunks rather than one, and that is not tidiness. A
 * chunk that still has the route on the front of it -- `/reset-password?code=x`
 * -- parses with `/reset-password?code` as the key, so the parameter is missed
 * there and found in the next chunk down. Checking one chunk completely before
 * moving to the next therefore lets a credential in a later chunk be returned
 * ahead of an error in an earlier one, and a refused link would present as a
 * usable one. Every chunk is asked about errors before any is asked about
 * credentials.
 */
export function readRecoveryCredentials(href: string): RecoveryCredentials | null {
  const all = parameterChunks(href).map((chunk) => new URLSearchParams(chunk))

  // Supabase reports a refusal in the URL rather than by failing the redirect,
  // so an expired link arrives looking much like a valid one.
  for (const params of all) {
    const error = params.get('error_description') ?? params.get('error')
    if (error) return { kind: 'error', message: error }
  }

  for (const params of all) {
    const code = params.get('code')
    if (code) return { kind: 'code', code }
  }

  // Both, from the same chunk: an access token without a refresh token cannot
  // make a session, and pairing them across chunks would be inventing one.
  for (const params of all) {
    const accessToken = params.get('access_token')
    const refreshToken = params.get('refresh_token')
    if (accessToken && refreshToken) return { kind: 'tokens', accessToken, refreshToken }
  }

  return null
}

/**
 * The same address with every credential stripped out.
 *
 * A recovery token sitting in the address bar survives into browser history,
 * into a screenshot, and into whatever the reader pastes when they ask someone
 * why the page looks odd. It is one-use and short-lived, but so is a password
 * being typed on the next line, and neither belongs in the scrollback.
 */
export function withoutCredentials(href: string, route: string): string {
  const [base] = href.split('#')
  const clean = base!.split('?')[0]!
  return `${clean}#${route}`
}
