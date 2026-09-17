import { describe, expect, it } from 'vitest'
import { readFileSync, readdirSync } from 'node:fs'

/**
 * Every field a type promises, held against the columns behind it.
 *
 * `select('*')` returns exactly the columns that exist. A type field with no
 * column is `undefined` at runtime, and every reader takes it through
 * `?? something` -- which is the right thing to write, and is exactly what
 * turns "never fetched" into a plausible default nobody questions.
 *
 * That is how the Notifications page said "Reminder" for every row for the
 * life of the feature: `QueuedReminder.subject_title` had no column anywhere,
 * `previewSource` supplied it, and every audit goes in through preview. See
 * 20260911000100.
 *
 * `noProfileColumnDrift.test.ts` already does this for the one query that
 * names its columns. This is the same check for the seventeen that do not, and
 * the audit it came from found exactly one more instance -- which is the
 * result worth keeping, because next time it will not be a person looking.
 */

const MIGRATIONS = 'supabase/migrations'

const sql = readdirSync(MIGRATIONS)
  .sort()
  .map((f) => readFileSync(`${MIGRATIONS}/${f}`, 'utf8'))
  .join('\n')
  // Comments first. Several of them quote column lists in prose to explain a
  // decision, and a search that reads those is reading the explanation rather
  // than the thing -- this repo's most repeated guard bug.
  .replace(/^\s*--.*$/gm, '')

/** Every column a table or view actually has, across every migration. */
function columnsOf(table: string): Set<string> {
  const cols = new Set<string>()

  const create = sql.match(
    new RegExp(`create table (?:if not exists )?${table}\\s*\\(([\\s\\S]*?)\\n\\);`, 'i'))
  for (const line of create?.[1]?.split("\n") ?? []) {
    const m = line.match(/^\s{2}([a-z_]+)\s+[a-z]/i)
    if (m?.[1] && !/^(unique|primary|constraint|check|foreign)$/i.test(m[1])) cols.add(m[1])
  }

  // `alter table x\n  add column y` is how every one of these is written here.
  // A regex without \s+ between reported quiet_days as missing when it has
  // existed since 20260904000600.
  for (const m of sql.matchAll(
    new RegExp(`alter table ${table}\\s+add column\\s+(?:if not exists\\s+)?([a-z_]+)`, 'gi'))) {
    if (m[1]) cols.add(m[1])
  }

  // A view names its own output. Split the select list on commas rather than
  // matching around them: with `g`, a regex whose delimiter is part of the
  // match consumes the comma that starts the next item, so it reads every
  // other column. That passed while queued_reminders had one column per line
  // and failed the moment a view put several on one.
  // The LAST definition, not the first: `create or replace view` means a later
  // migration replaces an earlier one, and reading the first reported
  // `notified` as missing from a view that had just been given it.
  const views = [...sql.matchAll(
    new RegExp(`create (?:or replace )?view ${table}[\\s\\S]*?\\bas\\b([\\s\\S]*?);`, 'gi'))]
  const view = views.at(-1)
  if (view?.[1]) {
    const list = view[1].slice(view[1].toLowerCase().indexOf('select') + 6,
                               view[1].toLowerCase().indexOf('\n    from'))
    for (const item of list.split(',')) {
      // `g.name as group_name` is the column group_name; `a.body` is body.
      const alias = item.match(/\bas\s+([a-z_]+)/i)
      const plain = item.trim().match(/(?:[a-z_]+\.)?([a-z_]+)\s*$/i)
      const name = alias?.[1] ?? plain?.[1]
      if (name) cols.add(name)
    }
  }

  return cols
}

const typeSource = readFileSync('src/lib/types.ts', 'utf8').replace(/\/\*[\s\S]*?\*\//g, '')

function fieldsOf(typeName: string): string[] | null {
  const m = typeSource.match(new RegExp(`export type ${typeName} = \\{([\\s\\S]*?)\\n\\}`))
  if (!m?.[1]) return null
  return [...m[1].matchAll(/^\s{2}([a-z_]+)\??:/gim)].map((x) => x[1]!)
}

/**
 * Each `select('*')` in supabaseSource and the type it is cast to.
 *
 * `teacher_groups` is deliberately absent: its read is
 * `select('*, teacher_group_members(count)')` rather than a plain star, and
 * the two writes that do use one set `member_count` themselves. The test below
 * holds this list against the file, so a new star-select cannot be added
 * without landing here.
 */
const PAIRS: Array<[table: string, type: string]> = [
  ['school_years', 'SchoolYear'],
  ['event_categories', 'EventCategory'],
  ['classes', 'SchoolClass'],
  ['notebook_pages', 'NotebookPage'],
  ['assignments', 'Assignment'],
  ['tasks', 'Task'],
  ['files', 'Attachment'],
  ['class_meetings', 'ClassMeeting'],
  ['grades', 'Grade'],
  ['report_cards', 'ReportCard'],
  ['report_card_lines', 'ReportCardLine'],
  ['chat_threads', 'ChatThread'],
  ['chat_messages', 'ChatMessage'],
  ['notification_preferences', 'NotificationPreferences'],
  ['queued_reminders', 'QueuedReminder'],
  ['announcement_messages', 'GroupAnnouncement'],
]

describe('a type may not promise a field the query cannot return', () => {
  it.each(PAIRS)('%s has a column for every field of %s', (table, type) => {
    const cols = columnsOf(table)
    const fields = fieldsOf(type)

    // Both halves assert they found something. A parser that silently matched
    // nothing would pass every row forever, which is the failure mode of every
    // guard in this repo that has had to be fixed.
    expect(cols.size, `no columns found for ${table}`).toBeGreaterThan(0)
    expect(fields, `type ${type} was not found`).toBeTruthy()
    expect(fields!.length, `no fields found on ${type}`).toBeGreaterThan(0)

    const missing = fields!.filter((f) => !cols.has(f))
    expect(missing, `${type} promises ${missing.join(', ')} and ${table} has no such column`)
      .toEqual([])
  })

  it('covers every star-select in the Supabase source', () => {
    // The list above is only as good as its coverage. A new `select('*')`
    // added without a row here would go unchecked -- which is how the last one
    // went unchecked for the life of the feature.
    const src = readFileSync('src/data/supabaseSource.ts', 'utf8')
      .replace(/\/\*[\s\S]*?\*\//g, '')
      .replace(/^\s*\/\/.*$/gm, '')

    // Split rather than match a window. A lookahead to the next `.from('`
    // inside a fixed character budget found two of seventeen, because any pair
    // further apart than the budget matched nothing at all -- and the
    // "did you find anything" assertion below is the only reason that was
    // visible rather than a quietly passing test.
    const starred = new Set<string>()
    for (const chunk of src.split(".from('").slice(1)) {
      const table = chunk.slice(0, chunk.indexOf("'"))
      // Only up to the next call, so a star-select does not bleed backwards
      // onto the query before it.
      const upToNextCall = chunk.split('async ')[0] ?? ''
      if (/\.select\('\*'\)/.test(upToNextCall)) starred.add(table)
    }
    expect(starred.size, 'no star-selects found -- the scan is broken').toBeGreaterThan(5)

    const listed = new Set(PAIRS.map(([t]) => t))
    // teacher_groups uses a star only on its two writes, which supply
    // member_count themselves; see the comment on PAIRS.
    listed.add('teacher_groups')
    const unlisted = [...starred].filter((t) => !listed.has(t))
    expect(unlisted, `${unlisted.join(', ')} is read with select('*') and unchecked`).toEqual([])
  })
})
