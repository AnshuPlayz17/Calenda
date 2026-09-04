# Calenda — Technical & Product Specification

> Status: Phase 0 output, approved decisions folded in. This is the document of
> record; implementation follows it. Discovery findings on the school-events PDF
> live in `docs/discovery/FINDINGS.md`.

Calenda is a personal school command centre: one place that answers *"what do I
need to know and do for school?"* by combining school-community events, a
personal calendar, Google Calendar, class workspaces, notebooks, assignments and
personalised reminders.

**Not** an official University of Toronto Schools product. Every build carries an
unofficial/personal-project marker.

---

## 1. Confirmed decisions

| Decision | Choice | Recorded |
|---|---|---|
| Authentication | Many providers, unrestricted — Google, Microsoft, GitHub, Discord, Facebook, email+password, magic link | §3 |
| Google Calendar | **Full two-way sync** | §7 |
| Notifications | Maximum free coverage: Email + Web Push; SMS adapter ready but dormant | §8 |
| Brand colour | U of T Blue `#1E3765` (PMS 655) as UTS-affiliated primary | §9 |

### 1.1 Apple Sign In — flagged cost

Apple Sign In **cannot be done for free.** Creating the Service ID and signing
key requires an **Apple Developer Program membership at $99 USD/year**. Every
other provider above is free.

Apple is therefore built as a **configured-but-disabled provider**. The button,
the callback route and the account-linking logic all ship; enabling it is a
config flag plus credentials. No rework needed if the membership is ever bought.
Nothing in the UI advertises Apple sign-in while it is disabled.

---

## 2. Architecture

```
Browser (React SPA, GitHub Pages)
  │  anon key + user JWT
  ▼
Supabase
  ├── Postgres + Row-Level Security   ← authoritative permission boundary
  ├── Auth (OAuth providers, holds all client secrets)
  ├── Storage (class files)
  └── Edge Functions (Deno)
        ├── google-sync        two-way calendar reconciliation
        ├── notify-dispatch    reminder fan-out
        └── ai-study           flashcards / quizzes / summaries
  ▲
  │ scheduled invoke
GitHub Actions cron  +  pg_cron (redundant trigger)
```

**Why Supabase over Firebase.** The permission requirement — *a user must not
reach another user's notebook by changing a URL* — is enforced by Postgres RLS,
inside the database, so it holds regardless of which client calls it. Firebase's
rules are a separate DSL with no joins and no full-text search, which would make
parent-sharing joins and global search (§11) significantly harder.

**Why GitHub Pages is viable but constraining.** Pages serves static files only.
All server-side concerns live in Edge Functions instead. Consequences that must
be respected: a `404.html` SPA fallback for deep links, `base` set to the repo
path in the Vite config, and the repo must be public for Pages on a free plan.
No secret may ever enter the bundle — only the Supabase URL and anon key, which
are designed to be public and are useless without a valid JWT plus RLS approval.

### 2.1 Frontend stack

| Concern | Choice | Reason |
|---|---|---|
| Framework | React + TypeScript + Vite | Static output; fast builds |
| Styling | Tailwind + CSS custom properties | Tokens drive both themes from one source |
| Animation | Motion (Framer Motion) | Layout animations, shared-element transitions, `useReducedMotion` |
| Server state | TanStack Query | Cache, optimistic updates, background refetch |
| Editor | TipTap (ProseMirror) | JSON output → queryable in Postgres, not opaque HTML |
| Calendar | Custom, built on `date-fns` + `Temporal` polyfill | Off-the-shelf calendars fight custom design; a month grid is not the hard part |
| Forms | React Hook Form + Zod | One Zod schema validates client *and* Edge Function |

---

## 3. Authentication

Enabled and free: **Google, Microsoft, GitHub, Discord, Facebook, email+password,
magic link.** Disabled pending cost: **Apple.**

Google carries the additional Calendar scopes
(`calendar.readonly`, `calendar.events`) requested **incrementally** — at the
moment the user connects their calendar, never at sign-up. Asking for calendar
access on the login screen is the single fastest way to lose a user.

Account linking is by verified email, so signing in with Microsoft after
originally using Google reaches the same account rather than silently creating a
duplicate.

