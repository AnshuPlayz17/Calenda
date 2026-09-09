import { useState } from 'react'
import { RotateCcw } from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { Select } from '@/components/ui/Select'
import { useAuth } from '@/lib/auth'
import { todayPlain } from '@/lib/datetime'

/**
 * Which day of the cycle it is, and a one-tap way to say it is wrong.
 *
 * WHY THIS EXISTS AT ALL
 *
 * `cycleDayFor` counts weekdays from an anchor. Real cycles skip every day the
 * school is closed, so one unexpected closure puts every day after it off by
 * one for the rest of the year -- and a timetable that is confidently wrong is
 * worse than no timetable, because you stop checking.
 *
 * The honest answer is not to hide the number, and not to compute it from the
 * imported calendar either -- that sounds better and would be wrong in a new
 * way every time the calendar was incomplete. It is to show what the app
 * believes, and let the one person who actually knows correct it. Correcting
 * re-anchors, so the fix holds for the rest of the year rather than for today.
 */
export function CycleBanner({ todayCycle }: { todayCycle: number | null }) {
  const { profile, updateProfile } = useAuth()
  const [correcting, setCorrecting] = useState(false)
  const [picked, setPicked] = useState('')
  const [busy, setBusy] = useState(false)

  const length = profile?.timetable_cycle_length ?? null
  // Nothing to show for a school that runs an ordinary week, which is most of
  // them. Setting a cycle up lives in Settings, not in a banner on a page
  // somebody came to read.
  if (!length) return null

  async function correct() {
    const day = Number(picked)
    if (!day) return
    setBusy(true)
    await updateProfile({
      timetable_cycle_anchor: todayPlain(),
      timetable_cycle_anchor_day: day,
    })
    setBusy(false)
    setCorrecting(false)
  }

  return (
    <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-border bg-surface px-4 py-3">
      <p className="text-[13.5px] text-text-muted">
        {todayCycle === null ? (
          <>No school day today, so the cycle does not advance.</>
        ) : (
          <>
            Today is <strong className="font-medium text-text">Day {todayCycle}</strong> of{' '}
            {length}.
          </>
        )}
      </p>

      {!correcting ? (
        <button
          onClick={() => { setPicked(String(todayCycle ?? 1)); setCorrecting(true) }}
          className="inline-flex items-center gap-1.5 text-[12.5px] text-text-muted underline-offset-2 hover:text-text hover:underline"
        >
          <RotateCcw className="h-3.5 w-3.5" aria-hidden />
          Not right?
        </button>
      ) : (
        <div className="flex flex-wrap items-end gap-2">
          <Select
            label="Today is actually"
            value={picked}
            onChange={(e) => setPicked(e.target.value)}
            className="w-[140px]"
          >
            {Array.from({ length }, (_, i) => i + 1).map((d) => (
              <option key={d} value={d}>Day {d}</option>
            ))}
          </Select>
          <Button size="sm" loading={busy} onClick={() => void correct()}>Set</Button>
          <Button size="sm" variant="secondary" onClick={() => setCorrecting(false)}>
            Cancel
          </Button>
        </div>
      )}
    </div>
  )
}
