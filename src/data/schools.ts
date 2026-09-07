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
 * There are no crests. There was a `logo` field holding a hotlinked image for
 * each school, and dropping it settles four problems at once: a crest is that
 * school's trademark, the URLs were Google's thumbnail cache and would have
 * expired, they were the only third-party requests on a site that bundles even
 * its fonts, and fifteen crests drawn by fifteen different studios at fifteen
 * aspect ratios never look like one row. Initials set in the page's own
 * typeface do, and they are ours to draw.
 *
 * `monogram` is not always the acronym. Crescent has no acronym and takes a
 * single letter; Royal St. George's has no acronym in use but four initials
 * that read as one.
 */
export type School = {
  name: string
  /** Only where the school uses one itself. */
  acronym?: string
  site: string
  /** The initials drawn on the tile. One to four letters. */
  monogram: string
}

export const SCHOOLS: School[] = [
  {
    name: 'University of Toronto Schools',
    acronym: 'UTS',
    site: 'https://www.utschools.ca/',
    monogram: 'UTS',
  },
  {
    name: 'Upper Canada College',
    acronym: 'UCC',
    site: 'https://www.ucc.on.ca/',
    monogram: 'UCC',
  },
  {
    name: 'Havergal College',
    acronym: 'HC',
    site: 'https://www.havergal.on.ca/',
    monogram: 'HC',
  },
  {
    name: 'Branksome Hall',
    acronym: 'BH',
    site: 'https://branksome.on.ca/',
    monogram: 'BH',
  },
  {
    name: 'The Bishop Strachan School',
    acronym: 'BSS',
    site: 'https://www.bss.on.ca/',
    monogram: 'BSS',
  },
  {
    name: 'Crescent',
    site: 'https://www.crescentschool.org/',
    monogram: 'C',
  },
  {
    name: 'Greenwood College School',
    site: 'https://www.greenwoodcollege.org/',
    monogram: 'G',
  },
  {
    name: 'The York School',
    acronym: 'TYS',
    site: 'https://www.yorkschool.com/',
    monogram: 'TYS',
  },
  {
    name: 'Toronto French School',
    acronym: 'TFS',
    site: 'https://www.tfs.ca/',
    monogram: 'TFS',
  },
  {
    name: 'Royal St. George’s College',
    site: 'https://www.rsgc.on.ca/',
    monogram: 'RSGC',
  },
  {
    name: 'Appleby College',
    site: 'https://www.appleby.on.ca/',
    monogram: 'AC',
  },
  {
    name: 'Bayview Glen',
    site: 'https://www.bayviewglen.ca/',
    monogram: 'BG',
  },
  {
    name: 'St. Michael’s College School',
    acronym: 'SMCS',
    site: 'https://stmichaelscollegeschool.com/',
    monogram: 'SMCS',
  },
  {
    name: 'St. Andrew’s College',
    acronym: 'SAC',
    site: 'https://www.sac.on.ca/',
    monogram: 'SAC',
  },
  {
    name: 'St. Clement’s School',
    site: 'https://www.scs.on.ca/',
    monogram: 'SCS',
  },
]
