/**
 * The page's chapters, named once.
 *
 * The landing page is twelve scenes long and several are pinned, which means a
 * reader can be four thousand pixels into a section with no way of knowing
 * whether they are near the start of the page or the end. The header hairline
 * says how far through, but not through *what*.
 *
 * So the order lives here rather than being implied by the order of JSX in the
 * route: the companion rail reads this list, the route wraps each scene with
 * the matching id and accent, and the two cannot drift apart without a type
 * error.
 *
 * `accent` is the chapter's hue, defined in src/styles/index.css. It is set on
 * the section, so everything inside inherits it, and on the page wrapper for
 * whichever chapter is being read, so the header's progress hairline and the
 * companion rail travel through the page's colour with the reader.
 *
 * The sequence is chosen rather than swept. Cool through the explanatory
 * middle, warm where the page starts asking questions, green again at privacy
 * because that is where "Refused" is already green, rose for the one chapter
 * about a person, and home to indigo at both ends.
 */
export type Accent =
  | 'indigo' | 'violet' | 'blue' | 'azure' | 'cyan' | 'teal'
  | 'green' | 'moss' | 'gold' | 'amber' | 'rose'

export type LandingSection = {
  id: string
  label: string
  blurb: string
  accent: Accent
}

export const LANDING_SECTIONS: LandingSection[] = [
  { id: 'top', label: 'Opening', blurb: 'What Calenda is, in one screen', accent: 'indigo' },
  { id: 'schools', label: 'Schools', blurb: 'Fifteen independent schools across the GTA', accent: 'violet' },
  { id: 'glance', label: 'A day', blurb: 'One event, close up and far away', accent: 'blue' },
  { id: 'pipeline', label: 'The path', blurb: 'Where a date comes from, end to end', accent: 'azure' },
  { id: 'import', label: 'The import', blurb: 'Fifty-one dates, fifteen of them identical', accent: 'cyan' },
  { id: 'more', label: 'What else', blurb: 'Classes, deadlines and reminders', accent: 'teal' },
  { id: 'numbers', label: 'Numbers', blurb: 'The year, counted', accent: 'moss' },
  { id: 'questions', label: 'Questions', blurb: 'The six things everyone asks', accent: 'gold' },
  { id: 'world', label: 'Anywhere', blurb: 'One date, read in every timezone', accent: 'amber' },
  { id: 'privacy', label: 'Privacy', blurb: 'Six ways in, all six refused', accent: 'green' },
  { id: 'founder', label: 'Founder', blurb: 'Who built it, and why', accent: 'rose' },
  { id: 'start', label: 'Sign up', blurb: 'What the first minute looks like', accent: 'indigo' },
]
