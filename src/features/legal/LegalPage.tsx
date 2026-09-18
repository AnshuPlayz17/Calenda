import { Link } from 'react-router-dom'
import { Brand } from '@/components/Brand'
import { useAuth } from '@/lib/auth'
import { LAST_UPDATED, PLAIN_ENGLISH_NOTE, type Section } from '@/content/legal'

/**
 * The shell both legal pages sit in.
 *
 * Deliberately the plainest screen in the app: no scroll scenes, no accent
 * animation, nothing that moves. Every other public page is arguing for
 * something; these two exist to be read, and a reader arriving here is usually
 * either worried or checking. Motion would be answering a question nobody asked.
 *
 * Measured in one column at a readable width rather than the 1240px the landing
 * page uses -- a legal document set across a laptop's full width is a document
 * nobody finishes, and the line length is the only typographic decision that
 * matters here.
 *
 * Both pages are outside RequireAuth on purpose. A privacy policy you have to
 * sign in to read is not a privacy policy, and the sign-up form links to both
 * from a screen where nobody has an account yet.
 */
export function LegalPage({
  title,
  intro,
  sections,
  children,
  other,
}: {
  title: string
  intro: string
  sections: Section[]
  /** Slotted in after the sections that precede it -- the data inventory. */
  children?: React.ReactNode
  other: { to: string; label: string }
}) {
  // Only decides where the lockup goes. These pages are readable signed out,
  // which is the point of them.
  const { session } = useAuth()

  return (
    <div className="min-h-dvh bg-bg">
      <header className="border-b border-border px-5 py-4 sm:px-8">
        <div className="mx-auto flex max-w-[760px] items-center justify-between gap-4">
          <Brand size="sm" to={session ? '/dashboard' : '/'} />
          <Link
            to={other.to}
            className="text-sm text-text-muted no-underline underline-offset-4 hover:text-text hover:underline"
          >
            {other.label}
          </Link>
        </div>
      </header>

      <main className="mx-auto max-w-[760px] px-5 pb-24 pt-12 sm:px-8">
        <h1 className="font-display text-display font-medium leading-[1.05] tracking-[-0.02em]">
          {title}
        </h1>
        <p className="mt-3 text-sm text-text-subtle">Last updated {LAST_UPDATED}</p>

        {/* Above everything, not in a footnote. Somebody who reads only one
            paragraph on this page should read this one. */}
        <p className="mt-8 rounded-xl border border-border bg-surface-2 p-5 text-[15px] leading-relaxed text-text-muted">
          {PLAIN_ENGLISH_NOTE}
        </p>

        <p className="mt-8 text-lg leading-relaxed text-text-muted">{intro}</p>

        <div className="mt-12 flex flex-col gap-10">
          {sections.map((s) => (
            <section key={s.heading}>
              <h2 className="font-display text-title-lg font-medium tracking-[-0.01em]">
                {s.heading}
              </h2>
              <div className="mt-3 flex flex-col gap-3">
                {s.body.map((p) => (
                  <p key={p.slice(0, 40)} className="text-[15px] leading-relaxed text-text-muted">
                    {p}
                  </p>
                ))}
              </div>
              {s.heading === 'What Calenda stores' && children}
            </section>
          ))}
        </div>

        <p className="mt-16 border-t border-border pt-6 text-xs leading-relaxed text-text-subtle">
          A personal project by Anshu Arunav. Not affiliated with, endorsed by, or an official
          product of any school.
        </p>
      </main>
    </div>
  )
}
