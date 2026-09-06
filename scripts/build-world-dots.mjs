/**
 * Generates the dotted world map used by the landing page's reach scene.
 *
 *   npm i -D world-atlas topojson-client && node scripts/build-world-dots.mjs
 *
 * Writes src/data/worldMap.ts: a land/sea bitmask over an equirectangular
 * grid, one character per cell, one line per row of latitude.
 *
 * A bitmask rather than a list of coordinates, for two reasons. It is a third
 * of the size once the coordinates are implied by position, and -- the reason
 * that actually decided it -- you can read the world in the diff. A generated
 * file nobody can eyeball is a generated file nobody notices is wrong.
 *
 * Source is Natural Earth 1:110m land, via the world-atlas package, which is
 * public domain. It is a build-time dependency: nothing here ships.
 */
import { readFileSync, writeFileSync } from 'node:fs'
import { feature } from 'topojson-client'

const COLS = 96
const ROWS = 44
/** Antarctica is a fifth of the land and tells you nothing about reach. */
const LAT_MAX = 78
const LAT_MIN = -56

const topo = JSON.parse(
  readFileSync(new URL('../node_modules/world-atlas/land-110m.json', import.meta.url)),
)
const land = feature(topo, topo.objects.land)

/** Ray casting, on the ring's own coordinates. */
function inRing(ring, x, y) {
  let inside = false
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i]
    const [xj, yj] = ring[j]
    if ((yi > y) !== (yj > y) && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside
  }
  return inside
}

/** A point is on land if it is inside an outer ring and no hole of that polygon. */
function inPolygon(rings, x, y) {
  if (!inRing(rings[0], x, y)) return false
  for (let i = 1; i < rings.length; i += 1) if (inRing(rings[i], x, y)) return false
  return true
}

const polygons = []
for (const f of land.features) {
  const g = f.geometry
  if (g.type === 'Polygon') polygons.push(g.coordinates)
  else if (g.type === 'MultiPolygon') polygons.push(...g.coordinates)
}

const rows = []
for (let r = 0; r < ROWS; r += 1) {
  // Sample at cell centres, so a coastline never lands exactly on a boundary.
  const lat = LAT_MAX - ((r + 0.5) / ROWS) * (LAT_MAX - LAT_MIN)
  let row = ''
  for (let c = 0; c < COLS; c += 1) {
    const lon = -180 + ((c + 0.5) / COLS) * 360
    row += polygons.some((p) => inPolygon(p, lon, lat)) ? '#' : '.'
  }
  rows.push(row)
}

const dots = rows.join('').split('').filter((ch) => ch === '#').length

const out = `/**
 * The world, as a grid of land and sea. Generated -- do not edit by hand.
 *
 * Rebuild with:
 *   npm i -D world-atlas topojson-client && node scripts/build-world-dots.mjs
 *
 * Source is Natural Earth 1:110m land (public domain) via the world-atlas
 * package, sampled at the centre of each cell of an equirectangular grid.
 * Antarctica is cut off below ${LAT_MIN}°: it is a fifth of the world's land and
 * says nothing about who can use a school calendar.
 *
 * ${COLS} columns of longitude by ${ROWS} rows of latitude, '#' for land,
 * '.' for sea, top row northernmost. ${dots} dots in total.
 *
 * It is a bitmask rather than a list of coordinates because you can read the
 * world in the diff, and a generated file nobody can eyeball is a generated
 * file nobody notices is wrong.
 */
export const WORLD_COLS = ${COLS}
export const WORLD_ROWS = ${ROWS}
export const WORLD_LAT_MAX = ${LAT_MAX}
export const WORLD_LAT_MIN = ${LAT_MIN}

export const WORLD_GRID = [
${rows.map((r) => `  '${r}',`).join('\n')}
].join('')

/** Every land cell, as [column, row] pairs -- computed once at module load. */
export const WORLD_DOTS: Array<[number, number]> = (() => {
  const out: Array<[number, number]> = []
  for (let i = 0; i < WORLD_GRID.length; i += 1) {
    if (WORLD_GRID[i] === '#') out.push([i % WORLD_COLS, Math.floor(i / WORLD_COLS)])
  }
  return out
})()
`

writeFileSync(new URL('../src/data/worldMap.ts', import.meta.url), out)
console.log(`wrote src/data/worldMap.ts — ${dots} land cells of ${COLS * ROWS}`)
