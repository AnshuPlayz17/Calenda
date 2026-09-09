import { describe, expect, it, vi } from 'vitest'
import { readFileSync } from 'node:fs'
import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { SettingsPage } from '@/routes/Settings'
import { ThemeProvider } from '@/lib/theme'

/**
 * One promise, made on one screen and kept on another.
 *
 * The walkthrough's closing screen says "You can come back to this walkthrough
 * any time from Settings." For its whole life there was nothing in Settings to
 * come back from, so a reader who believed it went looking and found nothing.
 * Copy that promises a thing which is not there is worse than no copy: it
 * spends the credibility of everything else on the page.
 *
 * Both halves are checked, because either one alone drifts. A rendered link
 * with no promise pointing at it is a harmless spare; a promise with no link
 * is the bug that was here.
 */

// Everything else on the page reaches the network, the provider tree or a
// month grid. None of it is what this is about.
vi.mock('@/features/google/GoogleImport', () => ({ GoogleImport: () => null }))
vi.mock('@/features/parents/ParentsSection', () => ({ ParentsSection: () => null }))
vi.mock('@/features/settings/AccountCard', () => ({ AccountCard: () => null }))
vi.mock('@/features/schoolYear/SchoolYearProvider', () => ({
  useSchoolYear: () => ({ current: null, years: [], setCurrent: () => {} }),
}))
// The cycle card is real and rendered; it just needs a profile to read.
vi.mock('@/lib/auth', () => ({
  useAuth: () => ({
    profile: { timetable_cycle_length: null },
    updateProfile: async () => ({ error: null }),
  }),
}))

describe('the walkthrough, from Settings', () => {
  it('offers a way back into it', () => {
    render(
      <ThemeProvider>
        <MemoryRouter>
          <SettingsPage />
        </MemoryRouter>
      </ThemeProvider>,
    )
    const link = screen.getByRole('link', { name: /watch it again/i })
    expect(link.getAttribute('href')).toContain('/welcome')
  })

  it('is still the place the walkthrough sends people', () => {
    // If the closing screen ever stops naming Settings, the link above becomes
    // a spare rather than a fix -- and the test above would happily keep
    // passing while the two screens had quietly stopped agreeing.
    const welcome = readFileSync('src/routes/Welcome.tsx', 'utf8')
    expect(welcome).toMatch(/walkthrough any time from Settings/)
  })
})
