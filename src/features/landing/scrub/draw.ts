import {
  area, at, BOOK, DECK_FOLD, LAPTOP, leaf, lerp, lift, projector, SCREEN_RECLINE, spin, turn,
  type Projector, type Quad,
} from './geometry'

/**
 * One frame of the book becoming a laptop, drawn from a single number.
 *
 * `draw(ctx, p, …)` is pure in the way that matters: given the same progress it
 * paints the same frame, holding no state between calls. That is what lets the
 * scroll scrub land anywhere instantly -- there is no timeline to wind forward
 * and no frame to decode, so scrubbing backwards costs exactly what scrubbing
 * forwards does. It is the same property that made the original all-intra video
 * scrub-able, arrived at by not having a video.
 *
 * The retro half and the modern half are told apart by *drawing*, not by
 * colour, because the page has to work in black and white. The book is
 * cross-hatched, ornamented, and drawn with an uneven, heavier line; the laptop
 * is flat fills, even hairlines and generous radii. Turn the colour off and the
 * two are still obviously a century apart.
 */

export type Palette = {
  ink: string
  paper: string
  /** 0..1, how much chroma survives. The mono toggle drives this. */
  tint: number
}

function ramp(p: number, a: number, b: number) {
  if (b <= a) return p >= b ? 1 : 0
  const t = Math.min(1, Math.max(0, (p - a) / (b - a)))
  return t * t * (3 - 2 * t)
}

/**
 * Ink at an alpha, built from parsed numbers rather than by string surgery.
 *
 * The first version did `ink.replace('rgb(', 'rgba(')` and appended the alpha
 * after a comma. Given the modern space-separated form a stylesheet is
 * perfectly entitled to use -- `rgb(30 55 101)` -- that produces
 * `rgba(30 55 101, 0.055)`, which mixes space-separated components with a
 * comma alpha and is not a colour at all.
 *
 * And an invalid `fillStyle` does not throw. The assignment is IGNORED and the
 * context keeps whatever it had, which on a canvas is state that survives
 * clearRect and therefore survives the frame. So every fill on the page came
 * out in some earlier frame's colour: the laptop screen rendered as a solid
 * opaque navy slab, the calendar drawn underneath it invisible, and nothing
 * anywhere reported an error.
 *
 * Parsing the three numbers out and emitting the comma form is valid whatever
 * the stylesheet said, and a colour that cannot be parsed now falls back to a
 * visible one instead of to the last thing that worked.
 */
function rgba(ink: string, a: number) {
  const n = ink.match(/-?\d*\.?\d+/g)
  if (!n || n.length < 3) return `rgba(30, 55, 101, ${a})`
  return `rgba(${n[0]}, ${n[1]}, ${n[2]}, ${a})`
}

function trace(ctx: CanvasRenderingContext2D, pr: Projector, q: Quad) {
  ctx.beginPath()
  const a = pr(q[0]), b = pr(q[1]), c = pr(q[2]), d = pr(q[3])
  ctx.moveTo(a[0], a[1])
  ctx.lineTo(b[0], b[1])
  ctx.lineTo(c[0], c[1])
  ctx.lineTo(d[0], d[1])
  ctx.closePath()
}

/** A straight line in leaf space. Bilinear keeps it straight on screen. */
function rule(
  ctx: CanvasRenderingContext2D, pr: Projector, q: Quad,
  u0: number, v0: number, u1: number, v1: number,
) {
  const a = pr(at(q, u0, v0))
  const b = pr(at(q, u1, v1))
  ctx.moveTo(a[0], a[1])
  ctx.lineTo(b[0], b[1])
}

function boxPath(
  ctx: CanvasRenderingContext2D, pr: Projector, q: Quad,
  u0: number, v0: number, u1: number, v1: number,
) {
  const a = pr(at(q, u0, v0)), b = pr(at(q, u1, v0))
  const c = pr(at(q, u1, v1)), d = pr(at(q, u0, v1))
  ctx.moveTo(a[0], a[1])
  ctx.lineTo(b[0], b[1])
  ctx.lineTo(c[0], c[1])
  ctx.lineTo(d[0], d[1])
  ctx.closePath()
}

/* ---------------------------------------------------------------- the book */

/**
 * The cover: a ruled border, corner rules and a title plate.
 *
 * Deliberately engraved rather than printed -- everything here is a line, and
 * the weight varies across the plate, because a flat even stroke reads as
 * modern however old the ornament is.
 */
