import { createHash } from 'node:crypto'

/**
 * A Content-Security-Policy in a `<meta>` tag, because GitHub Pages cannot set
 * a header.
 *
 * WHAT THIS CANNOT DO, SAID FIRST
 *
 * `frame-ancestors` -- the directive that stops another site putting Calenda in
 * an iframe and collecting clicks -- is **ignored in a meta tag**. It only
 * works as an HTTP header, and GitHub Pages serves static files with headers
 * nobody can configure. The same is true of `report-uri`. So this policy
 * reduces what a successful injection could do; it does not make the page
 * un-frameable, and nothing here should be read as saying it does. Moving off
 * Pages is the only fix for that, and it is not worth doing for this alone.
 *
 * WHY IT IS GENERATED RATHER THAN TYPED
 *
 * Two of its values cannot be known when the HTML is written. The Supabase
 * origin comes from the build's own environment, and the inline theme script
 * needs its sha256 -- which changes the moment anybody edits that script, and a
 * stale hash is a blank page rather than a warning. Both are read from the
 * artefact being built, so neither can drift.
 */
export function cspPlugin() {
  return {
    name: 'calenda-csp',
    // Build only. The dev server needs eval and a websocket for HMR, and a
    // policy loose enough for those is not the policy that ships.
    apply: 'build',
    transformIndexHtml(html) {
      // Every inline script gets its own hash. There is one today; taking them
      // from the HTML means adding a second cannot silently break the page.
      const hashes = [...html.matchAll(/<script(?![^>]*\bsrc=)[^>]*>([\s\S]*?)<\/script>/g)]
        .map((m) => m[1])
        .filter((code) => code.trim().length > 0)
        .map((code) => `'sha256-${createHash('sha256').update(code).digest('base64')}'`)

      // The app talks to exactly two places it does not serve itself.
      const supabase = originOf(process.env.VITE_SUPABASE_URL)
      const connect = ["'self'", supabase, 'https://www.googleapis.com'].filter(Boolean)

      const policy = [
        // Everything not named below falls here, and 'self' is the answer for
        // all of it: the fonts are bundled, there are no CDNs, and the only
        // third-party request this site has ever made was a font stylesheet
        // that was removed.
        `default-src 'self'`,
        `script-src 'self' ${hashes.join(' ')}`.trim(),
        // React renders `style={{…}}` as a style attribute, which this covers.
        // Removing it would mean rewriting every inline style in the app into
        // classes, including the scroll-linked ones Motion writes per frame.
        `style-src 'self' 'unsafe-inline'`,
        // blob: is the .ics export, which builds the file in the browser.
        `img-src 'self' data: blob:`,
        `font-src 'self'`,
        `connect-src ${connect.join(' ')}`,
        // The service worker, which has handled push since the first commit.
        `worker-src 'self'`,
        `manifest-src 'self'`,
        // Nothing embeds anything, and nothing here is a plugin.
        `object-src 'none'`,
        `frame-src 'none'`,
        // An injected <base> would repoint every relative URL on the page,
        // including the module script, at somebody else's origin.
        `base-uri 'self'`,
        // No form on this site posts anywhere but Supabase over fetch.
        `form-action 'self'`,
      ].join('; ')

      return html.replace(
        '<meta charset="UTF-8" />',
        `<meta charset="UTF-8" />\n    <meta http-equiv="Content-Security-Policy" content="${policy}" />`,
      )
    },
  }
}

/**
 * The origin of a URL, or nothing.
 *
 * Nothing rather than a guess: an unset or malformed VITE_SUPABASE_URL means
 * the app cannot reach Supabase at all, and a CSP naming a wrong origin would
 * turn that into a confusing console error instead of the plain "not
 * configured" screen the app already shows.
 */
function originOf(url) {
  if (!url) return ''
  try {
    return new URL(url).origin
  } catch {
    return ''
  }
}