`profiles.role` is `student | parent | admin`, defaulting to `student`. The
first admin is promoted by a one-time SQL statement, never by application code —
there is no code path that can grant admin.

---

## 4. Permission model

Three roles, enforced in RLS, never by hiding UI.

Access to any resource is the union of:

1. **Ownership** — `owner_id = auth_profile_id()`
2. **Approved community content** — `visibility='community' AND status='approved'`
3. **Parent link** — an *accepted* row in `parent_links`, **and** the resource
   is explicitly marked shared. A parent link alone grants nothing.
4. **Explicit share** — a row in `shares` naming that person
5. **Admin** — `is_admin()`, for community content only

Point 3 is the important one. Connecting a parent is not consent to share. Each
resource carries `shared_with_parents` (default `false`), set by the *"Would you
like to share this with your parents?"* prompt. A parent viewing a shared class
still cannot see private notebook pages inside it unless those are shared too.

Admin power is scoped to **community content**. An admin has no read path to any
user's private events, notebooks, files or assignments — this is a property of
the policies, not a promise.

---

## 5. School years

`school_years` is a first-class table (`2026–27`, `starts_on`, `ends_on`,
`is_current`). Events, classes and assignments carry `school_year_id`.

Rollover **copies forward and archives; it never deletes.** Classes gain
`is_archived`, notebooks and assignments stay readable in place, and a new year
can optionally be seeded from the previous year's class structure (names, codes,
page templates — not content).

Because a school year spans two calendar years, **the year can never be inferred
from a month alone** — a lesson learned directly from the PDF, where the month
header is the only year signal.

---

## 6. Events

### 6.1 The all-day storage decision

48 of 49 PDF entries are all-day. Storing an all-day event as a timestamp is a
classic and painful bug: a `2026-10-12T00:00Z` "Thanksgiving" renders as
**October 11** for anyone west of UTC.

```
is_all_day  boolean not null
start_date  date not null      -- always populated, both kinds
end_date    date not null      -- always populated, inclusive
start_at    timestamptz        -- null when all-day
end_at      timestamptz        -- null when all-day
check ( is_all_day = (start_at is null) )
```

All-day events are **date-only, timezone-free**. Timed events carry real
instants. `start_date`/`end_date` are always populated so one index serves every
calendar range query regardless of kind.

### 6.2 Visibility and status

`visibility`: `private | community` · `status`: `draft | pending | approved | rejected`

A user suggestion is simply `visibility='community', status='pending'`. Approval
flips `status` to `approved` — the same row throughout, so a suggestion's
history, author and audit trail survive approval. No separate suggestions table.

Private events skip approval entirely.

### 6.3 Categories

Seeded: Academic, School, PA Day, Holiday, Exam, Assignment, Sports, Clubs,
Trips, Performance, Parent/Family, Personal, Other. A table, not an enum, so new
categories need no migration.

---

## 7. Google Calendar — full two-way sync

The highest-risk component in the project. The failure mode is an **echo loop**:
Calenda writes to Google, reads it back, treats it as new, writes it again.

Four mechanisms prevent this, together:

1. **Identity mapping.** `google_event_map` uniquely ties
   `(google_calendar, google_event_id) ↔ event_id`. An incoming event with a
   mapping is an update, never a create.
2. **Origin stamping.** Events Calenda exports carry
   `extendedProperties.private.calenda_event_id`. Reading our own write back is
   recognised instantly, even if the map row were lost.
3. **Incremental sync tokens.** Google's `syncToken` per calendar returns only
   changes since last sync — no full re-scan, no re-import of unchanged events.
4. **Change detection.** `etag` plus `updated` on both sides. Unchanged →
   skipped. Changed on one side → propagated. **Changed on both sides → conflict
   surfaced to the user, never auto-resolved.**

Per-calendar `sync_direction` (`import_only | export_only | two_way`) means a
read-only subscribed calendar is never written to.

Google Calendar events **keep their origin's privacy** — imported events are
`visibility='private'` to the importing user. Nothing from Google ever becomes
community content automatically.

**Build order within the phase: import → manual export → automatic two-way.**
Each step is independently useful and each proves the layer beneath it. Two-way
is switched on only once the map and conflict paths are tested.

---

## 8. Duplicate detection

Driven directly by the PDF findings, which is a genuine stress test.

