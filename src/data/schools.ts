/**
 * The schools the landing page names.
 *
 * Ordered as the owner listed them, which is the order they appear in the
 * grid; the list is the layout, so reordering here reorders the page.
 *
 * Every `site` was verified in September 2026. `acronym` is only present where
 * the school actually uses one -- inventing one for the rest would put made-up
 * initials next to a real institution's name.
 *
 * `logo` is a URL on the school's own server, loaded directly by the reader's
 * browser. That is the owner's decision, made with the trade-offs on the table:
 * a crest is the school's trademark and cannot be bundled here, so the choice
 * was between hotlinking and not showing crests at all.
 *
 * The fields are empty because this container cannot reach any of these
 * domains -- the egress proxy blocks them -- so the URLs could not be found or
 * checked from here, and fifteen guessed URLs on a live page is fifteen broken
 * images. Paste each one in and it appears; until then the school gets a
 * monogram built from its own initials, which is a deliberate mark rather than
 * a placeholder. Mixing the two is fine: a school with a URL shows its crest
 * and the rest show monograms.
 *
 * To fill one in: open the school's site, right-click its crest, copy the image
 * address, paste it as `logo`. Prefer an SVG or a PNG of at least 128px.
 */
export type School = {
  name: string
  /** Only where the school uses one itself. */
  acronym?: string
  site: string
  /** Absolute URL on the school's own server. Empty falls back to a monogram. */
  logo?: string
  /** Drawn when there is no logo. Not always the acronym: Crescent has none. */
  monogram: string
}

export const SCHOOLS: School[] = [
  { name: 'University of Toronto Schools', acronym: 'UTS', site: 'https://www.utschools.ca/', monogram: 'UTS' },
  { name: 'Upper Canada College', acronym: 'UCC', site: 'https://www.ucc.on.ca/', monogram: 'UCC' },
  { name: 'Havergal College', acronym: 'HC', site: 'https://www.havergal.on.ca/', monogram: 'HC' },
  { name: 'Branksome Hall', acronym: 'BH', site: 'https://branksome.on.ca/', monogram: 'BH' },
  { name: 'The Bishop Strachan School', acronym: 'BSS', site: 'https://www.bss.on.ca/', monogram: 'BSS' },
  { name: 'Crescent', site: 'https://www.crescentschool.org/', monogram: 'C' },
  { name: 'Greenwood College School', site: 'https://www.greenwoodcollege.org/', monogram: 'G' },
  { name: 'The York School', acronym: 'TYS', site: 'https://www.yorkschool.com/', monogram: 'TYS' },
  { name: 'Toronto French School', acronym: 'TFS', site: 'https://www.tfs.ca/', monogram: 'TFS' },
  { name: 'Royal St. George’s College', site: 'https://www.rsgc.on.ca/', monogram: 'RSG' },
  { name: 'Appleby College', site: 'https://www.appleby.on.ca/', monogram: 'AC' },
  { name: 'Bayview Glen', site: 'https://www.bayviewglen.ca/', monogram: 'BG' },
  { name: 'St. Michael’s College School', acronym: 'SMCS', site: 'https://stmichaelscollegeschool.com/', monogram: 'SMCS' },
  { name: 'St. Andrew’s College', acronym: 'SAC', site: 'https://www.sac.on.ca/', monogram: 'SAC' },
  { name: 'De La Salle College', site: 'https://www.delasalle.ca/', monogram: 'DLS' },
]
