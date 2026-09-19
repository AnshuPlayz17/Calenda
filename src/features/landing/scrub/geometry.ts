/**
 * The book and the laptop are one hinge with two leaves.
 *
 * A book opens around a vertical spine; a laptop opens around a horizontal
 * hinge. That difference is the whole idea -- the transformation is the hinge
 * turning a quarter turn and one leaf standing up. The leaf you lift to open
 * the book is the leaf that becomes the screen, which is the only reason the
 * sequence reads as one object rather than two.
 *
 * FIRST ATTEMPT, AND WHY THIS IS NOT IT. The obvious implementation is to
 * write the book's eight corners and the laptop's eight corners and
 * interpolate. It renders a bowtie. The book's page has its free edge to the
 * right and the laptop's screen has its free edge at the top, so corner 1
 * travels across corner 0's position, the quad turns inside out on the way,
 * and the frames in the middle are a crumpled sheet with a spike through it.
 * It was obvious on the first screenshot at p=0.82 and invisible in the code.
 *
 * So nothing is interpolated between two shapes. There is one shape, and four
 * numbers move it: how far the hinge has turned, how far the lid has lifted,
 * how far the base has dropped, and how the rectangle is proportioned. Every
 * frame is a rigid pose of the same object, so there is no frame that is not a
 * real object.
 *
 * Both leaves put their hinge edge between `c3` and `c0`, so `u` always runs
 * hinge -> free edge and `v` always runs along the hinge, in both objects.
 */

export type P3 = readonly [number, number, number]
/** c0, c1, c2, c3 -- hinge edge is c3 -> c0, `u` runs c0 -> c1. */
export type Quad = readonly [P3, P3, P3, P3]

/** An open book: two portrait pages either side of the spine. */
export const BOOK = { along: 0.84, out: 0.62 }
/** A laptop: a wider hinge, a shallower screen and a shallower deck. */
export const LAPTOP = { along: 1.22, out: 0.74 }

/**
 * The laptop's open pose, in radians of swing.
 *
 * Read these against `leaf()`: swing 0 is a leaf lying in the hinge plane,
 * which faces the camera. So the SCREEN is the leaf near zero -- upright, with
 * a touch of recline -- and the DECK is the one folded most of a quarter turn
 * toward the reader. The first version had them the other way round on the
 * reasoning that a screen "stands up" and therefore wanted the larger angle,
 * and rendered a laptop lying on its back with the keyboard facing the ceiling.
 */
export const SCREEN_RECLINE = 0.17
export const DECK_FOLD = 1.32

export function lerp(a: number, b: number, t: number) {
  return a + (b - a) * t
}

/**
 * One leaf, hinged on the x axis at the origin.
 *
 * `swing` is 0 when the leaf lies flat in the hinge plane pointing "up" in
 * model space, PI when it has folded right over onto the other leaf -- which
 * is a shut book -- and about 1.36 when it is standing as a screen. `sign`
 * picks which side of the hinge the leaf lies on when flat.
 */
export function leaf(halfAlong: number, out: number, swing: number, sign: 1 | -1): Quad {
  const fy = sign * out * Math.cos(swing)
  // Negative z is toward the reader, so a leaf lifts off the desk mid-swing
  // instead of sinking through it.
  const fz = -out * Math.sin(swing) * sign
  const h = halfAlong
  return [[-h, 0, 0], [-h, fy, fz], [h, fy, fz], [h, 0, 0]]
}

/**
 * Lift a leaf toward the reader by a constant.
 *
 * This is the book's thickness, and it is not decoration. When the cover is
 * folded shut it occupies exactly the same plane as the pages underneath, the
 * depth sort is a tie, and whichever leaf the sort happens to put last is
 * painted over the other -- which rendered the shut book as a blank white
 * rectangle with its whole cover underneath the page block.
 */
export function lift(q: Quad, dz: number): Quad {
  const f = (p: P3): P3 => [p[0], p[1], p[2] + dz]
  return [f(q[0]), f(q[1]), f(q[2]), f(q[3])]
}

/** Turn the whole object about the view axis: spine vertical -> hinge flat. */
export function spin(q: Quad, a: number): Quad {
  const c = Math.cos(a), s = Math.sin(a)
  const r = (p: P3): P3 => [p[0] * c - p[1] * s, p[0] * s + p[1] * c, p[2]]
  return [r(q[0]), r(q[1]), r(q[2]), r(q[3])]
}

/** Yaw then pitch, so the object is seen from slightly above and to one side. */
export function turn(q: Quad, yaw: number, pitch: number): Quad {
  const cy = Math.cos(yaw), sy = Math.sin(yaw)
  const cp = Math.cos(pitch), sp = Math.sin(pitch)
  const r = (p: P3): P3 => {
    const x = p[0] * cy + p[2] * sy
    const z1 = -p[0] * sy + p[2] * cy
    return [x, p[1] * cp - z1 * sp, p[1] * sp + z1 * cp]
  }
  return [r(q[0]), r(q[1]), r(q[2]), r(q[3])]
}

/**
 * A point inside a leaf, in the leaf's own (u, v).
 *
 * Bilinear rather than a homography on purpose: everything drawn into these
 * leaves is a straight line between two points, and a straight line under
 * bilinear interpolation stays straight. A perspective-correct texture map
 * would cost a matrix solve per frame to fix a foreshortening nobody can see
 * on a ruled line.
 */
export function at(q: Quad, u: number, v: number): P3 {
  const a: P3 = [
    lerp(q[0][0], q[1][0], u), lerp(q[0][1], q[1][1], u), lerp(q[0][2], q[1][2], u),
  ]
  const b: P3 = [
    lerp(q[3][0], q[2][0], u), lerp(q[3][1], q[2][1], u), lerp(q[3][2], q[2][2], u),
  ]
  return [lerp(a[0], b[0], v), lerp(a[1], b[1], v), lerp(a[2], b[2], v)]
}

/** Camera distance. Larger is a longer lens and a flatter picture. */
const FOCAL = 3.6

export type Projector = (p: P3) => [number, number]

export function projector(cx: number, cy: number, scale: number): Projector {
  return (p) => {
    const s = FOCAL / (FOCAL + p[2])
    return [cx + p[0] * s * scale, cy + p[1] * s * scale]
  }
}

/** Twice the signed area of the projected quad. Near zero means edge on. */
export function area(pts: Array<[number, number]>): number {
  let a = 0
  for (let i = 0; i < pts.length; i++) {
    const p = pts[i]
    const q = pts[(i + 1) % pts.length]
    if (!p || !q) return 0
    a += p[0] * q[1] - q[0] * p[1]
  }
  return a / 2
}
