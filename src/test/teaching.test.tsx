import { describe, expect, it, vi } from 'vitest'
import { readFileSync } from 'node:fs'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { JoinedClassesCard } from '@/features/teaching/JoinedClassesCard'
import { RolePicker } from '@/features/auth/aboutYou'

/**
 * The teacher side, tested for the two things that are not visible by looking.
 *
 * A teaching group is the first place in this app where an adult gains standing
 * access to a student's work, so what is checked here is the part a screenshot
 * cannot show: that sharing is off, that it stays off until the student has
 * said which class it applies to, and that the screen does not offer a control
 * which would do nothing.
 *
 * The database is the real boundary and has its own thirty-nine assertions in
 * supabase/tests/teacher_group_test.sql. These are about the app not lying
 * about it.
 */

vi.mock('@/features/schoolYear/SchoolYearProvider', () => ({
  useSchoolYear: () => ({ current: { id: 'preview-year-2026-27' }, years: [], setCurrent: () => {} }),
}))

// The factory is hoisted above the imports, so the preview source is required
// inside it rather than closed over -- a top-level binding is not initialised
// yet when the factory runs.
vi.mock('@/data', async () => ({
  dataSource: (await import('@/data/previewSource')).previewSource,
}))

function renderCard() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <QueryClientProvider client={qc}>
      <MemoryRouter>
        <JoinedClassesCard />
      </MemoryRouter>
    </QueryClientProvider>,
  )
}

describe('joining a teacher’s class', () => {
  it('cannot share marks until a class is linked', async () => {
    renderCard()
    const share = await screen.findByRole('checkbox', { name: /see your marks/i })
    // Not merely unchecked. The policy requires a linked class as well as the
    // flag, so an enabled switch here would be a control that visibly does
    // nothing -- worse than one that is not offered yet.
    expect(share).toBeDisabled()
    expect(share).not.toBeChecked()
    expect(screen.getByText(/Link a class first/i)).toBeInTheDocument()
  })

  it('says what joining does and does not share', async () => {
    renderCard()
    // The one sentence a student reads before typing a code somebody gave them.
    expect(
      await screen.findByText(/shares nothing of yours/i),
    ).toBeInTheDocument()
  })

  it('refuses a code that is not eight characters, without saying why it failed', async () => {
    const user = userEvent.setup()
    renderCard()
    const field = await screen.findByLabelText(/join code/i)
    await user.type(field, 'ABC')
    // Disabled rather than submitted and refused: eight is a length, not a
    // secret, and a round trip to be told so is a round trip that also tells
    // anybody watching that the address exists.
    expect(screen.getByRole('button', { name: 'Join' })).toBeDisabled()
  })

  it('passes the database’s own sentence through on a bad code', async () => {
    const user = userEvent.setup()
    renderCard()
    await user.type(await screen.findByLabelText(/join code/i), 'ABCDEFG')
    await user.type(await screen.findByLabelText(/join code/i), 'H')
    await user.click(screen.getByRole('button', { name: 'Join' }))
    // The preview source raises the same sentence the SQL function does. Every
    // failure returns it, so a wrong code cannot be told from a closed class.
    await waitFor(() => {
      expect(screen.getByRole('status')).toBeInTheDocument()
    })
  })
})

describe('the role question', () => {
  it('offers three roles and never admin', () => {
    render(<RolePicker value="student" onChange={() => {}} />)
    expect(screen.getByRole('radio', { name: 'Student' })).toBeInTheDocument()
    expect(screen.getByRole('radio', { name: 'Parent' })).toBeInTheDocument()
    expect(screen.getByRole('radio', { name: 'Teacher' })).toBeInTheDocument()
    // Admin is granted in SQL by somebody who already has the database.
    // set_my_role() refuses it by name; this is the other end of the same rule.
    expect(screen.queryByRole('radio', { name: /admin/i })).toBeNull()
  })
})

describe('what a teacher is never asked', () => {
  it('has no school field on the teacher step', () => {
    // `profiles.school` is free text nothing reads, which is harmless beside a
    // student's own record and quite different beside somebody who teaches:
    // "Teacher at <school>" is an institutional claim, and the rule this
    // project keeps is that Calenda is never any school's product.
    const src = readFileSync('src/features/auth/aboutYou.tsx', 'utf8')
    const start = src.indexOf('export function TeacherFields')
    expect(start).toBeGreaterThan(-1)
    const teacherStep = src.slice(start)
    expect(teacherStep).not.toMatch(/SchoolPicker|schoolValue/)
  })

  it('says a class is not connected to any school, on the screens that make one', () => {
    // Comments are stripped first. The reasoning above lives in a doc comment
    // that names the very thing being searched for, which is how the first
    // version of the real-calendar guard failed on its own explanation.
    const strip = (t: string) => t.replace(/\/\*[\s\S]*?\*\/|(^|[^:])\/\/.*$/gm, '$1')
    for (const file of ['src/features/auth/aboutYou.tsx', 'src/routes/Teaching.tsx']) {
      const text = strip(readFileSync(file, 'utf8'))
      expect(text, file).toMatch(/not connected to any school/i)
    }
  })
})

describe('the teaching links go somewhere', () => {
  it('only points at routes the app declares', () => {
    // Every link on these screens said /app/teaching, and the app has no /app.
    // Typecheck, lint and 325 tests all passed on it: a route path is a string,
    // and nothing in this project was checking the strings. It was caught by a
    // browser probe, which is a slow way to find a typo.
    const app = readFileSync('src/app/App.tsx', 'utf8')
    const declared = new Set(
      [...app.matchAll(/<Route\s+path="([^"]+)"/g)]
        .map((m) => m[1] as string)
        .filter((p) => p !== '*')
        // Nested under a pathless parent, so a declared "teaching/:groupId" is
        // reached at "/teaching/:groupId".
        .map((p) => (p.startsWith('/') ? p : `/${p}`)),
    )

    const links = new Set<string>()
    for (const file of ['src/routes/Teaching.tsx', 'src/routes/TeachingGroup.tsx']) {
      const text = readFileSync(file, 'utf8')
      for (const m of text.matchAll(/to=(?:"([^"]+)"|\{`([^`]+)`\})/g)) {
        links.add((m[1] ?? m[2] ?? '').replace(/\$\{[^}]+\}/g, ':param'))
      }
    }
    // A guard that found nothing would pass forever.
    expect(links.size).toBeGreaterThan(0)

    for (const link of links) {
      const matched = [...declared].some((route) => {
        const pattern = route.replace(/:[^/]+/g, '[^/]+')
        return new RegExp(`^${pattern}$`).test(link.replace(/:param/g, 'x'))
      })
      expect(matched, `${link} is not a declared route`).toBe(true)
    }
  })
})
