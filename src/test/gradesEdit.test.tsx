import { describe, expect, it, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { GradesTab } from '@/features/grades/GradesTab'
import type { Grade } from '@/lib/types'

/**
 * Correcting a mark, which nothing could do.
 *
 * `useUpdateGrade` existed in the data layer and had no caller, so a score
 * typed wrong -- 84 for 48 -- could only be fixed by deleting the row and
 * typing it again. That loses the date and the weight beside it, and if the
 * mark was shared with a linked parent it silently unshares it.
 *
 * The two things worth pinning are the ones a re-typed row gets wrong: a score
 * of zero must survive the trip into the box, and an edit must not touch what
 * it was not asked about.
 */

const update = vi.fn(async (_args: { id: string; input: Record<string, unknown> }) => {})
const create = vi.fn(async (_input: Record<string, unknown>) => {})

let grades: Grade[] = []

vi.mock('@/features/grades/queries', () => ({
  useGrades: () => ({ data: grades, isLoading: false, isError: false, isFetching: false, refetch: () => {} }),
  useCreateGrade: () => ({ mutateAsync: create, isPending: false }),
  useUpdateGrade: () => ({ mutateAsync: update, isPending: false }),
  useDeleteGrade: () => ({ mutateAsync: async () => {}, isPending: false }),
}))
vi.mock('@/features/parents/ShareToggle', () => ({ ShareToggle: () => null }))

function grade(over: Partial<Grade> = {}): Grade {
  return {
    id: 'g1', class_id: 'c1', owner_id: 'u1', assignment_id: null,
    title: 'Unit 3 test', score: 48, out_of: 60, letter: null, weight: 2,
    category: 'Test', term: null, recorded_on: '2026-10-02', notes: null,
    source: 'manual', shared_with_parents: false,
    created_at: '', updated_at: '',
    ...over,
  } as Grade
}

beforeEach(() => {
  update.mockClear()
  create.mockClear()
  grades = [grade()]
})

describe('correcting a mark', () => {
  it('opens the form already holding what is there', async () => {
    render(<GradesTab classId="c1" />)
    await userEvent.click(screen.getByRole('button', { name: /edit unit 3 test/i }))
    expect(screen.getByLabelText('What for')).toHaveValue('Unit 3 test')
    expect(screen.getByLabelText('Score')).toHaveValue(48)
    expect(screen.getByLabelText('Out of')).toHaveValue(60)
    expect(screen.getByLabelText('Weight')).toHaveValue(2)
    expect(screen.getByLabelText('Category')).toHaveValue('Test')
    expect(screen.getByLabelText('Date')).toHaveValue('2026-10-02')
  })

  it('carries a score of zero into the box rather than emptying it', async () => {
    // `|| ''` would blank this, and saving would then file a real zero as
    // "not marked yet" -- which changes the average in the reader's favour and
    // is exactly the kind of quiet wrongness this app is arguing against.
    grades = [grade({ score: 0 })]
    render(<GradesTab classId="c1" />)
    await userEvent.click(screen.getByRole('button', { name: /edit unit 3 test/i }))
    expect(screen.getByLabelText('Score')).toHaveValue(0)
  })

  it('updates rather than creating a second row', async () => {
    render(<GradesTab classId="c1" />)
    await userEvent.click(screen.getByRole('button', { name: /edit unit 3 test/i }))
    await userEvent.clear(screen.getByLabelText('Score'))
    await userEvent.type(screen.getByLabelText('Score'), '52')
    await userEvent.click(screen.getByRole('button', { name: 'Save' }))

    expect(create).not.toHaveBeenCalled()
    expect(update).toHaveBeenCalledTimes(1)
    expect(update.mock.calls[0]![0].id).toBe('g1')
    expect(update.mock.calls[0]![0].input.score).toBe(52)
    // Everything not touched comes back unchanged rather than defaulted.
    expect(update.mock.calls[0]![0].input.weight).toBe(2)
    expect(update.mock.calls[0]![0].input.recordedOn).toBe('2026-10-02')
  })

  it('says nothing about sharing, because it changes nothing about sharing', async () => {
    render(<GradesTab classId="c1" />)
    await userEvent.click(screen.getByRole('button', { name: /edit unit 3 test/i }))
    await userEvent.click(screen.getByRole('button', { name: 'Save' }))
    expect(update.mock.calls[0]![0].input).not.toHaveProperty('sharedWithParents')
  })

  it('goes back to adding once the correction is cancelled', async () => {
    render(<GradesTab classId="c1" />)
    await userEvent.click(screen.getByRole('button', { name: /edit unit 3 test/i }))
    await userEvent.click(screen.getByRole('button', { name: 'Cancel' }))
    // The form is gone and the way in to a new one is back.
    expect(screen.queryByLabelText('What for')).toBeNull()
    expect(screen.getByRole('button', { name: /add a mark/i })).toBeTruthy()
  })

  it('still adds a new mark when nothing is being corrected', async () => {
    render(<GradesTab classId="c1" />)
    await userEvent.click(screen.getByRole('button', { name: /add a mark/i }))
    await userEvent.type(screen.getByLabelText('What for'), 'Quiz 4')
    await userEvent.click(screen.getByRole('button', { name: 'Save' }))
    expect(update).not.toHaveBeenCalled()
    expect(create).toHaveBeenCalledTimes(1)
  })
})
