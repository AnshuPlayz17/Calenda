# Verified facts for the landing page
Every line here was checked against the code or data, with the check noted.
Anything not on this list does not go on the page.

## The school calendar (src/data/schoolCalendar.ts — counted, not estimated)
- 49 events, 2026-09-03 → 2027-06-30
- "Late Start" appears **16 times, byte-identical, on 16 different dates**
- "PD Day" appears 6 times; "Holiday Monday", "Parent Teacher Interviews",
  "4-day Long Weekend", "PA Day" twice each
- 9 events span more than one day
- Categories in use: school 22, pa-day 10, holiday 10, academic 3, family 3, exam 1

## Duplicate detection (docs/SPEC.md §8, src/lib/events.ts)
- Identity key is (normalised title, start_date) — never title alone, because
  16 identical "Late Start" titles would collapse into one
- Date equality alone also fails: Winter Break is one break under two entries
  with different dates (Dec 21–31, Jan 1–3)
- Scored on: exact external id, title similarity, date overlap, time overlap,
  location, source. Location is ALWAYS null for PDF events, so it can never be
  a required signal
- High confidence pre-selects "keep existing" but is still shown; medium is
  surfaced with nothing pre-selected; low imports as distinct
- **Nothing is ever silently merged or deleted.** You see Event A beside Event B
  and choose: Keep existing / Add anyway / Merge / Replace / Cancel
- Imports stage in `import_staging` — the whole batch is reviewable before a
  single row reaches `events`
- Only 16 of 42 in-session Wednesdays have a Late Start, so a weekly recurrence
  rule would have fabricated 26 events that do not exist. Stored as discrete events.

## The PDF (docs/discovery/)
- The source PDF has Private-Use-Area glyph corruption (U+E000–U+F8FF)
- The extractor repairs it before parsing and HARD-FAILS if any PUA codepoint
  survives into a parsed date — silent corruption is not an accepted outcome

## Permissions (docs/SPEC.md §4, supabase/tests/rls_test.sql — 6 adversarial tests)
Enforced in RLS, never by hiding UI. Each of these is a test that attempts the
access as the wrong user and requires it to fail:
1. A parent link alone grants nothing
2. An admin has no read path to private content
3. A user cannot approve their own suggestion
4. The role column cannot be self-elevated
5. Private notebooks are unreachable by URL guessing
6. Google refresh tokens are private, even from an admin
- Connecting a parent is NOT consent to share. Each resource carries
  `shared_with_parents`, default false.
- A parent viewing a shared class still cannot see private notebook pages inside it.

## Notifications (WEB PUSH DELIVERY VERIFIED 2026-09-10; email still not)

> **A reminder was delivered to a person on 2026-09-10 at 16:47 UTC.** The
> first one in this project's life. It read *"In 12 days: Curriculum Night"* --
> a real event from a real account, with the lead-in phrasing `leadIn()`
> produces, decrypted and drawn by the app's own service worker on macOS
> Chrome. Dispatcher run `{"sent":1,"failed":0,"skipped":0}`, GitHub Actions
> run 43.
>
> **What that verifies, exactly: web push, one device, one account.** Email has
> still never been delivered to anybody. `BREVO_API_KEY` and `MAIL_FROM` are
> set and the sender is a Brevo-owned subdomain with real SPF/DKIM, but no
> reminder has gone out over that channel, because every queued reminder on
> the account is `web_push` -- migration `20260904000800` made that the default
> precisely because email had no sender at the time. **Do not claim email
> reminders work.**
>
> **Which fix made it work is not established.** Between the last failing
> attempt and this one, both the push subscription and the service worker were
> replaced. The likeliest cause is the old worker's `if (!event.data) return`
> exiting silently, since that is the line that would produce exactly this
> symptom -- but two things changed at once and only one of them can be
> credited, so neither is. A theory that fits is not a cause that is proven,
> and this file has already been wrong twice this week by preferring the
> tidier story.

