import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'

/**
 * The reminders list must say what each reminder is about.
 *
 * It said "Reminder" for every row on the live site for the life of the
 * feature. `notification_queue` has no title -- deliberately, because copying
 * one in means a renamed event keeps the old name -- so `select('*')` on the
 * table gave every row `subject_title: undefined`, and the screen's
 * `?? 'Reminder'` turned that into a word.
 *
 * Nothing caught it because `previewSource` sets the field, and every audit
 * this project runs enters through preview. **A preview that supplies a field
 * the real source cannot is not a preview of the app**, and that is the part
 * worth guarding: the behaviour is checked against a real Postgres in
 * supabase/tests/reminder_title_test.sql, and what is checked here is that the
 * client still asks the thing that can answer.
 */
describe('what a queued reminder is about', () => {
  const source = readFileSync('src/data/supabaseSource.ts', 'utf8')
  // Comments are stripped: the ones explaining this name both the table and
  // the view, so a search over the raw file would match the explanation. That
  // trap has now been hit three times in this repo's guards.
  const code = source
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/^\s*\/\/.*$/gm, '')

  it('is read from the view that resolves it, not the table that cannot', () => {
    const fn = code.slice(code.indexOf('async listQueuedReminders'))
    const body = fn.slice(0, fn.indexOf('},'))
    expect(body, 'listQueuedReminders was not found').toContain('.from(')
    expect(body).toContain("from('queued_reminders')")
    expect(body).not.toContain("from('notification_queue')")
  })

  /**
   * SQL comments stripped, for the same reason the TypeScript ones are.
   *
   * The first version of the security_invoker assertion below passed with
   * `security_invoker = true` deleted from the view, because the migration's
   * own header explains what security_invoker does -- so the regex matched the
   * paragraph describing the property rather than the property. That is the
   * fourth time a guard in this repo has been anchored on prose sitting above
   * the code it meant to check, and the second time in two days.
   */
  const sql = (file: string) =>
    readFileSync(`supabase/migrations/${file}`, 'utf8').replace(/^\s*--.*$/gm, '')

  it('resolves a title for every subject type the queue accepts', () => {
    const view = sql('20260911000100_queued_reminder_titles.sql')
    // Every type the check constraint admits has to appear in the view, or a
    // whole kind of reminder silently reads "Reminder" again. 'digest' is the
    // deliberate exception: it is not about one thing.
    for (const kind of ['event', 'assignment', 'task', 'announcement']) {
      expect(view, `${kind} has no arm in the view`).toContain(`'${kind}'`)
    }
    // And it must run as the caller, or it hands every title to anybody who
    // can read the queue.
    expect(view).toMatch(/security_invoker\s*=\s*true/)
  })

  it('is the same set of types the database will accept', () => {
    // If a migration widens the check constraint again, the view needs the
    // matching arm. This holds the two together rather than trusting that
    // whoever adds the next type remembers.
    const migrations = ['20260904000100_init.sql', '20260910000300_teacher_groups.sql']
      .map(sql).join('\n')
    const constraints = [...migrations.matchAll(/subject_type in \(([^)]+)\)/g)]
    // The last one wins: 20260910000300 rewrote the constraint wholesale to add
    // 'announcement'. A guard that found nothing would pass forever, so this
    // fails loudly rather than looping over an empty list.
    const last = constraints.at(-1)?.[1]
    expect(last, 'the subject_type constraint was not found').toBeTruthy()
    const types = [...last!.matchAll(/'([a-z_]+)'/g)].map((m) => m[1]!)
    expect(types).toContain('announcement')

    const view = sql('20260911000100_queued_reminder_titles.sql')
    for (const kind of types) {
      if (kind === 'digest') continue
      expect(view, `${kind} is accepted by the queue but has no arm in the view`)
        .toContain(`'${kind}'`)
    }
  })
})
