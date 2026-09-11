/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_SUPABASE_URL?: string
  readonly VITE_SUPABASE_ANON_KEY?: string
  /** Public half of the VAPID pair; safe in the bundle by design. */
  readonly VITE_VAPID_PUBLIC_KEY?: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}

/**
 * The founder panel's figures, counted from the repository by vite.config.ts
 * and substituted at build time -- so there is no committed copy of them to
 * keep in step, and they cannot drift from the thing they describe.
 *
 * The count of tests is not here: only the runner knows how many tests an
 * `it.each` becomes. It lives in src/data/testCount.ts.
 */
declare const __PROJECT_STATS__: {
  /** Tables created across every migration. */
  tables: number
  /** Row-level security policies. */
  policies: number
  /** Migration files. */
  migrations: number
  /** Assertions in the SQL test files, run against a real Postgres. */
  sqlAssertions: number
  /** Lines of TypeScript outside the test directories. */
  appLines: number
  /** Lines of TypeScript in the tests. */
  testLines: number
}
