/**
 * The three panels, and the slice of scroll each one owns.
 *
 * Every headline and every sentence here is lifted from copy that was already
 * on the landing page and already checked into `docs/FACTS.md`. That is
 * deliberate: a new front door is the easiest place in a project to acquire a
 * claim nobody verified, and this page says less than the old one rather than
 * more, so there was no reason to write a single new promise.
 *
 * `cue` is [fadeInStart, fadeInEnd, fadeOutStart, fadeOutEnd] in page
 * progress. The gaps between one panel's fadeOutEnd and the next's fadeInStart
 * are dead zones on purpose -- the object is alone on screen through the two
 * moments that are actually worth watching, the book opening and the spine
 * turning into a hinge, and no two panels are ever readable at once.
 */

/**
 * A figure and what it means, under each panel.
 *
 * Every number here is read from the sample data or the schools list rather
 * than typed, which is this project's oldest rule and the reason the old
 * landing page's figures could not drift. A word in the `figure` slot is fine
 * -- "Impossible" is a claim the database actually enforces -- but a NUMBER in
 * it must come from an array.
 */
import { SCHOOLS } from '@/data/schools'
import { sampleRepeatedCount, sampleSchoolYear } from '@/data/sampleSchoolYear'

export type Fact = { figure: string; note: string }

export type Panel = {
  id: string
  label: string
  eyebrow: string
  title: string
  body: string
  /**
   * The same claim, short enough for a phone.
   *
   * Not a nicety. The panels are fixed and the page does not scroll, so a
   * column taller than the window is not scrolled to -- it is lost behind the
   * header and the footer, which is exactly what the full body plus three
   * facts did at 375x667. Shortening the sentence is the honest fix; dropping
   * the facts would mean the smallest screen gets the least evidence.
   */
  short: string
  /** Where the anchor for this panel sits in the track, 0..1. */
  anchor: number
  cue: readonly [number, number, number, number]
  /** The primary action belongs on the first and last panels only. */
  action: 'join' | 'privacy'
  facts: readonly Fact[]
}

export const PANELS: readonly Panel[] = [
  {
    id: 'top',
    label: 'Opening',
    eyebrow: 'For students, parents and teachers',
    title: 'Everything you need for school, in one place.',
    body:
      'PA days, exams and assemblies. Your own calendar. Class notes, assignments and '
      + 'deadlines. Calenda holds all of it, and tells you what actually matters today.',
    short:
      'PA days, exams, class notes and deadlines \u2014 in one place, with what actually '
      + 'matters today on top.',
    anchor: 0.02,
    cue: [0.0, 0.0, 0.15, 0.23],
    action: 'join',
    facts: [
      { figure: String(SCHOOLS.length), note: 'schools whose published calendars it reads' },
      { figure: String(sampleSchoolYear.length), note: 'dates in the sample year, read in one pass' },
      { figure: 'Three', note: 'roles \u2014 student, parent and teacher' },
    ],
  },
  {
    id: 'import',
    label: 'The import',
    eyebrow: 'The import',
    title: 'Entered once, agreed everywhere.',
    body:
      'Calenda reads the calendar your school publishes and stages every date for you to '
      + 'review. Nothing is ever silently merged or deleted — you see both entries and choose.',
    short:
      'Every imported date is staged for you to review. Nothing is ever silently merged '
      + 'or deleted.',
    anchor: 0.50,
    cue: [0.35, 0.43, 0.57, 0.65],
    action: 'privacy',
    facts: [
      { figure: String(sampleRepeatedCount), note: 'dates share one title in that year' },
      { figure: 'None', note: 'are merged or dropped without you choosing' },
      { figure: 'Every', note: 'imported date is staged for review first' },
    ],
  },
  {
    id: 'reminders',
    label: 'Reminders',
    eyebrow: 'Reminders',
    title: 'Scheduled by you, and never doubled.',
    body:
      'Pick the timings per category — a week before an exam, an hour before a meeting — '
      + 'and set quiet hours nothing is scheduled inside. A second reminder for the same thing '
      + 'is impossible: the database refuses to store it.',
    short:
      'Timings per category, quiet hours you set, and a second reminder for one thing '
      + 'that the database simply refuses.',
    anchor: 0.92,
    cue: [0.77, 0.85, 1.10, 1.20],
    action: 'join',
    facts: [
      { figure: 'Per category', note: 'a week before an exam, an hour before a meeting' },
      { figure: 'Quiet hours', note: 'nothing is ever scheduled inside them' },
      { figure: 'Impossible', note: 'a second reminder for one thing \u2014 the database refuses it' },
    ],
  },
]

/** Pixels of counter-scroll travel as a panel arrives and leaves. */
export const DRIFT = 22

function smooth(t: number) {
  return t * t * (3 - 2 * t)
}

export function ramp(p: number, a: number, b: number) {
  if (b <= a) return p >= b ? 1 : 0
  return smooth(Math.min(1, Math.max(0, (p - a) / (b - a))))
}

/** Opacity and drift for a panel at a given page progress. */
export function panelAt(cue: Panel['cue'], p: number) {
  const enter = ramp(p, cue[0], cue[1])
  const leave = ramp(p, cue[2], cue[3])
  return { o: enter * (1 - leave), y: (1 - enter) * DRIFT - leave * DRIFT }
}
