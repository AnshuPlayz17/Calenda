/**
 * Which boundaries carry a mark, and what each one carries.
 *
 * Its own module rather than an export from `SeamMorph.tsx`, for the reason
 * `schoolChoice.ts` sits beside `aboutYou.tsx`: exporting a non-component from
 * a file that exports a component breaks fast refresh for the whole file, and
 * eslint says so out loud. The table also wants asserting about, and a test
 * importing a component module to read a constant drags the component in with
 * it.
 */
/** What the mark is pretending to be. Each draws its own insides. */
export type Kind = 'card' | 'paper' | 'chip' | 'bar' | 'rule' | 'dot' | 'token'

export type Seam = {
  /** The chapter being left, and the one being entered. */
  from: string
  to: string
  kind: Kind
  /** Viewport-relative start and end, as fractions. */
  a: readonly [number, number]
  b: readonly [number, number]
  /** Width in px at each end. */
  size: readonly [number, number]
  /** Height as a multiple of width, at each end. A shape that changes
   *  proportion is doing something a shape that only scales is not. */
  ratio: readonly [number, number]
  /** Corner radius at each end. A card becoming a dot is mostly this. */
  round: readonly [number, number]
  /** Degrees at each end. Left at 0 for anything carrying a ruled surface,
   *  where a tilt reads as a mistake rather than as motion. */
  turn?: readonly [number, number]
}

export const SEAMS: readonly Seam[] = [
  // The day card you were just looking at, shrinking into one of the fifteen
  // tiles. Both chapters are about the same object at two scales: one
  // student's day, and the schools those days are published by.
  { from: 'top', to: 'schools', kind: 'card',
    a: [0.50, 0.44], b: [0.50, 0.56], size: [132, 62], ratio: [0.68, 1], round: [14, 10] },

  // A document leaving the schools and arriving as the book the next chapter
  // opens. The original seam, unchanged.
  { from: 'schools', to: 'morph', kind: 'paper',
    a: [0.50, 0.70], b: [0.69, 0.48], size: [48, 86], ratio: [1.28, 1.28], round: [10, 4] },

  // `pipeline -> import` was built here and removed. See the header: the
  // boundary has an empty stretch and the mark does not sit in it.

  // One of the fifteen identical "Late Start" chips opening into one of the
  // three panels.
  { from: 'import', to: 'more', kind: 'chip',
    a: [0.58, 0.62], b: [0.46, 0.44], size: [64, 168], ratio: [0.42, 0.56], round: [999, 12] },

  // A panel's edge standing up into a counted bar. The numbers chapter is the
  // one where the figure under your eye is a function of scroll position, and
  // its bars are what that produces.
  { from: 'more', to: 'numbers', kind: 'bar',
    a: [0.42, 0.40], b: [0.56, 0.58], size: [120, 34], ratio: [0.5, 2.6], round: [10, 5] },

  // And lying back down into the rule under a question. Same object, turned
  // ninety degrees, which is the cheapest honest way to say "this again, read
  // differently".
  { from: 'numbers', to: 'questions', kind: 'rule',
    a: [0.56, 0.44], b: [0.44, 0.56], size: [34, 150], ratio: [2.6, 0.22], round: [5, 3] },

  // An answer shrinking to a point on a map. One of the six questions is where
  // this works, and the next chapter is the answer drawn out.
  { from: 'questions', to: 'world', kind: 'dot',
    a: [0.46, 0.46], b: [0.57, 0.55], size: [116, 22], ratio: [0.62, 1], round: [12, 999] },

  // And that point thrown at a wall. The privacy chapter is six adversarial
  // tests arriving and stopping dead; a dot leaving the map with speed on it
  // is the first of them.
  { from: 'world', to: 'privacy', kind: 'token',
    a: [0.30, 0.50], b: [0.66, 0.52], size: [22, 40], ratio: [1, 1], round: [999, 6],
    turn: [0, -18] },
]

