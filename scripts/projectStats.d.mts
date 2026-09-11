// Types for the counter, so a test can import it and tsc can still check the
// shape it gets back. The implementation stays plain JavaScript because it runs
// from npm scripts, before anything has been compiled.

export type ComputedStats = {
  tables: number
  policies: number
  migrations: number
  sqlAssertions: number
  appLines: number
  testLines: number
}

export declare const REPORT: string
export declare function testFiles(root?: string): string[]
export declare function readTestCount(root?: string): number | null
export declare function computeStats(root?: string): ComputedStats