function cover(ctx: CanvasRenderingContext2D, pr: Projector, q: Quad, a: number, pal: Palette) {
  if (a <= 0.01) return
  ctx.save()
  ctx.lineJoin = 'round'

  ctx.strokeStyle = rgba(pal.ink, 0.68 * a)
  ctx.lineWidth = 2.1
  ctx.beginPath(); boxPath(ctx, pr, q, 0.10, 0.06, 0.90, 0.94); ctx.stroke()

  ctx.strokeStyle = rgba(pal.ink, 0.44 * a)
  ctx.lineWidth = 1
  ctx.beginPath(); boxPath(ctx, pr, q, 0.145, 0.088, 0.855, 0.912); ctx.stroke()

  // Corner rules, the cheapest ornament that still reads as one.
  ctx.beginPath()
  const k = 0.085
  for (const [cu, cv, du, dv] of [
    [0.145, 0.088, 1, 1], [0.855, 0.088, -1, 1],
    [0.855, 0.912, -1, -1], [0.145, 0.912, 1, -1],
  ] as const) {
    rule(ctx, pr, q, cu, cv + dv * k * 0.7, cu + du * k * 0.5, cv)
  }
  ctx.stroke()

  // The title plate.
  ctx.strokeStyle = rgba(pal.ink, 0.56 * a)
  ctx.lineWidth = 1.3
  ctx.beginPath(); boxPath(ctx, pr, q, 0.24, 0.36, 0.76, 0.56); ctx.stroke()

  ctx.strokeStyle = rgba(pal.ink, 0.74 * a)
  ctx.lineWidth = 1.6
  ctx.beginPath()
  // "CALENDA" as seven strokes rather than text: type drawn into a quad needs
  // a homography, and a word that shears as the cover turns is worse than a
  // rule that does not pretend to be a word.
  for (let i = 0; i < 7; i++) {
    const u = 0.30 + i * 0.062
    rule(ctx, pr, q, u, 0.425, u, 0.475)
  }
  ctx.stroke()

  ctx.strokeStyle = rgba(pal.ink, 0.30 * a)
  ctx.lineWidth = 1
  ctx.beginPath()
  rule(ctx, pr, q, 0.36, 0.515, 0.64, 0.515)
  ctx.stroke()

  // Cross-hatch, bottom-right, so the cover has a lit side.
  ctx.strokeStyle = rgba(pal.ink, 0.20 * a)
  ctx.lineWidth = 0.8
  ctx.beginPath()
  for (let i = 0; i < 16; i++) {
    const t = i / 15
    rule(ctx, pr, q, 0.50 + t * 0.42, 0.66, 0.92, 0.66 + (1 - t) * 0.26)
  }
  ctx.stroke()
  ctx.restore()
}

/** An agenda page: ruled lines, a month block, a few filled dates. */
function page(ctx: CanvasRenderingContext2D, pr: Projector, q: Quad, a: number, pal: Palette) {
  if (a <= 0.01) return
  ctx.save()

  ctx.strokeStyle = rgba(pal.ink, 0.36 * a)
  ctx.lineWidth = 1
  ctx.beginPath()
  for (let i = 0; i < 11; i++) {
    const v = 0.44 + i * 0.048
    rule(ctx, pr, q, 0.14, v, 0.86, v)
  }
  ctx.stroke()

  // A month grid, sketched. Five rows of seven.
  ctx.strokeStyle = rgba(pal.ink, 0.34 * a)
  ctx.lineWidth = 0.9
  ctx.beginPath()
  for (let c = 0; c <= 7; c++) {
    const u = 0.16 + (c / 7) * 0.68
    rule(ctx, pr, q, u, 0.13, u, 0.36)
  }
  for (let r = 0; r <= 5; r++) {
    const v = 0.13 + (r / 5) * 0.23
    rule(ctx, pr, q, 0.16, v, 0.84, v)
  }
  ctx.stroke()

  // Four marked days, hatched rather than filled -- ink on paper, not a swatch.
  ctx.strokeStyle = rgba(pal.ink, 0.50 * a)
  ctx.lineWidth = 0.9
  ctx.beginPath()
  for (const [c, r] of [[1, 0], [4, 1], [2, 3], [6, 4]] as const) {
    const u0 = 0.16 + (c / 7) * 0.68, u1 = 0.16 + ((c + 1) / 7) * 0.68
    const v0 = 0.13 + (r / 5) * 0.23, v1 = 0.13 + ((r + 1) / 5) * 0.23
    for (let i = 1; i < 5; i++) {
      const t = i / 5
      rule(ctx, pr, q, u0, lerp(v0, v1, t), lerp(u0, u1, t), v0)
    }
  }
  ctx.stroke()
  ctx.restore()
}

/** The block of page edges that makes a closed book a solid object. */
function pageBlock(ctx: CanvasRenderingContext2D, pr: Projector, q: Quad, a: number, pal: Palette) {
  if (a <= 0.01) return
  ctx.save()
  ctx.strokeStyle = rgba(pal.ink, 0.30 * a)
  ctx.lineWidth = 1
  ctx.beginPath()
  for (let i = 1; i <= 7; i++) {
    const off = i * 0.006
    rule(ctx, pr, q, 1 - off, 0.02 + off * 0.6, 1 - off, 0.98 - off * 0.6)
  }
  ctx.stroke()
  ctx.restore()
}

