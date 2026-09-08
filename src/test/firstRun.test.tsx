import { describe, expect, it, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { FirstRun } from '@/routes/FirstRun'
import { ThemeProvider } from '@/lib/theme'

/**
 * The screen an OAuth user sees once, and never again.
 *
 * Driven rather than screenshotted, because the thing worth checking is not
 * how it looks: it is that a parent is never asked their grade, that the name
 * from the provider arrives already in the box, and that finishing records
 * every answer. None of that shows in a picture, and a real session cannot be
 * had in this container anyway.
 */

const completeFirstRun = vi.fn(async () => ({ warning: null as string | null }))
let profile: Record<string, unknown> | null = null

vi.mock('@/lib/auth', () => ({
  useAuth: () => ({
    session: { user: { id: 'u1' } },
    profile,
    loading: false,
    completeFirstRun,
  }),
}))

// The panel beside the form runs a six-second timer and draws a month grid.
// Neither is what these tests are about.
vi.mock('@/features/auth/AuthReel', () => ({ AuthReel: () => null }))

function renderFirstRun() {
  // AuthLayout carries the theme toggle, which needs the provider. Same shape
  // the landing-page tests use.
  return render(
    <ThemeProvider>
      <MemoryRouter initialEntries={['/first-run']}>
        <Routes>
          <Route path="/first-run" element={<FirstRun />} />
          <Route path="/welcome" element={<p>welcome</p>} />
          <Route path="/dashboard" element={<p>dashboard</p>} />
        </Routes>
      </MemoryRouter>
    </ThemeProvider>,
  )
}

beforeEach(() => {
  completeFirstRun.mockClear()
  profile = { full_name: 'Ada Lovelace', role: 'student', onboarded_at: null }
})

describe('the first-run screen', () => {
  it('arrives with the name the provider gave, in one box', async () => {
    renderFirstRun()
    expect(await screen.findByLabelText('Your name')).toHaveValue('Ada Lovelace')
  })

  it('sends somebody who has already answered to their dashboard', async () => {
    profile = { full_name: 'Ada', role: 'student', onboarded_at: '2026-09-07T00:00:00Z' }
    renderFirstRun()
    expect(await screen.findByText('dashboard')).toBeInTheDocument()
  })

  it('asks a student for a school and a grade', async () => {
    const user = userEvent.setup()
    renderFirstRun()
    await user.click(await screen.findByRole('button', { name: 'Continue' }))

    expect(screen.getByLabelText('Your school')).toBeInTheDocument()
    expect(screen.getByLabelText('Grade')).toBeInTheDocument()
    expect(screen.queryByLabelText("Your student's code")).not.toBeInTheDocument()
  })

  it('asks a parent for a relation and a code, and never for a grade', async () => {
    const user = userEvent.setup()
    renderFirstRun()
    await user.click(await screen.findByText("I'm a parent"))
    await user.click(screen.getByRole('button', { name: 'Continue' }))

    expect(screen.getByLabelText("Your student's code")).toBeInTheDocument()
    expect(screen.getByText('You are their')).toBeInTheDocument()
    // The bug this guards: a parent filed in year eleven because the field was
    // rendered, or its value carried, for the role it does not belong to.
    expect(screen.queryByLabelText('Grade')).not.toBeInTheDocument()
    expect(screen.queryByLabelText('Your school')).not.toBeInTheDocument()
  })

  it('records a student\'s answers and nothing belonging to a parent', async () => {
    const user = userEvent.setup()
    renderFirstRun()
    await user.click(await screen.findByRole('button', { name: 'Continue' }))
    await user.type(screen.getByLabelText('Your school'), 'Somewhere High')
    await user.type(screen.getByLabelText('Grade'), '11')
    await user.type(screen.getByLabelText('How did you hear about Calenda?'), 'a friend')
    await user.click(screen.getByRole('button', { name: /Finish setting up/ }))

    expect(completeFirstRun).toHaveBeenCalledWith({
      fullName: 'Ada Lovelace',
      role: 'student',
      school: 'Somewhere High',
      grade: '11',
      heardFrom: 'a friend',
      inviteCode: undefined,
      relation: undefined,
    })
  })

  it("records a parent's answers and nothing belonging to a student", async () => {
    const user = userEvent.setup()
    renderFirstRun()
    await user.click(await screen.findByText("I'm a parent"))
    await user.click(screen.getByRole('button', { name: 'Continue' }))
    await user.click(screen.getByText('guardian'))
    await user.type(screen.getByLabelText("Your student's code"), 'abcd2345')
    await user.click(screen.getByRole('button', { name: /Finish setting up/ }))

    expect(completeFirstRun).toHaveBeenCalledWith({
      fullName: 'Ada Lovelace',
      role: 'parent',
      // Uppercased as it is typed, because the function upper()s it anyway.
      inviteCode: 'ABCD2345',
      relation: 'guardian',
      heardFrom: '',
      school: undefined,
      grade: undefined,
    })
  })

  it('goes on to the walkthrough once it is done', async () => {
    const user = userEvent.setup()
    renderFirstRun()
    await user.click(await screen.findByRole('button', { name: 'Continue' }))
    await user.click(screen.getByRole('button', { name: /Finish setting up/ }))
    expect(await screen.findByText('welcome')).toBeInTheDocument()
  })

  it('carries an invite code that did not take rather than swallowing it', async () => {
    completeFirstRun.mockResolvedValueOnce({ warning: 'That code is not valid.' })
    const user = userEvent.setup()
    renderFirstRun()
    await user.click(await screen.findByText("I'm a parent"))
    await user.click(screen.getByRole('button', { name: 'Continue' }))
    await user.click(screen.getByRole('button', { name: /Finish setting up/ }))

    // The account exists by now, so it must not stop here -- but the message
    // travels with them.
    expect(await screen.findByText('welcome')).toBeInTheDocument()
  })
})
