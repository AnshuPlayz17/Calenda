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
- **The landing route renders every scene, so it must not re-render.** The
  active-chapter state lives in `useChapters` and is read by the header and the
  companion rail. When the route also rendered the twelve scenes inline, every
  chapter boundary re-rendered all of them — the import's 51 chips and the
  world map's 1,307 dots included — for nine to twelve frames over 100ms per
  traversal, on every viewport and under reduced motion. The scene tree is
  `useMemo`'d with an empty dependency list. Keep it that way.
- **Scaling a large blurred element is re-blurring it every frame.** The hero's
  accent glow is 670px under a 90px blur; animating its scale on scroll cost
  nine frames over 100ms on a phone. It is painted once and composited.
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

## The design system

Three layers, all in `src/styles/index.css`.

- **Neutrals and brand.** Unchanged: navy `#1E3765` with a generated 50–950
  ramp, both themes authored rather than inverted. This is the app's colour.
- **Chapter accents.** The landing page's eleven chapters each carry a hue,
  set as `data-accent` on the section, and everything inside reads `--accent`
  instead of the brand — eyebrows, icon chips, rules, active states, the
  header's progress hairline, the companion's ticks. Scrolling the page moves
  its colour temperature, which is the one thing a scroll-driven page can do
  that a static one cannot. Only `--accent` is declared per hue; the tinted
  ground, the border and the strong variant are `color-mix()`ed from it and the
  page's own background, so all three themes are correct without three sets of
  numbers. Lightness is held constant across them (0.52 light, ~0.78
  dark) so contrast is a property of the system rather than of each colour.
  **Vivid is the theme that spends chroma** — same lightness, more saturation.
- **One type scale.** `--text-title-sm` through `--text-display-lg`, fluid
  `clamp()` so a headline interpolates with the window instead of stepping at a
  breakpoint. Do not add another `text-[28px] sm:text-[34px]`; that is what the
  scale replaced. The default Tailwind steps are deliberately **not** overridden
  — doing so would resize every screen in the app, not the landing page.

`src/features/landing/Chapter.tsx` holds what every chapter has: the wrapper
that sets the id and the accent and draws the wash, `ChapterHeading`, and the
pinned/static frames. Use them rather than re-typing the classes.

## The sign-in and sign-up pages

`src/features/auth/` is the shell; `src/routes/SignIn.tsx`, `SignUp.tsx`,
`ForgotPassword.tsx` and `ResetPassword.tsx` are the four pages inside it.

**The primary action must be above the fold, and it was not.** At 1440x900 the
sign-up page's own "Create account" button sat below the window behind three
promises, three provider buttons and three inputs. Both pages now show the
providers first with the email form behind one press, and `authcheck.mjs` beside
the harness measures every control's distance past the fold at six viewports —
reporting a button below it as a failure and a footnote link below it as a note,
because those are not the same defect. Do not loosen that check to make
something pass.

**The panel beside the form is a reel, not a diagram.** `AuthReel.tsx` cycles
four scenes on a six-second dwell — the imported year, a class workspace, the
agenda, a reminder — each drawn from the same invented sample data the landing
page counts from. It pauses on hover, on focus and when the tab is hidden, the
ticks are buttons so a scene can be gone back to, and the fill is a CSS
animation rather than a tweened one *because* it has to pause in place: a tween
restarted on hover snaps to full at exactly the moment it has stopped.

It is deliberately not a video file. A video cannot take the theme, cannot be
read out, cannot be corrected without re-rendering, and would be the largest
thing in the repository.

Under `prefers-reduced-motion` it does not rotate at all — all four scenes
render at once, which is more information than the animated version shows at
any one moment, not less.

**The panel carries its own tokens** (`.panel-dark` in `index.css`) because it
stays dark in all three themes. That includes its own copy of the accent ramp
at the dark lightness: in the light themes `--accent` is `oklch(0.52 …)`, chosen
to sit *on* a light ground, and against near-black it is nearly invisible. Only
`--accent` is redeclared — the subtle/border/strong variants mix with `--bg`,
which inside the panel is the wrong ground, so nothing in there uses them.

**Password recovery is on, and one flag turns it off again.** `src/lib/email.ts`
holds `emailDelivery`, now `true` — a recovery mail was sent from the Supabase
dashboard and landed in the inbox rather than spam, which is the test the flag
exists for. While it is false the link is not rendered, both routes redirect to
sign-in rather than showing a form that would silently drop an address, and the
password form carries one honest sentence pointing at the providers. Turn it
back off the moment delivery stops being reliable; that path is kept working
for exactly this reason.

Still true: the built-in sender is about two messages an hour from a shared
domain. Before this reaches more than a few testers, add SMTP under
Authentication → Emails → Custom SMTP. **Brevo is the free option that does not
need a domain** — it verifies a single sender address.

**The redirect URL must keep its `#`.** `…/Calenda/#/reset-password` on the
allow list under Authentication → URL Configuration. Supabase does not fail on
a missing entry, it silently substitutes the Site URL — which is how a
correctly configured project still delivers a link that goes nowhere.

**A recovery token can land in three places, and supabase-js reads two of
them.** `recoveryToken.ts` reads all three: `?code=` before the hash, `?code=`
appended *inside* the hash, and `#access_token=` in a second fragment. The
middle two are where a hash-routed app puts it and where `detectSessionInUrl`
never looks, so a good link would report as expired. `ResetPassword` claims the
credential itself rather than hoping, strips it out of the address bar before
the password is typed, and has ten tests over the shapes.

