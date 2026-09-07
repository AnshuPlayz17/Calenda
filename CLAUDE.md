# Calenda — working notes

A school productivity app for students and parents. React 19 + Vite +
Tailwind v4 on GitHub Pages; Supabase (Postgres,
Auth, Edge Functions) behind it. `docs/SPEC.md` holds the architecture and the
reasoning behind each decision; `docs/DATA-MODEL.md` the schema and RLS design;
`docs/FACTS.md` every claim the marketing pages are allowed to make, with the
check that verified it.

## Constraints that are not negotiable

These came from the project owner and hold unless he says otherwise.

- **Free tier only.** No paid services, fonts or assets. But never pretend
  something is free when it is not, and never fake a feature to look complete.
  SMS in particular ships as a dormant adapter and must never be claimed as
  working — carrier email-to-SMS gateways are dead and Twilio has no free tier.
- **Never imply Calenda is any school's official product, and do not name a
  school anywhere.** The owner had every mention of the school it started at
  removed, so the disclaimers now say "any school" and the lockup carries no
  crest. The disclaimers are load-bearing; keep them, keep them generic.
- **No secrets in frontend code.** Only the Supabase URL and anon key, which are
  safe by design.
- **Permission is enforced in the database, never by hiding UI.** 54 RLS
  policies; `supabase/tests/rls_test.sql` holds six adversarial tests that sign
  in as the wrong person and require failure. Add to them, never weaken them.
- **Nothing is silently merged or deleted.** Duplicate detection surfaces a
  decision; it never makes one.
- **`prefers-reduced-motion` gets a real alternative**, not a faster animation.
  The test: render the reduced-motion branch first and ask whether it still
  makes the argument. If the still version loses the point, the motion was
  carrying information it should not have been.

## Verify by measuring, not by looking

Screenshots miss what matters in this codebase. There is a harness pattern worth
rebuilding if it is not to hand: drive a real wheel-scroll through the page in
Chromium at six viewport sizes (1440x900, 1280x700, 1024x760, 414x736, 390x844,
375x667) plus reduced-motion and dark, and report frame times, horizontal
overflow, any element wider than the viewport, and console errors.

The bar the landing page currently holds: **p95 17 ms, zero frames over 50 ms,
all nine configurations clean.** Do not regress it.

Always run before pushing: `npm run typecheck && npm run lint && npm test &&
npm run build`.

## Traps already hit here — do not rediscover them

- **Scroll-linked `useTransform` ranges must stay within [0, 1].** Motion
  compiles them to native scroll timelines where the range becomes WAAPI
  keyframe offsets. A stop at 1.05 throws at render and takes the whole page
  down. Use `stops()` in `src/features/landing/scrollScene.ts`.
- **`clamp: true` is not enough on that same path.** Outside the declared range
  you get the browser's fill behaviour, not Motion's. A beat was measured fading
  out and climbing back to 0.91 opacity underneath a later one. Use `held()`,
  which states the terminal values explicitly.
- **A percentage translate in CSS is a percentage of the element's own size**,
  not its container's. 49 chips once piled into a corner one seventh of the
  stage wide because of this.
- **Tailwind utilities lose to nothing, but the `hidden` attribute loses to
  `.flex`.** Prefer conditional rendering over `hidden` for anything with a
  display utility on it.
- **Never put `overflow-x: hidden` on `html`.** It makes `html` a scroll
  container and silently kills every `position: sticky` on the page. Use `clip`.
- **plpgsql resolves types and overloads at call time, not creation time.** A
  migration referencing a type that does not exist applies cleanly and CI stays
  green; it fails when the function is first called. Adding a defaulted
  parameter does not preserve old call sites — it makes them ambiguous. Drop the
  old overload.
- **Fonts are bundled, not fetched from Google.** See `src/styles/fonts.ts`. Do
  not reintroduce the CDN link.

## Working conventions

- Branch from the current `origin/main`, one PR per piece of work.
- **After the owner merges, verify the commits actually reached `main`** —
  `git branch -r --contains <sha> | grep origin/main`. Commits have been
  stranded three times by pushing to a branch after its PR was already merged.
