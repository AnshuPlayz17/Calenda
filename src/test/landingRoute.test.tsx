/**
 * The tour has to stay reachable from inside the app.
 *
 * `/` deliberately bounces a signed-in visitor to their dashboard -- a pitch
 * is no use to someone who already signed up. That redirect also made the page
 * unreachable on purpose, which is why the sidebar links to `/about` instead:
 * same page, no bounce. If the redirect ever grows to cover both paths, the
 * "About Calenda" link becomes a link to the dashboard and nobody notices.
 */
import { describe, expect, it, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { Landing } from '@/routes/Landing'
import { ThemeProvider } from '@/lib/theme'

const auth = vi.hoisted(() => ({ session: null as unknown, loading: false }))

vi.mock('@/lib/auth', () => ({ useAuth: () => auth }))
vi.mock('@/lib/preview', () => ({ usePreview: () => ({ active: false }) }))

function renderAt(path: string) {
  return render(
    <ThemeProvider>
      <MemoryRouter initialEntries={[path]}>
        <Routes>
          <Route path="/" element={<Landing />} />
          <Route path="/about" element={<Landing redirectSignedIn={false} />} />
          <Route path="/dashboard" element={<p>dashboard</p>} />
        </Routes>
      </MemoryRouter>
    </ThemeProvider>,
  )
}

const heading = () => screen.queryByRole('heading', { name: /Everything you need/i })

describe('the landing page as a destination', () => {
  beforeEach(() => {
    auth.session = null
    auth.loading = false
  })

  it('shows the pitch at / when nobody is signed in', () => {
    renderAt('/')
    expect(heading()).toBeInTheDocument()
  })

  it('still sends a signed-in visitor from / to their dashboard', () => {
    auth.session = { user: { id: 'u1' } }
    renderAt('/')
    expect(screen.getByText('dashboard')).toBeInTheDocument()
    expect(heading()).not.toBeInTheDocument()
  })

  it('shows the page at /about even when signed in', () => {
    auth.session = { user: { id: 'u1' } }
    renderAt('/about')
    expect(heading()).toBeInTheDocument()
    expect(screen.queryByText('dashboard')).not.toBeInTheDocument()
  })

  it('offers a signed-in reader the way back, not a sign-up form', () => {
    auth.session = { user: { id: 'u1' } }
    renderAt('/about')
    expect(screen.getAllByRole('link', { name: /back to dashboard/i }).length).toBeGreaterThan(0)
    expect(screen.queryByRole('link', { name: /create an account/i })).not.toBeInTheDocument()
    expect(screen.queryByRole('link', { name: /^sign in$/i })).not.toBeInTheDocument()
  })

  it('still asks a signed-out reader to sign up', () => {
    renderAt('/about')
    expect(screen.getAllByRole('link', { name: /create an account/i }).length).toBeGreaterThan(0)
    expect(screen.queryByRole('link', { name: /back to dashboard/i })).not.toBeInTheDocument()
  })
})
