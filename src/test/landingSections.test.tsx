/**
 * The companion rail and the page have to be the same list.
 *
 * The rail jumps by id: it looks up `document.getElementById(section.id)` and
 * scrolls there. Rename a section in the route, or add a scene and forget to
 * wrap it, and the rail keeps rendering a tick that silently does nothing --
 * a navigation control that fails by doing no harm is the kind that survives
 * review. This asserts the ids resolve against the page as actually rendered.
 */
import { describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { Landing } from '@/routes/Landing'
import { LANDING_SECTIONS } from '@/features/landing/sections'
import { ThemeProvider } from '@/lib/theme'

vi.mock('@/lib/auth', () => ({ useAuth: () => ({ session: null, loading: false }) }))
vi.mock('@/lib/preview', () => ({ usePreview: () => ({ active: false }) }))

function renderPage() {
  return render(
    <ThemeProvider>
      <MemoryRouter initialEntries={['/about']}>
        <Routes>
          <Route path="/about" element={<Landing redirectSignedIn={false} />} />
        </Routes>
      </MemoryRouter>
    </ThemeProvider>,
  )
}

describe('the landing page chapters', () => {
  it('renders an element for every id the companion rail jumps to', () => {
    renderPage()
    const missing = LANDING_SECTIONS
      .filter((s) => document.getElementById(s.id) === null)
      .map((s) => s.id)
    expect(missing).toEqual([])
  })

  it('uses each id exactly once, so a jump is unambiguous', () => {
    renderPage()
    for (const s of LANDING_SECTIONS) {
      expect(document.querySelectorAll(`#${s.id}`)).toHaveLength(1)
    }
  })

  it('offers a way to reach every chapter, and a step in both directions', () => {
    renderPage()
    for (const s of LANDING_SECTIONS) {
      expect(screen.getAllByRole('button', { name: s.label }).length).toBeGreaterThan(0)
    }
    expect(screen.getAllByRole('button', { name: /previous section/i }).length).toBeGreaterThan(0)
    expect(screen.getAllByRole('button', { name: /next section/i }).length).toBeGreaterThan(0)
  })
})