- Never push follow-up commits to a branch whose PR may already be merged; open
  a new PR instead.
- Commit messages explain *why*, including what was tried and rejected. They are
  the durable record — the conversation is not.
- The owner cannot be assumed to know jargon; explain terms when they appear.
- Supabase cannot be reached from the dev container (egress policy), so all
  database and Edge Function work is done by the owner following written
  instructions. SQL goes in the Supabase dashboard editor; `supabase ...`,
  `git`, `npm` and `curl` go in his terminal.
- The live site (github.io) is also unreachable from here. Real-device checks
  are the owner's.

## The landing page

Twelve chapters, and the rule that governs them is that no two adjacent ones
move the same way — a fourth identical pinned section is the failure mode of
this genre. `src/features/landing/sections.ts` is the list, in order; the route
wraps each scene with the matching id and the companion rail reads the same
array, so the page and its navigation cannot drift apart.

1. **Hero** — masked headline reveal, pointer tilt, a stack that parts on exit
2. **Schools** — pinned; fifteen cards arrive one at a time in a 3×5 grid, then
   travel into a single row of fifteen while the line rises behind them. Read
   the wording rule below before touching its copy
3. **A day** — pinned; a summary card cross-dissolving into its detail view
4. **The path** — a drawn spine down six stages, not pinned
5. **The import** — pinned; 51 invented dates fly into a 7-column grid, then the
   15 identical "Late Start" chips light up. Falls back to no flight below 768px
   or on <= 4 cores
6. **What else** — a CSS-sticky deck, no pin
7. **Numbers** — counted figures and two charts, all computed from the sample year
8. **Questions** — pinned, and the only scene that travels *sideways*: six
   answers on a horizontal rail, one step per stop
9. **Anywhere** — pinned; a dotted world map lights up from a growing circle
   while ten cities land in turn, each showing its real local time. It is a
   map of *where it works*, never of users — see below
10. **Privacy** — pinned; six adversarial RLS tests resolving to "Refused"
11. **Founder** — a panel hinged at its bottom edge, swinging open
12. **Closing** — deliberately still

Two things are on screen the whole way down. A hairline in the sticky header
fills as you read, which answers *how far through*. `ScrollCompanion` answers
*through what*: a tick rail down the right margin above 1280px, a pill at the
bottom below it, naming the chapter being read and offering a step in either
direction. The second half matters — a page built entirely from scroll-driven
scenes quietly assumes everyone travels it once, forwards, and anyone wanting a
second look at the import otherwise has to hunt for it by dragging.

All the dates and figures on this page are invented — `src/data/sampleSchoolYear.ts`
and `src/data/sampleEvents.ts`. Anything that counts them reads the array rather
than repeating a number in prose, so the copy cannot drift from the data.

**The schools section names fifteen real institutions, and the wording is
load-bearing.** None of them has agreed to anything, so "partnered with",
"trusted by" and "our schools" are all endorsement claims under fifteen
trademarks — the easiest claims on the page for anyone to check, and one email
from one communications office ends the section. "Works with" is a statement
about software reading a published document, which is what this is. **No
school's crest appears** — each tile is that school's initials set in
Newsreader, sized by how many letters there are. Crests were tried and dropped:
each is a trademark, fifteen drawn by fifteen studios at fifteen aspect ratios
never look like one row, and hotlinking them was the only third-party request
on a site that bundles its own fonts. The names live only in `src/data/schools.ts` — `noSchoolName.test.ts`
still fails on a school named anywhere else, which is where a claim of
ownership would actually get made.

**There is no map of users and there must not be one.** Calenda has one user and
a few testers; dots captioned "our community" would be the only invented claim on
a page whose whole argument is that its contents are checkable. The world scene
shows where it *works* — the timezone behaviour, which is real, tested and worth
saying. Its clock readings come from `Intl.DateTimeFormat` at render, so they are
never a number anybody typed. The map itself is generated: run
`npm i -D world-atlas topojson-client && node scripts/build-world-dots.mjs`.