**The identity key is `(normalised title, start_date)` — never title alone.**
`Late Start (no students in school until 10 a.m.)` occurs 16 times, byte
identical, on 16 different dates. Title similarity would collapse them all.
Conversely Winter Break is one break under two entries with *different* dates
(`Dec 21–31`, `Jan 1–3`), so date equality alone fails too.

Scoring, weighted: exact external ID → certain match. Otherwise normalised title
similarity, date overlap, time overlap, location (**always null for PDF events**,
so it must never be a required signal), and source.

- **High confidence** → pre-select "keep existing", still shown
- **Medium** → surfaced for a decision, nothing pre-selected
- **Low** → imported as distinct

Nothing is ever silently merged or deleted. The user sees Event A beside Event B
and chooses: *Keep existing · Add anyway · Merge · Replace · Cancel*, with the
options varying by situation.

Imports run through `import_staging` so the entire batch is reviewable **before**
a single row reaches `events`.

### 8.1 PDF import

The extractor (`docs/discovery/extract_school_dates.py`) repairs the
Private-Use-Area glyph corruption before parsing, making the import
deterministic. It **hard-fails** if any `U+E000–U+F8FF` codepoint survives into a
parsed date — silent corruption is not an acceptable outcome.

Imported events are community events, admin-authored, auto-`approved` (the admin
performed the import; requiring self-approval is theatre). Categories are
inferred from title patterns and are editable in the review step.

The 16 Late Starts are grouped as an `event_series` for bulk editing, but stored
as **discrete events** — only 16 of 42 in-session Wednesdays have one, so a
weekly recurrence rule would fabricate 26 events.

---

## 9. Classes

`course_code` (e.g. `ICS3U`) is the primary matcher against Google Calendar
event titles, extracted by pattern rather than exact string equality, with a
confidence score and always-available manual correction. Low-confidence matches
are proposed, never applied.

Each class opens a workspace: Class Events · Notes · Assignments · Tasks · Files
· Resources · Upcoming Deadlines.

Notebook pages are a tree (`parent_page_id`), TipTap JSON in `content`, with
`content_text` extracted alongside for search.

An assignment with a due date **generates a linked calendar event**
(`assignments.event_id`). Editing either updates both; the user never enters it
twice.

---

## 10. Notifications

Channel-agnostic by construction.

**Free and shipping: Email + Web Push.** Web Push is unlimited, needs no
provider, no phone number and no consent paperwork, and reaches the lock screen
on Android/desktop and on iOS 16.4+ once installed to the home screen.

**SMS ships as a real, dormant adapter.** Carrier email-to-SMS gateways are dead
(Bell ended 2025-12-31; AT&T 2025-06; T-Mobile 2024) and Twilio offers trial
credit, not a free tier — roughly $0.0079/msg in Canada, after mandatory
toll-free verification or long-code registration. Adding SMS later is
credentials plus a phone-verification flow, not a rebuild. Phone number,
verification and consent-timestamp columns exist now so consent is never
retrofitted.

### 10.1 Duplicate reminders are made impossible, not unlikely

```
unique (profile_id, subject_type, subject_id, channel, offset_minutes)
```

on `notification_queue`. A retried, overlapping or double-fired cron cannot
insert a second identical reminder — the database refuses it. Delivery is
claimed with a conditional status update so two concurrent workers cannot both
send the same row.

Scheduling is driven by both **GitHub Actions cron** and **pg_cron**, deliberately
redundant: GitHub disables scheduled workflows after 60 days of repo inactivity,
and the unique constraint makes double-triggering harmless.

Preferences: per-category toggles, multiple offsets per category
(`1 day + 1 hour`), quiet hours, daily and weekly digests. Digests batch sends,
which matters against a ~100/day free email cap.

---

## 11. Search

Postgres full-text. `tsvector` generated columns with GIN indexes over events,
notebook pages, assignments, tasks and file names — unified by a view, filtered
by the same RLS policies as everything else, so **search can never leak a
resource the user cannot open.**

---

## 12. AI study tools

Google Gemini and Groq both have standing free tiers with no credit card. Calls
run **only** in the `ai-study` Edge Function so the API key never reaches the
browser, behind per-user rate limits.

Features: ask-your-notes, flashcards, quizzes, study guides. All strictly
optional and fully degradable — if no key is configured, the surfaces are hidden
and nothing else is affected. No paid dependency is introduced.