> **Corrected 2026-09-09.** This section was headed "verified live end-to-end",
> and that was not true. The hourly workflow that pokes the dispatcher began
> with a guard on a repository secret that was never set -- so it ran every
> hour, printed "skipping", and passed. Nothing has ever been delivered to
> anybody on a schedule. The sender was also `onboarding@resend.dev`, which
> reaches only the project owner, so even a working dispatcher would have
> reached nobody else.
>
> **A correction to the correction, same day.** This first read "No Edge
> Function had ever been deployed", which was itself wrong: the deploy that ran
> on merge listed `notify-dispatch` at version 10, so it had been deployed nine
> times already, and three `notification_deliveries` rows dated 5 September are
> it running from a manual invocation. The workflow guard is the whole
> explanation. Both statements are kept because a file of verified claims that
> silently edits its own mistakes is not a file of verified claims.
>
> Everything below about the *schema* is still true and still checkable. What
> was not true was the claim that mail had arrived. **Nothing on the marketing
> pages may claim reminders are delivered until one has been.** See the
> deployment checklist in README/CLAUDE.md; the workflow now fails loudly when
> unconfigured, precisely so this cannot go quiet again.
>
> **The constraint below is now satisfied and the copy may say so.** The two
> landing panels currently describe only the schedule; that was correct while
> nothing had ever arrived and is now merely modest. Changing them is the
> owner's call, not a requirement.
>
> **The two landing panels were reworded on 2026-09-09** to describe the
> schedule rather than the arrival — "Scheduled by you, and never doubled"
> in place of "Warned early, and only once". Everything they now claim is in
> the list below and is true whether or not a reminder has ever been sent, so
> the page does not need editing again once one has.
- Web push, free: needs only a self-generated VAPID key pair
- Per-category toggles, multiple offsets per category, quiet hours with per-day
  selection
- Duplicate reminders are impossible, not unlikely: a unique constraint on
  (profile_id, subject_type, subject_id, channel, offset_minutes)
- Delivery claimed under `for update skip locked` so two workers cannot double-send
- Redundant scheduling: pg_cron AND GitHub Actions, because GitHub disables
  scheduled workflows after 60 days of repo inactivity
- SMS is a real dormant adapter, NOT shipping. Carrier email-to-SMS gateways are
  dead and Twilio has no free tier. Do not claim SMS on the page.

## Report card reading (VERIFIED ON ONE DOCUMENT, 2026-09-10)

> A real report card was uploaded as a screenshot, decoded, and **every mark it
> read was correct**. The first and so far only document this feature has ever
> met.
>
> **What that does and does not establish.** It establishes that the pipeline
> works end to end -- upload, ownership check, storage download, vision model,
> JSON parse, per-line review -- and that on one real document the model read
> the marks accurately. It does not establish accuracy in general, and one
> document is a sample of one.
>
> **The confidence scores are untested.** Every line was correct, so nothing
> was wrong for a low score to have caught. The review screen sorts
> least-confident first on the assumption that a low score means "look harder
> at this one", and that assumption has not been checked against a line the
> model actually got wrong. Until it has, treat the sorting as a convenience
> rather than as a signal.
>
> This is why nothing a model reads is written to a mark without being accepted
> individually, with a class chosen. That design was not caution about a
> hypothetical -- it is the only reason a wrong line is a nuisance rather than a
> corrupted gradebook.
>
> Two things had to be fixed before it worked at all, both on 2026-09-10:
> `meta-llama/llama-4-scout-17b-16e-instruct` was no longer on the account, and
> `max_tokens: 2000` was refused by Groq's free tier, which enforces its
> per-minute output allowance against what a request *declares* it might
> produce rather than against what comes back.

## Classes (docs/SPEC.md §9)
- course_code (e.g. ICS3U) matches Google Calendar event titles by pattern with a
  confidence score; low-confidence matches are proposed, never applied
- An assignment with a due date generates a linked calendar event — edit either
  and both update; never entered twice
- Notebook pages are a tree, TipTap JSON, with content_text extracted for search

## Google Calendar (docs/SPEC.md §7)
- Import only, read-only. Nothing Calenda does changes anything in Google.

## Search
- Postgres full-text, tsvector + GIN over events, notebook pages, assignments,
  tasks, file names; websearch_to_tsquery so user input cannot throw

