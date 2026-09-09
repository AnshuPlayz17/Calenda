import { describe, expect, it, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { CycleCard } from '@/features/timetable/CycleCard'

/**
 * The control that makes a rotating timetable reachable at all.
 *
 * `timetable_cycle_length` was read in four places and written in none, so
 * `cycleDayFor`'s twenty-eight tests, `class_meetings.cycle_day` and the whole
 * "Today is Day 3 of 6" strip were dead for every account. What is checked
 * here is the part that is easy to get subtly wrong: a length saved without an
 * anchor is a cycle that starts counting from a date nobody chose, and a
 * length cleared without clearing the anchor is a cycle that silently resumes
 * an old count when it is turned back on months later.
 */

// Typed with its argument, so `mock.calls[0][0]` is a value rather than a
// tuple of length zero -- a no-argument vi.fn() makes every assertion below a
// type error and none of them a test.
const updateProfile = vi.fn(
  async (_patch: Record<string, unknown>) => ({ error: null as string | null }),
)
let profile: Record<string, unknown> | null = { timetable_cycle_length: null }

vi.mock('@/lib/auth', () => ({
  useAuth: () => ({ profile, updateProfile }),
}))

beforeEach(() => {
  updateProfile.mockClear()
  profile = { timetable_cycle_length: null }
})

describe('the timetable cycle card', () => {
  it('is off to begin with, and says what that means', () => {
    render(<CycleCard />)
    expect(screen.getByLabelText('Cycle length')).toHaveValue('0')
    // No anchor question while there is no cycle to anchor.
    expect(screen.queryByLabelText('Today is')).toBeNull()
  })

  it('writes the length AND the anchor together, never the length alone', async () => {
    const user = userEvent.setup()
    render(<CycleCard />)
    await user.selectOptions(screen.getByLabelText('Cycle length'), '6')
    await user.selectOptions(screen.getByLabelText('Today is'), '3')
    await user.click(screen.getByRole('button', { name: 'Save' }))

    expect(updateProfile).toHaveBeenCalledTimes(1)
    const patch = updateProfile.mock.calls[0]![0]
    expect(patch.timetable_cycle_length).toBe(6)
    expect(patch.timetable_cycle_anchor_day).toBe(3)
    // Today's date, so the count starts from a day the person was looking at.
    expect(patch.timetable_cycle_anchor).toMatch(/^\d{4}-\d{2}-\d{2}$/)
  })

  it('clears the anchor when it is turned off, not just the length', async () => {
    profile = { timetable_cycle_length: 6 }
    const user = userEvent.setup()
    render(<CycleCard />)
    await user.selectOptions(screen.getByLabelText('Cycle length'), '0')
    await user.click(screen.getByRole('button', { name: 'Save' }))

    const patch = updateProfile.mock.calls[0]![0]
    expect(patch.timetable_cycle_length).toBeNull()
    expect(patch.timetable_cycle_anchor).toBeNull()
    expect(patch.timetable_cycle_anchor_day).toBeNull()
  })

  it('cannot save a day the cycle does not have', async () => {
    // Pick six, pick Day 6, then shorten to four. Left alone the picker would
    // still be holding 6 and would write it.
    const user = userEvent.setup()
    render(<CycleCard />)
    await user.selectOptions(screen.getByLabelText('Cycle length'), '6')
    await user.selectOptions(screen.getByLabelText('Today is'), '6')
    await user.selectOptions(screen.getByLabelText('Cycle length'), '4')
    await user.click(screen.getByRole('button', { name: 'Save' }))

    const patch = updateProfile.mock.calls[0]![0]
    expect(patch.timetable_cycle_length).toBe(4)
    expect(patch.timetable_cycle_anchor_day).toBe(4)
  })

  it('opens on the length the account already has', () => {
    profile = { timetable_cycle_length: 8 }
    render(<CycleCard />)
    expect(screen.getByLabelText('Cycle length')).toHaveValue('8')
  })
})
