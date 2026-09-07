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
 * `logo` is hotlinked, loaded directly by the reader's browser. That is the
 * owner's decision, made with the trade-offs on the table: a crest is the
 * school's trademark and cannot be bundled here, so the choice was between
 * hotlinking and showing no crests at all.
 *
 * These particular URLs are Google's image-search thumbnail cache rather than
 * the schools' own servers, and they are the weakest part of this file. The
 * `tbn:ANd9Gc...` token is a cache key, not an address: Google rotates and
 * expires them, so these will stop resolving, and the day they do every tile
 * falls back to its monogram at once. They are also thumbnails, so they are
 * small. Replacing them with URLs from each school's own site is the fix, and
 * it is a paste per school -- the shape of this file does not change.
 *
 * `crop` exists because several of these images are a lockup: crest beside or
 * above a wordmark. In a square tile the whole lockup shrinks to nothing, so
 * the tile crops to the crest instead. 'left' for a horizontal lockup, 'top'
 * for a stacked one. Left is the guess where the orientation is unknown --
 * this container cannot reach these images either, so none of them has been
 * looked at.
 */
export type School = {
  name: string
  /** Only where the school uses one itself. */
  acronym?: string
  site: string
  /** Absolute image URL. Empty, or one that fails, falls back to the monogram. */
  logo?: string
  /** Show only part of the image, for a crest-plus-wordmark lockup. */
  crop?: 'left' | 'top'
  /** Drawn when there is no logo. Not always the acronym: Crescent has none. */
  monogram: string
}

export const SCHOOLS: School[] = [
  {
    name: 'University of Toronto Schools',
    acronym: 'UTS',
    site: 'https://www.utschools.ca/',
    monogram: 'UTS',
    logo: 'https://encrypted-tbn0.gstatic.com/images?q=tbn:ANd9GcRNq4A2jYFM9IwoRbshAUQsPBLY4UxOSZQ4o9eEVBL8RQ&s=10',
  },
  {
    name: 'Upper Canada College',
    acronym: 'UCC',
    site: 'https://www.ucc.on.ca/',
    monogram: 'UCC',
    logo: 'https://encrypted-tbn0.gstatic.com/images?q=tbn:ANd9GcRsZzE_REr4YIPgz9BQ5qEPeqSdK6Ub4xMzxh6EVoJK0g&s=10',
  },
  {
    name: 'Havergal College',
    acronym: 'HC',
    site: 'https://www.havergal.on.ca/',
    monogram: 'HC',
    logo: 'https://encrypted-tbn0.gstatic.com/images?q=tbn:ANd9GcRYjcAF-NVxf73-WDCrt1mEJ2zEb7c7h7W2Af0IlsJjl-jknAvUu5qC8h-M&s=10',
    crop: 'left',
  },
  {
    name: 'Branksome Hall',
    acronym: 'BH',
    site: 'https://branksome.on.ca/',
    monogram: 'BH',
    logo: 'https://encrypted-tbn0.gstatic.com/images?q=tbn:ANd9GcSpxsjde24Ul8YA9dKzXLyPU90IIPwqVRGC_zvrSO79LQ&s=10',
  },
  {
    name: 'The Bishop Strachan School',
    acronym: 'BSS',
    site: 'https://www.bss.on.ca/',
    monogram: 'BSS',
    logo: 'https://encrypted-tbn0.gstatic.com/images?q=tbn:ANd9GcTRnQimSMYCcXnwXXrlpja9j_fy86_yTOjupysCjPEjMA&s=10',
  },
  {
    name: 'Crescent',
    site: 'https://www.crescentschool.org/',
    monogram: 'C',
    logo: 'https://encrypted-tbn0.gstatic.com/images?q=tbn:ANd9GcQYRiofzULlSb9HJvi3NOJTIr9oHg86c7u7fnjH8gnK4w&s=10',
  },
  {
    name: 'Greenwood College School',
    site: 'https://www.greenwoodcollege.org/',
    monogram: 'G',
    logo: 'https://encrypted-tbn0.gstatic.com/images?q=tbn:ANd9GcQOaw91jp7MiYSmbF2c2sct0biMuyd1wydLQeAwID9ucQ&s=10',
  },
  {
    name: 'The York School',
    acronym: 'TYS',
    site: 'https://www.yorkschool.com/',
    monogram: 'TYS',
    logo: 'https://encrypted-tbn0.gstatic.com/images?q=tbn:ANd9GcR25in1oWsHi4b4C70jfDagjX0s-FJb_mA_tyINBCeGlA&s=10',
  },
  {
    name: 'Toronto French School',
    acronym: 'TFS',
    site: 'https://www.tfs.ca/',
    monogram: 'TFS',
    logo: 'https://encrypted-tbn0.gstatic.com/images?q=tbn:ANd9GcQMzKu11yNPKKw2NMjo3P_P070BJ-zsCsFiDAM5m_w0Ag&s=10',
  },
  {
    name: 'Royal St. George’s College',
    site: 'https://www.rsgc.on.ca/',
    monogram: 'RSGC',
    logo: 'https://encrypted-tbn0.gstatic.com/images?q=tbn:ANd9GcSPSHdXVFzXVlvaU-Y0TOj6Pih1LeNs2BobdfzXr4Usnw&s=10',
    crop: 'left',
  },
  {
    name: 'Appleby College',
    site: 'https://www.appleby.on.ca/',
    monogram: 'AC',
    logo: 'https://encrypted-tbn0.gstatic.com/images?q=tbn:ANd9GcTFBm6oE3aTjymTxqkjSMHJm3zSqIa4q3Nw40H_HoN2Yw&s=10',
  },
  {
    name: 'Bayview Glen',
    site: 'https://www.bayviewglen.ca/',
    monogram: 'BG',
    logo: 'https://encrypted-tbn0.gstatic.com/images?q=tbn:ANd9GcRStq62PsZrQZuhdNHFU6TVtqhmcZlJsPnpJZQBjZXZdg&s=10',
    crop: 'left',
  },
  {
    name: 'St. Michael’s College School',
    acronym: 'SMCS',
    site: 'https://stmichaelscollegeschool.com/',
    monogram: 'SMCS',
    logo: 'https://encrypted-tbn0.gstatic.com/images?q=tbn:ANd9GcTI6wXvrps9oEIe12hBb7h7I6sb1minyE96s5jXuTsBsg&s=10',
  },
  {
    name: 'St. Andrew’s College',
    acronym: 'SAC',
    site: 'https://www.sac.on.ca/',
    monogram: 'SAC',
    logo: 'https://encrypted-tbn0.gstatic.com/images?q=tbn:ANd9GcQgahUtqSEauZkJws1kmuoDax_x6jrfgq7Vz7GPFc41vQ&s=10',
  },
  {
    name: 'St. Clement’s School',
    site: 'https://www.scs.on.ca/',
    monogram: 'SCS',
    logo: 'https://encrypted-tbn0.gstatic.com/images?q=tbn:ANd9GcRNcHie7wu224VTGc7gOiClFiKE-6gthGZ2BSozocobjA&s=10',
    crop: 'left',
  },
]