## Timezones (schema + supabase/migrations/*_notification_scheduling.sql)
- `profiles.timezone`, per user, default America/Toronto
- All-day events stored date-only and timezone-free — a date does not shift for
  a reader in another zone. Formatted without going through `Date` (src/lib/events.ts)
- Reminders are scheduled at 09:00 **in the user's zone**:
  `(e.start_date + time '09:00') at time zone pr.timezone`
- Quiet hours are evaluated `at time zone tz`, per day of the week
- The landing page's world scene says exactly this and nothing more. The clock
  readings on it come from `Intl.DateTimeFormat` in the reader's browser.

## The schools section (src/data/schools.ts)
- Fifteen GTA independent schools are named. Every `site` URL was verified in
  September 2026; `acronym` is present only where the school uses one itself.
- **No school has agreed to anything.** Not a partner, sponsor, customer or
  endorser of any of them. The page may say Calenda *works with* their published
  calendars — a compatibility statement — and must not say partnered, trusted by,
  official, or our schools.
- One school's calendar has ever been imported. The section deliberately does not
  distinguish them, so no card may claim a live import either.
- No school's crest is shown. Each tile is the school's initials, set in the
  page's own typeface. A crest is that school's trademark; hotlinking one was
  tried and removed.

## NOT BUILT — must not appear on the page
- **A user base.** There is one user and a handful of testers. No map, counter
  or testimonial may imply otherwise. The world scene is a map of where Calenda
  works, not of who uses it, and its caption says so.
- File uploads / storage (no storage code exists in src/)
- AI study tools
- SMS delivery
- Apple and Facebook sign-in (Google, GitHub, Discord are configured)

## Security and privacy (checked 2026-09-17, each with the check)

These are the claims the `/privacy` and `/terms` pages make. They are here for
the same reason every other line in this file is: a claim that is not downstream
of the fact drifts away from it silently.

- **No cookies.** `grep document.cookie` across `src/` and across every built
  chunk in `dist/` finds nothing, bracketed access included. Guarded by
  `legalDrift.test.ts`, mutation-tested by adding one and watching it fail.
  This is why there is no cookie banner: consent UI for something that is not
  happening is worse than none.
- **No analytics, no error-reporting SDK, no third-party script or stylesheet.**
  `index.html` contains no remote `src`/`href` at all; the fonts are bundled.
  Guarded in the same file, and enforced at runtime by `script-src 'self'` in
  the CSP, which `cspcheck.mjs` verifies blocks four injection vectors.
- **Passwords are never seen or stored by this app.** Sign-in is Supabase Auth,
  which holds a one-way hash. There is no password column anywhere in
  `supabase/migrations/`.
- **The privacy page's inventory matches the database.** Every table in
  `supabase/migrations/` appears in exactly one category, and every table named
  exists. `legalDrift.test.ts`, both directions, mutation-tested four ways.
- **Four tables exist and have never had a row written to them:**
  `google_accounts`, `google_calendars`, `google_event_map`, `phone_numbers`.
  Nothing under `src/` or `supabase/functions/` names any of them outside a
  comment. Held by a test, so a first write turns the suite red.

### Correction to the RLS list above

Item 6 in the adversarial list reads "Google refresh tokens are private, even
from an admin". **That policy is real and the test passes; the table it protects
is empty and always has been.** `useGoogleToken.ts` reads the access token
Supabase returns with the session and uses it in the page — no refresh token is
ever requested, and nothing Google-related is written to the database. The line
is true as a statement about the policy and reads as a statement about stored
credentials, which is the kind of gap this file exists to close. Nothing on the
marketing pages may say Calenda holds a Google credential, because it does not.

### Not verified, and not to be claimed

- **Email reminders have still never been delivered to anybody.** Unchanged
  since 2026-09-10.
- **The rate limits have not run against the hosted project.** They pass against
  a local Postgres, all twelve assertions, and `20260917000200` is unapplied
  until the owner merges.
- **Neither legal document has been reviewed by a lawyer**, and both say so at
  the top. Two placeholders in them still need a person: a contact address and
  the governing jurisdiction.
