import { useCallback, useEffect, useRef, useState } from 'react'
import { useReducedMotion } from 'motion/react'
import { LANDING_SECTIONS } from './sections'

/** Where in the viewport a chapter counts as "the one being read". */
const READ_LINE = 0.35

/**
 * Which chapter is being read, and how to get to another one.
 *
 * Owned by the route rather than by the companion rail, because two things now
 * need the answer: the rail names the chapter, and the page wrapper takes its
 * accent so the header hairline and the rail's own ticks carry the colour of
 * wherever the reader is. Two scroll listeners for one number is one too many.
 *
 * Offsets are measured once and cached, not read per scroll frame. Twelve
 * getBoundingClientRect calls inside a scroll handler is twelve forced layouts
 * per frame, which is exactly what turns a 6ms frame into a 40ms one on the
 * pinned scenes.
 */
export function useChapters() {
  const reduce = useReducedMotion()
  const [active, setActive] = useState(0)
  const [ready, setReady] = useState(false)
  const tops = useRef<number[]>([])

  const measure = useCallback(() => {
    tops.current = LANDING_SECTIONS.map(({ id }) => {
      const el = document.getElementById(id)
      return el ? el.getBoundingClientRect().top + window.scrollY : Number.POSITIVE_INFINITY
    })
    setReady(true)
  }, [])

  useEffect(() => {
    measure()
    // Bundled fonts land after first paint and change every offset below the
    // fold, so measure again once the page has settled.
    const settle = window.setTimeout(measure, 400)
    window.addEventListener('resize', measure)

    let frame = 0
    const onScroll = () => {
      if (frame) return
      frame = window.requestAnimationFrame(() => {
        frame = 0
        const line = window.scrollY + window.innerHeight * READ_LINE
        let next = 0
        for (let i = 0; i < tops.current.length; i += 1) {
          if (tops.current[i]! <= line) next = i
        }
        setActive((prev) => (prev === next ? prev : next))
      })
    }
    onScroll()
    window.addEventListener('scroll', onScroll, { passive: true })

    return () => {
      window.clearTimeout(settle)
      window.removeEventListener('resize', measure)
      window.removeEventListener('scroll', onScroll)
      if (frame) window.cancelAnimationFrame(frame)
    }
  }, [measure])

  const goTo = useCallback((index: number) => {
    const clamped = Math.min(LANDING_SECTIONS.length - 1, Math.max(0, index))
    const el = document.getElementById(LANDING_SECTIONS[clamped]!.id)
    if (!el) return
    // A hair past the top, so the header does not sit over the first line and
    // so a pinned scene starts at progress zero rather than just before it.
    const top = el.getBoundingClientRect().top + window.scrollY
    window.scrollTo({ top: clamped === 0 ? 0 : top + 2, behavior: reduce ? 'auto' : 'smooth' })
  }, [reduce])

  return { active, ready, goTo, section: LANDING_SECTIONS[active]! }
}
