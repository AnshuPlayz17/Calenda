import { describe, expect, it, vi } from 'vitest'
import { readFileSync } from 'node:fs'
import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { Privacy } from '@/routes/Privacy'
import { Terms } from '@/routes/Terms'
import { DATA_CATEGORIES, DORMANT_TABLES, NEEDS_OWNER, PLAIN_ENGLISH_NOTE } from '@/content/legal'

/**
 * The two legal pages, checked for the things that would make them worse than
 * having none.
 *
 * A privacy policy is a promise, and the failure mode is not that it looks bad
 * -- it is that it says something untrue and nothing notices. legalDrift.test.ts
 * holds the inventory against the database. This holds the pages against the
 * inventory, and checks the three things that are about the reader rather than
 * the schema: that every category actually reaches the screen, that the "not
 * legal advice" line is there to be read, and that the two placeholders needing
 * a human are still visibly unfilled.
 */

vi.mock('@/lib/auth', () => ({ useAuth: () => ({ session: null, loading: false }) }))

function renderPage(node: React.ReactNode) {
  return render(<MemoryRouter>{node}</MemoryRouter>)
}

describe('the privacy page', () => {
  it('says it is not legal advice, before anything else', () => {
    renderPage(<Privacy />)
    expect(screen.getByText(PLAIN_ENGLISH_NOTE)).toBeInTheDocument()
  })

  it('renders every category in the inventory', () => {
    renderPage(<Privacy />)
    // The whole point of deriving the page from the list: a category that
    // exists in the data and never reaches the screen is the same defect as one
    // that is missing from the data, and only this catches it.
    for (const c of DATA_CATEGORIES) {
      expect(screen.getByText(c.title), `${c.id} is not on the page`).toBeInTheDocument()
    }
    expect(DATA_CATEGORIES.length).toBeGreaterThan(8)
  })

  it('names the empty tables rather than omitting them', () => {
    renderPage(<Privacy />)
    expect(screen.getByText(DORMANT_TABLES.join(', '))).toBeInTheDocument()
    // The claim the section makes, in the words a reader would search for.
    expect(screen.getByText(/never asks for your phone number/i)).toBeInTheDocument()
    expect(screen.getByText(/stores no Google credentials/i)).toBeInTheDocument()
  })

  it('is honest that there is no delete button yet', () => {
    renderPage(<Privacy />)
    // If a delete control is ever built, this fails -- which is the prompt to
    // rewrite the paragraph instead of leaving it describing the old state.
    expect(screen.getByText(/not yet a button that deletes your whole account/i))
      .toBeInTheDocument()
  })
})

describe('the terms page', () => {
  it('says it is not legal advice', () => {
    renderPage(<Terms />)
    expect(screen.getByText(PLAIN_ENGLISH_NOTE)).toBeInTheDocument()
  })

  it('does not claim reminders are guaranteed', () => {
    renderPage(<Terms />)
    expect(screen.getByText(/They are not a safety net/i)).toBeInTheDocument()
  })

  it('tells people their school is the authority on their own dates', () => {
    renderPage(<Terms />)
    expect(screen.getByText(/Your school is the authority/i)).toBeInTheDocument()
  })
})

describe('the placeholders a person still has to fill', () => {
  it('are visible on the page rather than quietly wrong', () => {
    // A privacy policy with a plausible-looking wrong contact address silently
    // swallows the requests it exists to invite. An obviously blank one does
    // not. This fails once both are filled in, which is the correct moment for
    // somebody to come and delete it.
    const { unmount } = renderPage(<Privacy />)
    expect(screen.getAllByText(new RegExp(NEEDS_OWNER.replace(/[[\]]/g, '\\$&'))).length)
      .toBeGreaterThan(0)
    unmount()

    renderPage(<Terms />)
    expect(screen.getAllByText(new RegExp(NEEDS_OWNER.replace(/[[\]]/g, '\\$&'))).length)
      .toBeGreaterThan(0)
  })
})

describe('the links to these pages', () => {
  it('point at routes the app declares', () => {
    // The /app/teaching lesson: a route path is a string and nothing here was
    // checking the strings. Four files link to these two pages.
    const app = readFileSync('src/app/App.tsx', 'utf8')
    const declared = new Set(
      [...app.matchAll(/<Route\s+path="([^"]+)"/g)]
        .map((m) => m[1] as string)
        .filter((p) => p !== '*')
        .map((p) => (p.startsWith('/') ? p : `/${p}`)),
    )
    expect(declared).toContain('/privacy')
    expect(declared).toContain('/terms')

    const linkers = [
      'src/routes/Landing.tsx',
      'src/routes/SignUp.tsx',
      'src/routes/Settings.tsx',
      'src/features/legal/LegalPage.tsx',
      'src/routes/Privacy.tsx',
      'src/routes/Terms.tsx',
    ]
    let found = 0
    for (const file of linkers) {
      const text = readFileSync(file, 'utf8')
      for (const m of text.matchAll(/to=(?:"(\/(?:privacy|terms))"|\{'(\/(?:privacy|terms))'\})/g)) {
        expect(declared).toContain(m[1] ?? m[2])
        found += 1
      }
    }
    // Both pages reachable from the landing footer, the sign-up form, settings,
    // and each other. A guard that found nothing would pass forever.
    expect(found).toBeGreaterThanOrEqual(6)
  })
})
