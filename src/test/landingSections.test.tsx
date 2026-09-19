/**
 * The panels, their anchors, and the dead zones between them.
 *
 * The old version of this file held the companion rail against the page: the
 * rail jumped by id, so a renamed chapter left a tick that silently did
 * nothing. The page is three cross-faded panels now and there is no rail, but
 * the same class of failure is still available and still silent, so this
 * checks the three shapes it can take.
 *
 * A panel whose cue never reaches 1 is invisible for the life of the page.
 * Two panels whose cues overlap are two headlines on top of each other. And an
 * anchor that does not sit inside its own panel's visible window scrolls to a
 * frame where that panel is already gone. None of the three throws, none of
 * them looks wrong in a diff, and all three are arithmetic -- which is why
 * they are tested as arithmetic rather than by rendering and squinting.
 */
import { describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { Landing } from '@/routes/Landing'
import { PANELS, panelAt } from '@/features/landing/scrub/panels'
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

/** Sampled finely enough that a 0.01-wide window could not hide between steps. */
const STEPS = 400
const samples = Array.from({ length: STEPS + 1 }, (_, i) => i / STEPS)

describe('the landing panels', () => {
  it('renders an anchor for every panel, exactly once', () => {
    renderPage()
    for (const panel of PANELS) {
      expect(document.querySelectorAll(`#${panel.id}`), panel.id).toHaveLength(1)
    }
  })

  it('shows every panel at full strength somewhere down the page', () => {
    // A cue whose fade-out begins before its fade-in finishes produces a panel
    // that never fully arrives -- readable as a ghost, and never as a claim.
    const peaks = PANELS.map((p) => Math.max(...samples.map((s) => panelAt(p.cue, s).o)))
    for (const [i, peak] of peaks.entries()) {
      expect(peak, `${PANELS[i]?.id} peaks at ${peak}`).toBeGreaterThan(0.99)
    }
  })

  it('never has two panels readable at once', () => {
    // The dead zones are the design: the drawing is alone on screen through
    // the two moments worth watching. Overlapping cues would put two headlines
    // over each other at exactly the point the object is doing something.
    for (const s of samples) {
      const lit = PANELS.filter((p) => panelAt(p.cue, s).o > 0.08)
      expect(lit.length, `${lit.map((p) => p.id).join(' + ')} at p=${s.toFixed(3)}`)
        .toBeLessThanOrEqual(1)
    }
  })

  it('puts each anchor inside its own panel’s window', () => {
    // Scrolling to an anchor has to land on the frame that panel is legible
    // in. An anchor a few percent out is a jump to a blank screen.
    for (const panel of PANELS) {
      const { o } = panelAt(panel.cue, panel.anchor)
      expect(o, `${panel.id} anchor lands at opacity ${o}`).toBeGreaterThan(0.9)
    }
  })

  it('says only what the page is allowed to say', () => {
    renderPage()
    // The disclaimer is load-bearing and lives on every public page.
    expect(screen.getByText(/Not affiliated with, endorsed by, or an official product of/i))
      .toBeInTheDocument()
    for (const panel of PANELS) {
      expect(screen.getByText(panel.title)).toBeInTheDocument()
    }
  })

  it('offers the black-and-white switch by what it will do', () => {
    renderPage()
    // Labelled with the state it moves to, not the state it is in -- a switch
    // labelled with its current state reads as a label to half the people who
    // meet it.
    expect(screen.getByRole('button', { name: /black and white/i })).toBeInTheDocument()
  })
})
