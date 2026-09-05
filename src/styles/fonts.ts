/**
 * The typefaces, bundled rather than fetched from Google.
 *
 * They used to come from fonts.googleapis.com via a stylesheet in the document
 * head. Three problems with that, in the order they matter:
 *
 *   - It is a render-blocking request to a third party before any text can be
 *     painted, on a connection the browser has to open first. Two preconnect
 *     hints existed only to make that less slow.
 *   - Every visitor's IP reaches Google before they have chosen to do anything.
 *     A tool for students at one school should not hand a third party that log.
 *   - On any network that blocks Google Fonts the page silently fell back to
 *     Georgia and system-ui, which is a different design from the one intended.
 *
 * These are the same faces, from the same open-source projects, served from our
 * own origin. Variable files, so every weight in the ramp is one download:
 * Inter is 48 KB and Newsreader 58 KB for the whole latin range. Each @font-face
 * carries a unicode-range, so the cyrillic, greek and vietnamese subsets sit in
 * the build unused and are never fetched by a reader who does not need them.
 */
import '@fontsource-variable/inter/wght.css'
import '@fontsource-variable/newsreader/wght.css'
import '@fontsource-variable/newsreader/wght-italic.css'
import '@fontsource/ibm-plex-mono/400.css'
import '@fontsource/ibm-plex-mono/500.css'
