import type { SeedEvent } from './schoolCalendar'

/**
 * An invented school year, for the landing page.
 *
 * The page used to draw its diagram, its counts and its charts from
 * schoolEvents2026_27 -- the real 2026-27 calendar of one school. Accurate, and
 * wrong for two reasons.
 *
 * A visitor has not signed up, so a real calendar on a marketing page reads as
 * a feed they are already subscribed to rather than as a picture of what the
 * product does with theirs. And the moment there is a second school, one
 * school's dates on the front page are somebody else's dates -- the numbers
 * stop being a demonstration and start being a mistake.
 *
 * So this is a plausible year at no school in particular, using the terms every
 * Ontario school uses. Nothing here is any school's real calendar and the page
 * says so wherever it is shown.
 *
 * It keeps the shape that makes the import argument work, because that shape is
 * real even though these dates are not: a title that repeats on many different
 * days, one holiday filed as two entries with different dates, and multi-day
 * spans that must survive as spans. Those are properties of school calendars in
 * general, which is the whole reason the software has to handle them.
 */

/** Repeated deliberately: the collision the identity key exists to survive. */
const REPEATED = 'Late Start'

export const sampleSchoolYear: SeedEvent[] = [
  { title: 'First Day of Classes', description: null, startDate: '2026-09-08', endDate: '2026-09-08', category: 'academic' },
  { title: 'Welcome Assembly', description: 'Whole school, period one', startDate: '2026-09-10', endDate: '2026-09-10', category: 'school' },
  { title: 'Curriculum Evening', description: '6:00 - 8:30 p.m.', startDate: '2026-09-17', endDate: '2026-09-17', category: 'family' },
  { title: REPEATED, description: 'no classes until 10 a.m.', startDate: '2026-09-23', endDate: '2026-09-23', category: 'school' },
  { title: 'Terry Fox Run', description: null, startDate: '2026-09-25', endDate: '2026-09-25', category: 'sports' },
  { title: 'PD Day', description: 'no students in school', startDate: '2026-10-02', endDate: '2026-10-02', category: 'pa-day' },
  { title: REPEATED, description: 'no classes until 10 a.m.', startDate: '2026-10-07', endDate: '2026-10-07', category: 'school' },
  { title: 'Holiday Monday', description: 'Thanksgiving', startDate: '2026-10-12', endDate: '2026-10-12', category: 'holiday' },
  { title: 'Photo Day', description: null, startDate: '2026-10-15', endDate: '2026-10-15', category: 'school' },
  { title: REPEATED, description: 'no classes until 10 a.m.', startDate: '2026-10-21', endDate: '2026-10-21', category: 'school' },
  { title: 'Midterm Reports Posted', description: null, startDate: '2026-10-30', endDate: '2026-10-30', category: 'academic' },
  { title: REPEATED, description: 'no classes until 10 a.m.', startDate: '2026-11-04', endDate: '2026-11-04', category: 'school' },
  { title: 'Parent Teacher Interviews', description: 'by appointment', startDate: '2026-11-06', endDate: '2026-11-06', category: 'family' },
  { title: 'Remembrance Day Assembly', description: null, startDate: '2026-11-11', endDate: '2026-11-11', category: 'school' },
  { title: REPEATED, description: 'no classes until 10 a.m.', startDate: '2026-11-18', endDate: '2026-11-18', category: 'school' },
  { title: 'PD Day', description: 'no students in school', startDate: '2026-11-27', endDate: '2026-11-27', category: 'pa-day' },
  { title: 'Winter Concert', description: 'Senior band and choir, 7 p.m.', startDate: '2026-12-04', endDate: '2026-12-04', category: 'performance' },
  { title: REPEATED, description: 'no classes until 10 a.m.', startDate: '2026-12-09', endDate: '2026-12-09', category: 'school' },
  { title: 'Term One Examinations', description: null, startDate: '2026-12-14', endDate: '2026-12-18', category: 'exam' },
  // One break, filed as two entries with different dates -- the case that
  // defeats matching on date alone.
  { title: 'Winter Break', description: null, startDate: '2026-12-21', endDate: '2026-12-31', category: 'holiday' },
  { title: 'Winter Break', description: null, startDate: '2027-01-01', endDate: '2027-01-04', category: 'holiday' },
  { title: 'Classes Resume', description: null, startDate: '2027-01-05', endDate: '2027-01-05', category: 'academic' },
  { title: REPEATED, description: 'no classes until 10 a.m.', startDate: '2027-01-13', endDate: '2027-01-13', category: 'school' },
  { title: 'Semester Reports Posted', description: null, startDate: '2027-01-22', endDate: '2027-01-22', category: 'academic' },
  { title: REPEATED, description: 'no classes until 10 a.m.', startDate: '2027-01-27', endDate: '2027-01-27', category: 'school' },
  { title: 'PD Day', description: 'no students in school', startDate: '2027-02-01', endDate: '2027-02-01', category: 'pa-day' },
  { title: 'Winter Carnival', description: null, startDate: '2027-02-05', endDate: '2027-02-05', category: 'school' },
  { title: REPEATED, description: 'no classes until 10 a.m.', startDate: '2027-02-10', endDate: '2027-02-10', category: 'school' },
  { title: 'Family Day', description: null, startDate: '2027-02-15', endDate: '2027-02-15', category: 'holiday' },
  { title: 'Course Selection Opens', description: null, startDate: '2027-02-22', endDate: '2027-02-22', category: 'academic' },
  { title: REPEATED, description: 'no classes until 10 a.m.', startDate: '2027-02-24', endDate: '2027-02-24', category: 'school' },
  { title: 'March Break', description: null, startDate: '2027-03-15', endDate: '2027-03-19', category: 'holiday' },
  { title: 'Classes Resume', description: null, startDate: '2027-03-22', endDate: '2027-03-22', category: 'academic' },
  { title: REPEATED, description: 'no classes until 10 a.m.', startDate: '2027-03-24', endDate: '2027-03-24', category: 'school' },
  { title: 'Spring Play', description: 'Three evening performances', startDate: '2027-03-26', endDate: '2027-03-28', category: 'performance' },
  { title: 'PD Day', description: 'no students in school', startDate: '2027-04-02', endDate: '2027-04-02', category: 'pa-day' },
  { title: 'Good Friday', description: null, startDate: '2027-04-09', endDate: '2027-04-09', category: 'holiday' },
  { title: 'Easter Monday', description: null, startDate: '2027-04-12', endDate: '2027-04-12', category: 'holiday' },
  { title: REPEATED, description: 'no classes until 10 a.m.', startDate: '2027-04-14', endDate: '2027-04-14', category: 'school' },
  { title: 'Athletics Banquet', description: '6 p.m.', startDate: '2027-04-22', endDate: '2027-04-22', category: 'sports' },
  { title: REPEATED, description: 'no classes until 10 a.m.', startDate: '2027-04-28', endDate: '2027-04-28', category: 'school' },
  { title: 'Spring Concert', description: '7 p.m.', startDate: '2027-05-06', endDate: '2027-05-06', category: 'performance' },
  { title: 'Victoria Day', description: null, startDate: '2027-05-24', endDate: '2027-05-24', category: 'holiday' },
  { title: REPEATED, description: 'no classes until 10 a.m.', startDate: '2027-05-26', endDate: '2027-05-26', category: 'school' },
  { title: 'Course Selection Closes', description: null, startDate: '2027-05-28', endDate: '2027-05-28', category: 'academic' },
  { title: 'Final Examinations', description: null, startDate: '2027-06-07', endDate: '2027-06-15', category: 'exam' },
  { title: REPEATED, description: 'no classes until 10 a.m.', startDate: '2027-06-02', endDate: '2027-06-02', category: 'school' },
  { title: 'Prize Day', description: null, startDate: '2027-06-18', endDate: '2027-06-18', category: 'school' },
  { title: 'Graduation', description: null, startDate: '2027-06-22', endDate: '2027-06-22', category: 'school' },
  { title: 'Last Day of Classes', description: null, startDate: '2027-06-24', endDate: '2027-06-24', category: 'academic' },
  { title: 'Reports Released', description: null, startDate: '2027-06-29', endDate: '2027-06-29', category: 'academic' },
]

/** The title that repeats, and how often -- read rather than written down. */
export const SAMPLE_REPEATED_TITLE = REPEATED
export const sampleRepeatedCount = sampleSchoolYear.filter((e) => e.title === REPEATED).length
