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

  /**
   * This replaces an assertion that the page admitted having no delete button.
   * That one existed to fail the day the control was built, and it did its job
   * on 2026-09-22: the control exists, the paragraph was rewritten, and the
   * test was rewritten with it rather than deleted.
   *
   * What it checks now is the harder half. A deletion that quietly leaves rows
   * behind is the thing a privacy policy cannot afford to be vague about, and
   * two rows do survive -- `event_reviews.reviewer_id` and
   * `import_batches.admin_id` are set to null rather than cascaded, so the
   * record of an approval or an import outlives the person who made it. If
   * that ever stops being said on this page, the page is claiming a cleaner
   * erasure than the schema performs.
   */
  it('says the account can be deleted, and what survives it', () => {
    renderPage(<Privacy />)
    expect(screen.getByText(/Settings has a button that deletes your whole account/i))
      .toBeInTheDocument()
    expect(screen.getByText(/set to nobody/i)).toBeInTheDocument()
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