This was going to be settled by testing against the live site instead, and that
turned out to be unanswerable: the route did not exist in the deployed build, so
the link fell through to the catch-all inside `RequireAuth` and its
`<Navigate replace>` discarded the query string and hash before anything could
read them. **The evidence destroyed itself.** Reading every position is cheaper
than another round of guessing at two emails an hour.

## The landing page

Eleven chapters, and the rule that governs them is that no two adjacent ones
move the same way — a fourth identical pinned section is the failure mode of
this genre. `src/features/landing/sections.ts` is the list, in order; the route
wraps each scene with the matching id and the companion rail reads the same
array, so the page and its navigation cannot drift apart.

1. **Opening** — the hero and "a day" as one move. The copy falls back while
   the card travels from the right column into the middle of the window and
   grows, and the thing it opens into is the row you were already looking at.
   The rail has two stops in it (`top` and a marker at `glance`)
2. **Schools** — pinned; fifteen cards arrive one at a time in a 5×3 grid (3×5
   on a phone), then travel into a dock while the line rises behind them. Read
   the wording rule below before touching its copy
3. **The path** — a drawn spine down six stages, not pinned, with a chip riding
   the line and renaming itself at each one: a line of text becomes a staged
   row becomes an event becomes a reminder
4. **The import** — pinned; 51 invented dates fly into a 7-column grid, then the
   15 identical "Late Start" chips light up. Falls back to no flight below 768px
   or on <= 4 cores
5. **What else** — pinned; three full-width panels panned across sideways.
   Deliberately not the questions chapter's sideways move: that is a rail of
   discrete stops, this is a continuous pan along one surface
6. **Numbers** — pinned; the figures count as you scroll and the bars grow as
   you reach them, all computed from the sample year. It is the only chapter
   where the number under your eye is a function of scroll position, which is
   the claim it makes ("counted, not typed") performed rather than stated
7. **Questions** — pinned; six answers on a horizontal rail, one discrete stop
   at a time
8. **Anywhere** — pinned; a dotted world map lights up from a growing circle
   while ten cities land in turn, each showing its real local time. It is a
   map of *where it works*, never of users — see below
9. **Privacy** — pinned; six adversarial RLS tests thrown at a wall and stopped
   dead against it, notching it as they land. They used to resolve in place,
   which showed refusal as a label rather than as an event
10. **Founder** — a panel hinged at its bottom edge, swinging open
11. **Closing** — deliberately still

**The page's length is one constant.** `PACE` in `src/features/landing/scrollScene.ts`
scales every pinned scene together; each scene declares how many screens it wants
relative to the others and `paced()` multiplies. It is 1 — the pacing the page
was built at. It was tried at 5.6 (155 screens) and 1.7 (54 screens) chasing a
frame count, and both were too slow to scroll.

**Frames are seconds times sixty**, so a frame count is traversal time, and
traversal time is distance over scroll speed. Animation richness does not move
it; only length does. That makes a frame count a bad thing to optimise on a
landing page, and a meaningless number to quote without the pace it was measured
at.

Reduced motion is unaffected by `PACE` — pinned scenes render their static
composition and consume no scroll budget at all, so that path stays at about
11,500px however long the animated one gets.

**The page is entered, not scrolled past.** Every chapter is travelled into,
and it is a real dolly rather than a scale — the content translates along Z
under `transformPerspective: 1200`, so the geometry does the work. A scale was
tried first and is the wrong verb: growing an element from 0.9 to 1 is the same
picture at two sizes, and nothing about it says the viewer moved.

- `PushThrough` (`Chapter.tsx`) is for the nine pinned chapters. They arrive out
  of depth over the first 8% of their own scroll and pass the camera over the
  last 8%, leaving at `z = 250` — a magnification of 1200/950, or 1.26, which is
  deliberately inside the 1.3 the harness's width check allows for a push-through
  and well outside anything a layout bug produces.
- `depth` is per chapter, not one number. A chapter that is one object takes more
  of it (schools, import, world: 520) because the arrival is the point; a column
  of text takes less (questions and the panels: 320, founder: 300) because text
  swinging through perspective is text that is briefly hard to read.
- `Approach` is for the two chapters that do not pin. It is the first half only.
  A tall section that simply scrolls cannot be pushed past — the camera carrying
  on forward would take its opening lines out of the frame while its closing ones
  were still being read.
- The pipeline's six stages arrive out of depth individually, and the nodes on
  the line deliberately do not: the line is fixed in the page, and staying put is
  what the text is arriving *at*.

Two rules the pass established. It goes on the content *inside* the sticky frame,
never on the chapter wrapper — a transform on the wrapper moves the sticky
element with it, which unpins the scene. And `useScroll` must never target an
element that moves itself in Z: it measures with `getBoundingClientRect`, which
is the projected box, so the target feeds its own output back into its own input.
`Approach` puts the ref on a static outer element and the transform on an inner
one for exactly this reason. The schools chapter is the same trap from the other
side — it measures its own stage, so it reads `offsetWidth`/`offsetHeight`, which
are layout numbers and unaffected by an ancestor transform.

The verification for this is `dollycheck.mjs` beside the harness: it walks the
page and reports, per chapter, the closest the content ever gets to `z = 0` and
the widest it is ever projected. A chapter that never reaches the camera is
permanently small and nothing else catches it. **Scroll it with
`behavior: 'instant'`** — the page sets `scroll-behavior: smooth`, and a probe
that uses a plain `scrollTo` measures a page that has barely moved and reports
every late chapter as broken.

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
