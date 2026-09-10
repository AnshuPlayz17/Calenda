/**
 * What the founder panel claims about this project, in one place.
 *
 * Two sources, because they answer to two different things. Everything
 * countable from the files is substituted at build time by vite.config.ts, so
 * it is exact on every build and there is nothing to regenerate. The count of
 * tests comes from the runner -- a regex over the source gives 314 where vitest
 * gives 318, because one `it.each` over five files is one match and five tests
 * -- so it is committed, and `npm test` fails if it has gone stale.
 */
import { testCount } from './testCount'

export const projectStats = {
  ...__PROJECT_STATS__,
  tests: testCount,
}
