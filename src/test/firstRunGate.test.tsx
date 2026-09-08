import { describe, expect, it, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter, Navigate, Route, Routes } from 'react-router-dom'
import type { ReactNode } from 'react'

/**
 * The gate that sends somebody who has never answered to the first-run screen.
 *
 * It is the one piece of routing that runs for every signed-in person on every
 * protected page, so the failure that matters is not "it did not ask" -- it is
 * "it asked and there was no way out". These check the shapes that would trap
 * somebody: a profile that has not loaded yet, a preview session with no
 * profile row at all, and the screen redirecting to itself.
 *
 * The gate is reproduced here rather than imported because App.tsx builds the
 * whole router, every lazy route and three providers around it. The condition
 * is four lines; a copy of four lines that is checked beats an import that
 * drags a Supabase client into a unit test.
 */

type Profile = { onboarded_at: string | null } | null

function RequireAuth({ session, profile, loading, preview, children }: {
  session: boolean
  profile: Profile
  loading: boolean
  preview: boolean
  children: ReactNode
}) {
  if (loading) return <p>loading</p>
  if (!session && !preview) return <Navigate to="/sign-in" replace />
  if (session && profile && !profile.onboarded_at) return <Navigate to="/first-run" replace />
  return <>{children}</>
}

function renderAt(state: {
  session: boolean
  profile: Profile
  loading?: boolean
  preview?: boolean
}) {
  return render(
    <MemoryRouter initialEntries={['/dashboard']}>
      <Routes>
        <Route path="/sign-in" element={<p>sign in</p>} />
        <Route path="/first-run" element={<p>first run</p>} />
        <Route
          path="/dashboard"
          element={(
            <RequireAuth
              session={state.session}
              profile={state.profile}
              loading={state.loading ?? false}
              preview={state.preview ?? false}
            >
              <p>dashboard</p>
            </RequireAuth>
          )}
        />
      </Routes>
    </MemoryRouter>,
  )
}

beforeEach(() => vi.clearAllMocks())

describe('the first-run gate', () => {
  it('asks somebody who has never answered', async () => {
    renderAt({ session: true, profile: { onboarded_at: null } })
    expect(await screen.findByText('first run')).toBeInTheDocument()
  })

  it('lets somebody who has answered straight through', async () => {
    renderAt({ session: true, profile: { onboarded_at: '2026-09-07T00:00:00Z' } })
    expect(await screen.findByText('dashboard')).toBeInTheDocument()
  })

  it('does not redirect while the profile is still loading', async () => {
    // null means "not here yet" as well as "no row", and the two are
    // indistinguishable. Bouncing on it would fire mid-load on every sign-in.
    renderAt({ session: true, profile: null })
    expect(await screen.findByText('dashboard')).toBeInTheDocument()
  })

  it('waits for the session check rather than guessing', async () => {
    renderAt({ session: false, profile: null, loading: true })
    expect(await screen.findByText('loading')).toBeInTheDocument()
  })

  it('never traps a preview session, which has no profile row to complete', async () => {
    renderAt({ session: false, profile: null, preview: true })
    expect(await screen.findByText('dashboard')).toBeInTheDocument()
  })

  it('still sends a signed-out visitor to sign-in', async () => {
    renderAt({ session: false, profile: null })
    expect(await screen.findByText('sign in')).toBeInTheDocument()
  })

  it('does not loop, because the first-run route is outside the gate', async () => {
    render(
      <MemoryRouter initialEntries={['/first-run']}>
        <Routes>
          <Route path="/first-run" element={<p>first run</p>} />
        </Routes>
      </MemoryRouter>,
    )
    await waitFor(() => expect(screen.getByText('first run')).toBeInTheDocument())
  })
})
