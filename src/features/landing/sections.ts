/**
 * The page's chapters, named once.
 *
 * The landing page is ten scenes long and several of them are pinned, which
 * means a reader can be four thousand pixels into a section and have no way of
 * knowing whether they are near the start of the page or the end. The header
 * hairline says how far through, but not through *what*.
 *
 * So the order lives here rather than being implied by the order of JSX in the
 * route: the companion rail reads this list, the route wraps each scene with
 * the matching id, and the two cannot drift apart without a type error.
 *
 * `label` is what the rail shows, so it is short enough to sit beside a dot.
 * `blurb` is the one line that appears when a dot is hovered or focused --
 * enough to decide whether to jump there.
 */
export type LandingSection = {
  id: string
  label: string
  blurb: string
}

export const LANDING_SECTIONS: LandingSection[] = [
  { id: 'top', label: 'Opening', blurb: 'What Calenda is, in one screen' },
  { id: 'glance', label: 'A day', blurb: 'One event, close up and far away' },
  { id: 'pipeline', label: 'The path', blurb: 'Where a date comes from, end to end' },
  { id: 'import', label: 'The import', blurb: 'Fifty-one dates, fifteen of them identical' },
  { id: 'more', label: 'What else', blurb: 'Classes, deadlines and reminders' },
  { id: 'numbers', label: 'Numbers', blurb: 'The year, counted' },
  { id: 'questions', label: 'Questions', blurb: 'The six things everyone asks' },
  { id: 'world', label: 'Anywhere', blurb: 'One date, read in every timezone' },
  { id: 'privacy', label: 'Privacy', blurb: 'Six ways in, all six refused' },
  { id: 'founder', label: 'Founder', blurb: 'Who built it, and why' },
  { id: 'start', label: 'Sign up', blurb: 'What the first minute looks like' },
]
