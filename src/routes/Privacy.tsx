import { LegalPage } from '@/features/legal/LegalPage'
import { DATA_CATEGORIES, DORMANT_TABLES, PRIVACY } from '@/content/legal'

/**
 * The inventory is rendered from DATA_CATEGORIES rather than typed out here,
 * for the reason the whole module exists: a list in prose drifts from the
 * database and nothing fails. See src/content/legal.ts and legalDrift.test.ts.
 */
export function Privacy() {
  return (
    <LegalPage
      title="Privacy"
      intro="What Calenda stores about you, why it stores it, who else can see it, and how to get it back or get rid of it."
      sections={PRIVACY}
      other={{ to: '/terms', label: 'Terms' }}
    >
      <dl className="mt-6 flex flex-col divide-y divide-border border-y border-border">
        {DATA_CATEGORIES.map((c) => (
          <div key={c.id} className="py-5">
            <dt className="text-[15px] font-medium text-text">{c.title}</dt>
            <dd className="mt-2 text-[15px] leading-relaxed text-text-muted">{c.body}</dd>
          </div>
        ))}
      </dl>

      {/* Listed rather than left out. Two of these four tables have columns a
          reader would want to know about -- a refresh token and a verification
          hash -- and "it is empty" is a fact they can be told. Saying nothing
          would be the more comfortable choice and the less honest one. */}
      <div className="mt-8 rounded-xl border border-border bg-surface-2 p-5">
        <p className="text-[15px] font-medium text-text">Four things Calenda does not collect</p>
        <p className="mt-2 text-[15px] leading-relaxed text-text-muted">
          The database has empty tables left over from features that were designed and never
          switched on: three for syncing with Google Calendar, and one for phone numbers. Nothing
          in the app has ever written a row to any of them. Calenda never asks for your phone
          number, and text-message reminders do not exist. Importing from Google Calendar reads
          your calendars while the page is open and stores no Google credentials of any kind.
        </p>
        <p className="mt-2 text-xs text-text-subtle">
          {DORMANT_TABLES.join(', ')}
        </p>
      </div>
    </LegalPage>
  )
}
