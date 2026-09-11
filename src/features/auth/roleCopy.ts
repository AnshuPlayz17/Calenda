/**
 * What a person may be, and what the screen calls the step that asks.
 *
 * Beside aboutYou.tsx rather than in it, because that file exports components
 * and this exports neither -- which is the rule the dev server's fast refresh
 * needs, and the reason `schoolChoice.ts` sits here too.
 */

/**
 * What a person may choose to be.
 *
 * Deliberately not `Role` from lib/auth, which is what the database stores.
 * That one has admin, which is granted in SQL by somebody who already has the
 * database and must never be a radio button; this one has the three that are.
 */
export type ChosenRole = 'student' | 'parent' | 'teacher'

/**
 * What the last step's marker says, per role.
 *
 * Here rather than in either screen, for the same reason the questions
 * themselves are: a copy in the sign-up form and a copy in first-run is how a
 * teacher signing up one way is told what the screen is about and the other way
 * is told they are about to enter their student's details.
 *
 * A map rather than a nested ternary, because the third role turned one into
 * two and a fourth would turn two into three.
 */
export const DETAIL_LABEL: Record<ChosenRole, string> = {
  student: 'Your school',
  parent: 'Your student',
  teacher: 'Your classes',
}
