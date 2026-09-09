import { useState } from 'react'
import { Button } from '@/components/ui/Button'
import { Card, CardHeader } from '@/components/ui/Card'
import { Select } from '@/components/ui/Select'
import { useAuth } from '@/lib/auth'
import { todayPlain } from '@/lib/datetime'

/**
 * Turning a rotating timetable on, which nothing in the app could do.
 *
 * WHAT WAS WRONG
 *
 * `profiles.timetable_cycle_length` was read in four places and written in
 * none. `cycleDayFor` had twenty-eight passing tests, `class_meetings` carried
 * a `cycle_day` column with a check constraint, `MeetingsEditor` offered a
 * cycle-day slot and `CycleBanner` drew the "Today is Day 3 of 6" strip -- and
 * every one of them was unreachable, because the length was null for every
 * account in the world and nothing could change it. CycleBanner's own comment
 * said "setting a cycle up lives in Settings", which was not true of any
 * version of Settings that has ever existed.
 *
 * WHY THE ANCHOR IS ASKED FOR AT THE SAME TIME
 *
 * A cycle length on its own says nothing about which day today is, and there
 * is no way to derive it -- a six-day cycle skips every closure, so it cannot
 * be counted off a calendar date. Asking "which day is today" in the same
 * breath is one extra question and the difference between a working timetable
 * and a confidently wrong one. Saving stamps today's date as the anchor, which
 * is exactly what CycleBanner's "Not right?" does later.
 *
 * The lengths offered stop at ten. Two is the shortest thing anybody calls a
 * cycle, and past ten it is a term plan rather than a rotation.
 */
export function CycleCard() {
  const { profile, updateProfile } = useAuth()
  const current = profile?.timetable_cycle_length ?? null

  const [length, setLength] = useState(String(current ?? 0))
  const [day, setDay] = useState('1')
  const [busy, setBusy] = useState(false)
  const [saved, setSaved] = useState(false)

  const chosen = Number(length)
  // The day picker cannot offer a day the new length does not have -- picking
  // six and then shortening to four must not leave "Day 6" selected and about
  // to be written.
  const dayValue = Math.min(Math.max(Number(day) || 1, 1), Math.max(chosen, 1))

  async function save() {
    setBusy(true)
    setSaved(false)
    await updateProfile(
      chosen >= 2
        ? {
            timetable_cycle_length: chosen,
            timetable_cycle_anchor: todayPlain(),
            timetable_cycle_anchor_day: dayValue,
          }
        // Turning it off clears the anchor as well. Leaving a stale anchor
        // behind means switching it back on months later silently resumes a
        // count from a date nobody remembers choosing.
        : {
            timetable_cycle_length: null,
            timetable_cycle_anchor: null,
            timetable_cycle_anchor_day: null,
          },
    )
    setBusy(false)
    setSaved(true)
  }

  return (
    <Card>
      <CardHeader title="Timetable cycle" />
      <div className="px-5 pb-5">
        <p className="max-w-[58ch] text-[13.5px] text-text-muted">
          Most schools run the same week every week. Some rotate — Day 1 to Day 6,
          carrying on across weekends and skipping closures. Turn this on and each
          class slot can be set to a cycle day instead of a weekday.
        </p>

        <div className="mt-4 flex flex-wrap items-end gap-3">
          <Select
            label="Cycle length"
            value={length}
            onChange={(e) => { setLength(e.target.value); setSaved(false) }}
            className="w-[200px]"
          >
            <option value="0">Off — an ordinary week</option>
            {Array.from({ length: 9 }, (_, i) => i + 2).map((n) => (
              <option key={n} value={n}>{n} days</option>
            ))}
          </Select>

          {chosen >= 2 && (
            <Select
              label="Today is"
              value={String(dayValue)}
              onChange={(e) => { setDay(e.target.value); setSaved(false) }}
              className="w-[140px]"
            >
              {Array.from({ length: chosen }, (_, i) => i + 1).map((d) => (
                <option key={d} value={d}>Day {d}</option>
              ))}
            </Select>
          )}

          {/* Always pressable, even when nothing looks changed: re-saving the
              same length re-anchors to today, which is a real thing to want
              after a week of closures. `loading` handles the disabling. */}
          <Button loading={busy} onClick={() => void save()}>Save</Button>
        </div>

        <p aria-live="polite" className="mt-3 text-[12.5px] text-text-subtle">
          {saved
            ? chosen >= 2
              ? `Saved. Today is Day ${dayValue} of ${chosen}; the Timetable page will say so.`
              : 'Saved. Back to an ordinary week.'
            : chosen >= 2
              ? 'Saving stamps today as the starting point. If it drifts, the Timetable page can re-set it in one tap.'
              : 'Class slots are set by weekday.'}
        </p>
      </div>
    </Card>
  )
}
