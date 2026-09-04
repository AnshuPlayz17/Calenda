/**
 * Environment access, validated once at startup.
 *
 * Only these two values may ever reach the bundle. The Supabase anon key is
 * designed to be public -- it identifies the project, and grants nothing on
 * its own because every table is behind row-level security. Service keys,
 * OAuth client secrets and provider API keys live in Edge Functions.
 */
const url = import.meta.env.VITE_SUPABASE_URL as string | undefined
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined

export const env = {
  supabaseUrl: url ?? '',
  supabaseAnonKey: anonKey ?? '',
  /** Base path, so OAuth redirects resolve under the GitHub Pages sub-path. */
  baseUrl: new URL(import.meta.env.BASE_URL, window.location.origin).href,
}

/**
 * True when Supabase is configured. The app renders a setup notice rather
 * than crashing when it isn't, so a fresh clone still boots.
 */
export const isConfigured = Boolean(url && anonKey)