/* -------------------------------------------------------------- the laptop */

/** The lid's screen: a calendar, flat and even. */
function screen(ctx: CanvasRenderingContext2D, pr: Projector, q: Quad, a: number, pal: Palette) {
  if (a <= 0.01) return
  ctx.save()

  // Bezel inset. `u` runs hinge -> top, so the display sits inside both.
  ctx.fillStyle = rgba(pal.ink, 0.07 * a)
  ctx.beginPath(); boxPath(ctx, pr, q, 0.08, 0.035, 0.94, 0.965); ctx.fill()

  ctx.strokeStyle = rgba(pal.ink, 0.30 * a)
  ctx.lineWidth = 1
  ctx.beginPath(); boxPath(ctx, pr, q, 0.08, 0.035, 0.94, 0.965); ctx.stroke()

  // A title bar, then a seven-column month. Hairlines, evenly spaced.
  ctx.strokeStyle = rgba(pal.ink, 0.26 * a)
  ctx.lineWidth = 0.9
  ctx.beginPath()
  rule(ctx, pr, q, 0.80, 0.035, 0.80, 0.965)
  for (let c = 1; c < 7; c++) {
    const v = 0.035 + (c / 7) * 0.93
    rule(ctx, pr, q, 0.10, v, 0.80, v)
  }
  for (let r = 1; r < 5; r++) {
    const u = 0.10 + (r / 5) * 0.70
    rule(ctx, pr, q, u, 0.035, u, 0.965)
  }
  ctx.stroke()

  // Events: solid bars, because a screen renders fills and paper does not.
  ctx.fillStyle = rgba(pal.ink, 0.52 * a)
  for (const [r, c, span] of [[0, 1, 1], [1, 3, 2], [2, 0, 1], [3, 4, 2], [4, 2, 1]] as const) {
    const u0 = 0.10 + (r / 5) * 0.70 + 0.022
    const u1 = u0 + 0.055
    const v0 = 0.035 + (c / 7) * 0.93 + 0.012
    const v1 = 0.035 + ((c + span) / 7) * 0.93 - 0.012
    ctx.beginPath(); boxPath(ctx, pr, q, u0, v0, u1, v1); ctx.fill()
  }

  // The title row's two words.
  ctx.fillStyle = rgba(pal.ink, 0.34 * a)
  ctx.beginPath(); boxPath(ctx, pr, q, 0.845, 0.06, 0.885, 0.26); ctx.fill()
  ctx.beginPath(); boxPath(ctx, pr, q, 0.845, 0.30, 0.875, 0.40); ctx.fill()
  ctx.restore()
}

/**
 * The deck: keys and a trackpad.
 *
 * Outlined rather than filled. Forty-eight adjacent rectangles at any alpha
 * worth seeing stop reading as keys and start reading as one slab -- the first
 * version filled them at 0.3 and produced a navy block that covered the screen
 * behind it. Adjacent fills average; adjacent outlines stay countable.
 */
function deck(ctx: CanvasRenderingContext2D, pr: Projector, q: Quad, a: number, pal: Palette) {
  if (a <= 0.01) return
  ctx.save()

  ctx.strokeStyle = rgba(pal.ink, 0.26 * a)
  ctx.lineWidth = 0.8
  ctx.beginPath()
  const rows = 4, cols = 11
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const u0 = 0.14 + (r / rows) * 0.40 + 0.012
      const u1 = 0.14 + ((r + 1) / rows) * 0.40 - 0.012
      const v0 = 0.12 + (c / cols) * 0.76 + 0.009
      const v1 = 0.12 + ((c + 1) / cols) * 0.76 - 0.009
      boxPath(ctx, pr, q, u0, v0, u1, v1)
    }
  }
  ctx.stroke()

  ctx.strokeStyle = rgba(pal.ink, 0.20 * a)
  ctx.lineWidth = 1
  ctx.beginPath(); boxPath(ctx, pr, q, 0.64, 0.33, 0.90, 0.67); ctx.stroke()
  ctx.restore()
}

/* ------------------------------------------------------------------ driver */

const YAW_CLOSED = 0.30
const PITCH = 0.12

/**
 * Paint one frame.
 *
 * `w`/`h` are CSS pixels; the caller has already scaled the context for the
 * device pixel ratio.
 */