---

## 13. Design system

**Primary `#1E3765`** (U of T Blue, PMS 655), with a generated 50–950 ramp. A
restrained palette: one brand blue, one warm accent for urgency, semantic
success/warning/danger, and a neutral grey scale carrying most of the interface.

Both themes are **authored**, never inverted: dark mode uses desaturated blues
and elevation-by-lightness, since pure `#000` with saturated brand blue vibrates
badly. Every colour is a CSS custom property, so the theme switch is one class on
`:root`.

Type: Inter (UI) + a restrained italic serif for the *Calenda* wordmark only.
Scale is a 1.25 ratio; spacing is an 8px grid with 4px half-steps. The
"expensive" quality comes from spacing discipline, one type scale and consistent
easing — not decoration.

Motion: 150ms micro-interactions, 250ms transitions, 400ms page changes, all on a
shared easing token. Scroll reveals on the landing page and dashboard cards.
`prefers-reduced-motion` collapses every animation to an opacity fade — honoured
globally at the token level, so it cannot be forgotten in a component.

Accessibility is a build gate, not a phase: semantic HTML, visible focus rings,
AA contrast in both themes, keyboard-navigable calendar grid with arrow keys,
focus-trapped dialogs, labelled forms, and live regions for async results.

---

## 14. Free-tier reality

| Service | Free allowance | Real limit to respect |
|---|---|---|
| GitHub Pages | Static hosting | No server; repo must be public |
| Supabase | 500 MB DB · 1 GB storage · 50k MAU | **Pauses after 7 days idle** — the daily cron keeps it warm |
| GitHub Actions | 2,000 min/mo | Scheduled runs disabled after 60 days repo inactivity; pg_cron is the backup |
| Google Calendar API | 1M queries/day | Sync tokens keep usage negligible |
| Email | ~100/day, 3,000/mo | Digests batch; will not scale school-wide |
| Web Push | Unlimited | iOS requires home-screen install |
| Gemini / Groq | Standing free tier | Rate-limited; AI degrades gracefully |
| **SMS** | **None** | **Genuinely not free. Dormant by design.** |

Honest scaling note: this architecture comfortably serves one family and a small
cohort. A school-wide rollout would first hit the email cap, then the 500 MB
database, then Supabase's pause behaviour — all resolvable with a paid tier, none
requiring a rewrite.

---

## 15. Phases

| Phase | Scope | Exit criteria |
|---|---|---|
| 0 | Discovery, PDF decode, spec | ✅ Complete |
| 1 | Vite/React/Tailwind, design tokens, schema + RLS, auth, routing, Pages deploy | Sign in via 2+ providers; RLS tests pass |
| 2 | Events, dashboard, calendar views, categories, school years, search | Full event CRUD, permissions enforced |
| 3 | Suggestions, admin approval, PDF import + dedupe review | 49 PDF events imported, Winter Break merge handled |
| 4 | Google OAuth, calendar selection, import → export → two-way | Round-trip creates no duplicates |
| 5 | Classes, workspaces, notebooks, assignments, tasks, files | Assignment auto-appears on calendar |
| 6 | Parent links, sharing prompts, permissions | Parent sees only what was shared |
| 7 | Notification prefs, email, web push, scheduling, SMS adapter | No duplicate reminder under forced double-fire |
| 8 | Animation, scroll effects, responsive, a11y, loading/empty/error states | Reduced-motion honoured; AA contrast |
| 9 | Test suite incl. adversarial permission tests | Unauthorised access attempts all fail |
| 10 | Production deploy | Live on GitHub Pages |

---

## 16. Security commitments

- No secret in the bundle. Only Supabase URL + anon key, which are safe by design.
- Every table has RLS enabled and a default-deny posture.
- All input validated by shared Zod schemas, client **and** server.
- File uploads: type allowlist, size cap, non-guessable storage paths, served via
  short-lived signed URLs — never public buckets.
- TipTap content is sanitised on render; no `dangerouslySetInnerHTML` of user HTML.
- Auth errors are deliberately uniform to prevent user enumeration.
- Rate limits on suggestions, invites, AI calls and phone verification.
- Tests must include **attempts to reach other users' data**, asserting failure.
