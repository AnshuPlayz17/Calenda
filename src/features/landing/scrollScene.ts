import { useRef, useState } from 'react'
import { useScroll, useTransform, useReducedMotion } from 'motion/react'
import type { MotionValue } from 'motion/react'

/**
 * A scroll-pinned scene: a tall section whose inner frame stays put while
 * progress runs 0 -> 1 across it.
 *
 * The pattern appears several times on the landing page and was being rebuilt
 * each time with slightly different offsets, which is how two sections end up
 * advancing at different rates for no reason anyone chose.
 *
 * `screens` is how many viewport heights of scroll the scene consumes. It is
 * the scene's pacing dial: two screens is a beat, four is a chapter. Under
 * reduced motion the caller renders a static composition instead and this
 * progress value is never read.
 */
/**
 * How much scroll every pinned scene gets, relative to its natural pacing.
 *
 * One number for the whole page. Each scene declares how many screens it wants
 * relative to the others -- the import and the schools are chapters and ask for
 * four, the founder's hinge is a beat and asks for two -- and this scales all of
 * them together, so their relative weights survive any change to the total.
 *
 * It is 1: the pacing the page had before anyone went looking for a frame
 * count. It was briefly 5.6 and a hundred and fifty-five screens, then 1.7 and
 * fifty-four, and both were too slow to scroll. Frames are seconds times sixty
 * and seconds are distance over speed, so length is the only lever on a frame
 * count -- which is exactly why chasing one is a bad trade on a page with a
 * sign-up button at the end.
 *
 * Every beat inside every scene is a fraction of its own scene, so this scales
 * the whole page without re-timing anything.
 */
export const PACE = 1

/** A scene's natural length, scaled by the page's pacing. */
export function paced(screens: number) {
  return screens * PACE
}

export function useScrollScene(screens: number) {
  const ref = useRef<HTMLDivElement>(null)
  const reduce = useReducedMotion()
  const { scrollYProgress } = useScroll({
    target: ref,
    offset: ['start start', 'end end'],
  })
  return { ref, reduce, progress: scrollYProgress, height: `${screens * 100}svh` }
}

/**
 * Clamp a scroll-progress stop list into [0, 1], keeping it strictly increasing.
 *
 * This is not cosmetic. Motion compiles scroll-linked transforms to native
 * scroll timelines where it can, and there the input range becomes WAAPI
 * keyframe offsets -- which the browser requires to be within [0, 1]. A stop at
 * 1.05, written by adding a fade-out to the last beat of a scene, throws
 *
 *   Failed to execute 'animate' on 'Element': Offsets must be null or in the
 *   range [0,1]
 *
 * at render, and takes the whole page down with it rather than just that
 * element. Beats are easiest to write as "start plus a bit either side", so the
 * ends fall outside the scene constantly; this is where that gets caught.
 */
export function stops(values: number[]): number[] {
  let previous = -1
  return values.map((v) => {
    const clamped = Math.min(1, Math.max(0, v))
    // Strictly increasing, or the interpolation is undefined.
    previous = clamped > previous ? clamped : Math.min(1, previous + 0.001)
    return previous
  })
}

/**
 * Extend a stop list to span the whole scene, holding the end values.
 *
 * `clamp: true` is not enough. Where Motion drives a transform from a native
 * scroll timeline, the stops become WAAPI keyframe offsets and the value
 * outside the declared range is decided by the browser's fill behaviour, not by
 * Motion's clamp. A beat declared over [0, 0.28, 0.38] -> [1, 1, 0] was
 * measured climbing back to 0.91 by the end of the scene: the first beat's
 * heading faded out and then quietly faded back in underneath the third one.
 *
 * So every scroll-linked range on this page is declared across the full scene,
 * with the terminal values stated rather than inferred.
 */
export function held(range: number[], values: number[]): [number[], number[]]
export function held(range: number[], values: string[]): [number[], string[]]
/**
 * Overloaded rather than generic. A generic infers the literal type of an array
 * like [0, 120] as (0 | 120)[], which then will not accept the widened number
 * a MotionValue setter hands back.
 */
export function held(
  range: number[],
  values: Array<number | string>,
): [number[], Array<number | string>] {
  const r = stops(range)
  const v = [...values]
  if (r[0]! > 0) { r.unshift(0); v.unshift(v[0]!) }
  if (r[r.length - 1]! < 1) { r.push(1); v.push(v[v.length - 1]!) }
  return [r, v]
}

/**
 * A window inside the scene's progress, remapped to its own 0 -> 1.
 *
 * Beats are written as absolute positions in the scene ("this happens from 40%
 * to 65% of the way through") rather than as durations, so re-pacing one beat
 * cannot silently shift every beat after it.
 */
export function useBeat(progress: MotionValue<number>, from: number, to: number) {
  const [range, values] = held([from, to], [0, 1])
  return useTransform(progress, range, values)
}

/**
 * True where a scene has room to push the camera in.
 *
 * A zoom is a scale, and a scale on an element that already fills its column
 * puts it wider than the window. Clipped, but still a 500px element inside a
 * 375px screen -- which the harness catches and a reader feels as content
 * cropped for no reason. Below this the zooms flatten to almost nothing.
 *
 * Read once on mount, like every other mechanism switch on this page: a window
 * resized across the breakpoint mid-scroll would otherwise change the scene
 * underneath the reader.
 */
export function useRoomy() {
  const [roomy] = useState(() => typeof window !== 'undefined' && window.innerWidth >= 1024)
  return roomy
}

/**
 * Deterministic pseudo-random in [0, 1) from an integer.
 *
 * The scattered start positions need to look unplanned but must be identical on
 * every render and in every screenshot -- a layout that moves between runs
 * cannot be measured, and cannot be reviewed against a screenshot from an hour
 * ago. Math.random would give neither.
 */
export function scatter(seed: number): number {
  const x = Math.sin(seed * 127.1 + 311.7) * 43758.5453
  return x - Math.floor(x)
}

/**
 * True where scrubbing dozens of elements per frame is a bad bet.
 *
 * The import scene drives forty-nine chips, each carrying five scroll-linked
 * values -- fine on a laptop and fine on a recent phone, and not obviously fine
 * on the mid-range Android a lot of students actually carry. Headless Chromium
 * on a build machine cannot tell you which, so this does not try to measure
 * anything at runtime: it reads the two properties that are cheap, honest and
 * available before the first frame.
 *
 * Read once, deliberately. A viewport that crosses the breakpoint mid-scroll
 * would otherwise swap the whole scene's mechanism underneath the reader, which
 * is worse than either mechanism.
 */
export function prefersLightMotion(): boolean {
  if (typeof window === 'undefined') return false
  try {
    const narrow = window.matchMedia('(max-width: 767px)').matches
    const cores = navigator.hardwareConcurrency
    return narrow || (typeof cores === 'number' && cores <= 4)
  } catch {
    // A browser that cannot answer gets the cheaper scene, not a crash.
    return true
  }
}