export function draw(
  ctx: CanvasRenderingContext2D, p: number, w: number, h: number, pal: Palette,
) {
  ctx.clearRect(0, 0, w, h)

  // Four numbers, in the order the object does things. They overlap a little
  // so it is never momentarily static, and never doing two things at once.
  const opening = ramp(p, 0.06, 0.50)   // the cover swings off
  const turning = ramp(p, 0.52, 0.74)   // the spine becomes a hinge
  const rising = ramp(p, 0.70, 0.95)    // the lid stands up

  // PI is shut, 0 is flat open and facing you, and a screen is barely off
  // that. One leaf does all three; the other folds down into the keyboard.
  const lidSwing = lerp(lerp(Math.PI, 0, opening), SCREEN_RECLINE, rising)
  const baseSwing = lerp(0, DECK_FOLD, rising)
  const along = lerp(BOOK.along, LAPTOP.along, turning) / 2
  const out = lerp(BOOK.out, LAPTOP.out, turning)
  // A quarter turn: spine upright, hinge flat.
  const quarter = lerp(Math.PI / 2, 0, turning)

  // The camera settles from a three-quarter view of the shut book to almost
  // square on to the screen, because a laptop seen from an angle is a picture
  // of a laptop and one seen straight on is a thing you could use.
  const yaw = lerp(YAW_CLOSED, 0.05, turning)

  // The cover rides above the page block by the thickness of the book, which
  // is what stops the two coinciding while it is shut.
  const thickness = -0.022 * (lidSwing / Math.PI)
  const lid = turn(spin(lift(leaf(along, out, lidSwing, -1), thickness), quarter), yaw, PITCH)
  const base = turn(spin(leaf(along, out, baseSwing, 1), quarter), yaw, PITCH)

  // Sized as a background, not as a subject. Three panels of type sit over
  // this, and an object big enough to be the picture is an object the headline
  // cannot be read against -- measured at 0.46, where the ruled lines of the
  // page ran straight through "Everything you need for school".
  // Eased down through the turn. A rectangle rotated forty-five degrees needs
  // about 1.4x the width of the same rectangle square on, so holding the scale
  // constant runs the corners off both sides at exactly the moment the object
  // is doing the thing worth watching.
  const scale = Math.min(w, h) * 0.36 * (1 - 0.15 * Math.sin(turning * Math.PI))
  // Dropped below centre so the screen sits under the headline rather than
  // behind it -- the object is the lower half of the composition and the type
  // is the upper half, which is the only arrangement where both are legible.
  const pr = projector(w / 2, h * 0.63, scale)

  // Painter's order, recomputed every frame: which leaf is nearer changes as
  // the hinge comes round, and a fixed order puts the deck through the screen
  // for part of the turn.
  const depth = (q: Quad) => (q[0][2] + q[1][2] + q[2][2] + q[3][2]) / 4
  const leaves: Array<{ q: Quad; kind: 'lid' | 'base' }> = [
    { q: lid, kind: 'lid' }, { q: base, kind: 'base' },
  ]
  leaves.sort((a, b) => depth(b.q) - depth(a.q))

  const bookish = 1 - turning
  // The cover is on the leaf that swings, so it goes as that leaf turns away.
  const coverA = (1 - ramp(p, 0.08, 0.28)) * bookish
  const pageA = ramp(p, 0.24, 0.46) * bookish
  const modernA = ramp(p, 0.62, 0.86)

  for (const { q, kind } of leaves) {
    const pts: Array<[number, number]> = [pr(q[0]), pr(q[1]), pr(q[2]), pr(q[3])]
    // Only the edge-on instant is skipped. Culling every back-facing leaf
    // makes the shut book vanish, because the face you look at when a book is
    // closed IS the back of the cover quad.
    if (Math.abs(area(pts)) < 240) continue

    trace(ctx, pr, q)
    ctx.fillStyle = pal.paper
    ctx.fill()
    ctx.strokeStyle = rgba(pal.ink, lerp(0.58, 0.40, turning))
    ctx.lineWidth = lerp(1.9, 1.2, turning)
    ctx.lineJoin = 'round'
    ctx.stroke()

    // Everything drawn into a leaf is clipped to it. Bilinear interpolation
    // keeps a line straight but does not keep it inside: the cover's hatching
    // ran off the bottom corner and onto the background, because a hatch that
    // ends at u=0.92 still leaves the quad once the quad is foreshortened.
    ctx.save()
    trace(ctx, pr, q)
    ctx.clip()

    if (kind === 'lid') {
      cover(ctx, pr, q, coverA, pal)
      page(ctx, pr, q, pageA, pal)
      screen(ctx, pr, q, modernA, pal)
    } else {
      page(ctx, pr, q, pageA, pal)
      pageBlock(ctx, pr, q, bookish * (1 - opening * 0.5), pal)
      deck(ctx, pr, q, modernA, pal)
    }
    ctx.restore()
  }
}
