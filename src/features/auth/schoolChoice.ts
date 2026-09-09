/**
 * The school answer, which is a list with a way out of it.
 *
 * Separate from the components that render it because these are not components
 * -- exporting them alongside one breaks fast refresh for the whole file, which
 * eslint says out loud.
 */

/** The option meaning "not one of these". */
export const OTHER_SCHOOL = '__other__'

/**
 * What a student's school answer amounts to.
 *
 * The picker's own value when it is a real school; whatever they typed when it
 * is not. An empty string either way if nothing has been answered, which is
 * what the submit gate checks.
 */
export function schoolValue(school: string, other: string): string {
  return school === OTHER_SCHOOL ? other.trim() : school
}
