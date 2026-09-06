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

## Notifications (verified live end-to-end this project)
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

## NOT BUILT — must not appear on the page
- File uploads / storage (no storage code exists in src/)
- AI study tools
- SMS delivery
- Apple and Facebook sign-in (Google, GitHub, Discord are configured)
