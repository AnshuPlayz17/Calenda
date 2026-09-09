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

**A probe that reports everything as broken is usually the probe.** Three
separate tools in one night measured something easy instead of something true:
the sidebar check compared rects against a box and called every item in a
scrolled list clipped; the keyboard check flagged the mobile header (not
rendered), every labelled input (labelled correctly), and produced nine
different "first tab stops" (because a hash change does not reset focus); and
the skip-link check asked only whether focus reached the content, not whether
the content was the right page. Two of the three reported the *same* numbers
before and after a change, which is the tell. **Ask what a person could not
do, not what a number is:** not "is it inside the box" but "can it be
reached"; not "did focus move" but "did the route survive".

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
- **A skip link cannot be `<a href="#main">` in a hash-routed app.** The router
  reads `#main` as the route `/main` and renders the 404. It is a button that
  moves focus to `<main tabIndex={-1}>`. The probe said it worked, because the
  next Tab did land in content — the content of the not-found page.
- **`sr-only` clips an element; it does not remove it.** Anything with it stays
  focusable, so a hidden file input is a stop in the tab order with no visible
  shape and no name. Give it `tabIndex={-1}`; the button beside it is the
  control.
- **A child of a `display:none` parent still reports its own computed
  `display`.** Checking `getComputedStyle(el).display` says nothing about
  whether it is rendered. `el.checkVisibility()` is the question you meant.
- **An `<input>` has no accessible name of its own and should not.** Its name
  comes from `<label for>`, so an audit reading `textContent` or `aria-label`
  flags every correctly-labelled field in the app. Read `el.labels`.
- **Changing the hash is a same-document navigation, so focus does not reset.**
  Any probe measuring "where does Tab go first" has to load each screen fresh
  or it is reporting where the previous screen left off.
- **`vi.advanceTimersByTime` cannot cross a React render.** Where one timer
  sets state and an effect then schedules a second timer, a single large
  advance fires the first, queues the render, and finishes — the second timer
  does not exist yet. Advance in steps inside `act()`.
- **Adding a value to the `shareable` enum is a migration with a trap; adding
  one to the TypeScript `Shareable` union is not.** They share a name and are
  not the same thing. The enum is for `shares` (per-person links); the union
  only picks which table to flip `shared_with_parents` on. `grade` and `file`
  are in the union deliberately and not in the enum.

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
- **Supabase cannot be reached from the dev container, but Postgres can be run
  IN it, and every migration should be applied there before it is called
  careful.** `/usr/lib/postgresql/16/bin` is present. `initdb` refuses to run
  as root, so run it as `ubuntu`; a ~30-line shim providing `auth.users`,
  `auth.uid()`, `storage.buckets`/`objects`, `storage.foldername()` and the
  `anon`/`authenticated`/`service_role` roles is then enough to apply every
  migration in order and run `supabase/tests/rls_test.sql` for real. The first
  time this was tried it found a live bug that had been shipped for days, and
  two invalid UUIDs in a test file that had been read four times.
- The hosted project itself is still unreachable (egress policy), so Edge
  Function deployment and anything touching real data is done by the owner
  following written instructions. SQL goes in the Supabase dashboard editor or
  applies on merge via the GitHub integration; `supabase ...`, `git`, `npm` and
  `curl` go in his terminal.
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

**The form is written before the panel in the DOM, and put back on the right
with `col-start`.** A keyboard follows the DOM, not the grid: with the panel
written first, pressing Tab on arriving at either page crossed the brand link
and the reel's five tick buttons — six decorative stops — before reaching the
first field. Grid placement puts the panel back on the left without putting it
back in front. `taborder.mjs` beside the harness checks it.

**Every step of the sign-up form says where it is, in the heading and in
words.** It said "Create your account / It takes about a minute." on all four
screens, which is the largest text on the page carrying no information after
the first — and the step marks under it were three unlabelled bars, in the same
grey as the subtitle, which read as decoration. The words go *beside* the bars,
on a row that already exists — but only `leading-none` makes that free: a 12px
string inheriting the body's 1.6 turns a 4px row into a 19px one, which put the
Back link four pixels below the fold at 375x667 on two of the steps. Every
subtitle is likewise checked to be one line at the column's 380px, because a
wrap costs 22px on the step that has the least to give. `AuthLayout` takes a `stepKey` and re-keys the column so
each step arrives rather than being swapped in between two frames — no
`AnimatePresence`, because `mode="wait"` holds the next step off the screen for
the length of the old one's exit, which on a form is a press that appears to do
nothing. The live region that announces the change lives *outside* what
`stepKey` re-keys: a live region that is unmounted and mounted again carrying
its new text is generally not announced at all, so the one element that exists
to narrate the change would be the one element the change destroys.

**The panel beside the form is a reel, not a diagram.** `AuthReel.tsx` cycles
five scenes on a four-and-a-half-second dwell — the imported year, a class workspace, the
agenda, a reminder — each drawn from the same invented sample data the landing
page counts from. It pauses on hover, on focus and when the tab is hidden, the
ticks are buttons so a scene can be gone back to, and the fill is a CSS
animation rather than a tweened one *because* it has to pause in place: a tween
restarted on hover snaps to full at exactly the moment it has stopped.

It is deliberately not a video file. A video cannot take the theme, cannot be
read out, cannot be corrected without re-rendering, and would be the largest
thing in the repository.

**It resumes rather than restarting.** The panel is mounted by the auth layout,
so moving from sign-in to sign-up, or reloading, used to send somebody who had
read three scenes back to the first. The index is in `sessionStorage`, which
survives a reload and every move between the auth pages and does not survive
closing the tab — somebody arriving next week starts at the beginning, which is
right, because the scenes are an argument in order rather than a position in a
film.

Under `prefers-reduced-motion` it does not rotate at all — all five scenes
render at once, which is more information than the animated version shows at
any one moment, not less.

**Do not use `scrollHeight` to ask whether the panel fits.** The accent wash is
a 26rem blur positioned 160px below the reel and clipped by `overflow-hidden`,
so it inflates `scrollHeight` by 78px while being invisible. A check built on
it reported an overflow that did not exist and cost a round of trimming padding
that did not need trimming. Measure whether readable elements fall outside the
panel's box instead — `panelfit.mjs` beside the harness does.

**The panel carries its own tokens** (`.panel-dark` in `index.css`) because it
stays dark in all three themes. That includes its own copy of the accent ramp
at the dark lightness: in the light themes `--accent` is `oklch(0.52 …)`, chosen
to sit *on* a light ground, and against near-black it is nearly invisible. Only
`--accent` is redeclared — the subtle/border/strong variants mix with `--bg`,
which inside the panel is the wrong ground, so nothing in there uses them.

**Password recovery is on, and one flag turns it off again.** `src/lib/email.ts`
holds `emailDelivery`, now `true`. Verified twice on 2026-09-07: a mail sent
from the Supabase dashboard landed in the inbox rather than spam, and then the
whole flow ran on the live site through the app's own code — the link on the
sign-in page, the mail, and a working form at the other end. The second one is
the one that proves the link survives hash routing. While it is false the link is not rendered, both routes redirect to
sign-in rather than showing a form that would silently drop an address, and the
password form carries one honest sentence pointing at the providers. Turn it
back off the moment delivery stops being reliable; that path is kept working
for exactly this reason.

**Mail goes through Brevo over custom SMTP**, from a subdomain Brevo owns and
has SPF/DKIM for. Sending "from" a personal Gmail address through a third party
was the alternative and is worse — it fails DMARC alignment and gets filtered,
because the mail is signed by Brevo while claiming to be from Google.

**Three limits stack, and the arithmetic decides one setting.** Supabase
enforces a per-address gap server-side; Supabase's project-wide "Emails per
hour" (call it N) caps everything at 24N a day; Brevo's free plan allows 300 a
day. So **N must be 12 or lower** — 24 × 12 = 288 — or a determined stranger can
burn the day's quota and the cost lands on somebody who genuinely cannot get in.
`emailCooldown.ts` adds a per-address countdown in the browser on top of that;
it is a courtesy for the person who presses the button twice, never a control,
and must not be described as one.

**One-time sign-in links are back**, gated on the same flag, with
`shouldCreateUser: false` so a typo cannot silently register an account. An
address with no account returns success and sends nothing — saying "no such
account" would answer *is this person registered here* to anyone who asked.

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

## Identity, and the hole that was in it

**The role column is not writable by a client, and the control is a GRANT, not
a policy.** `rls.sql` ends with `revoke update on profiles from authenticated`
followed by a grant naming five columns; `role` is deliberately absent. Postgres
checks column privileges *before* RLS, so an update naming `role` is refused
before any policy runs.

This was misread once, badly. Reading `profiles_update` alone — row-level, no
column restriction — looks exactly like a privilege escalation, and it was
reported as one, on a partial read of a file whose next screen said otherwise.
**Before calling something a hole, check the grants as well as the policies.**
`20260907000100` came out of that mistake; it is kept as a redundant second
layer, and `20260907000200` records the correction.

`set_my_role()` is the only way through: a definer function that accepts
`student` or `parent` and refuses `admin` by name. Admin is granted in SQL by
somebody who already has the database, never from a client.

The six original tests would not have caught a real escalation either: they
*set* `role = 'admin'` as fixture setup and then check what an admin cannot
read, so the acquiring of the privilege was never attacked. **When a test file
uses a privilege as setup, ask whether anything tests the getting of it.** 19
assertions now.

**Nothing in the app could set a name or a role.** Password sign-ups arrived
with `full_name` null forever — `handle_new_user()` reads it out of OAuth
metadata, which a password sign-up has none of — everyone was silently
`student`, and Settings displayed both read-only. The sign-up form now asks,
and `AccountCard` makes all three editable, because collecting something a
person cannot correct is worse than not collecting it.

Role goes through `set_my_role()` rather than the sign-up metadata: that
metadata is user-controlled input the trigger copies verbatim, and role is the
column `is_admin()` reads.

**Every account in the world said `America/Toronto`.** The schema defaults it
and nothing ever changed it — there was no `resolvedOptions()` call anywhere —
while the dispatcher schedules on `(start_date + time '09:00') at time zone
pr.timezone` and reads quiet hours in the same zone. A user in London was
getting their "nine in the morning" at two in the afternoon, under a landing
page with a whole chapter claiming otherwise. It is read from the device on
every profile load now, which also catches every account that already exists.

**The sign-up email path is three steps, and the length is a measurement.**
Credentials, then name and role, then whichever details the role has. Six
fields plus a submit button do not fit a 700px window — the harness found
"Create account" 41px below the fold at 1280×700 and 123px at 375×667 — and the
answer to a form that does not fit is fewer things per screen, not tighter
padding. The last step branches, so a student sees school and grade and a
parent sees relation and an invite code; neither ever sees the other's. Step
two is the same shape the OAuth first-run screen will need.

**The name is three boxes and one stored value.** Splitting `full_name` in the
database would need a migration and buy nothing the app uses — it greets you by
first name and shows your name to a linked parent. Only the first is required:
plenty of people have one name, and a required surname turns them away at the
door.

**Every answer is required, and two of them needed a way out that is not a
loophole.** A list of fifteen schools with no alternative is a door shut on
everyone else, so the picker's last option reveals a required text box. A
parent's invite code comes from the *student's* settings, so requiring it
outright would deadlock every parent whose child has no account yet — a
checkbox says so, because an explicit "I cannot get one" is a real answer and a
blank field is not. Middle name stays optional; plenty of people have none.

**The school picker names the fifteen schools on the sign-up page**, reversing
an earlier instruction to keep those names on the landing page only. Asked for
explicitly; recorded here because it was reversed, not forgotten.

**`profiles.school` is free text and nothing reads it.** There is no school
entity, so a picker of the fifteen names would read as "these are supported"
while a `community` event is still visible to every account. The field says
plainly that it does not change what you see yet, and the names stay on the
landing page where they were asked to stay.

**A new column needs a new GRANT.** `rls.sql` revokes update on `profiles` and
re-grants a named list; a column that is not in it makes Postgres refuse the
*whole* statement, taking the other fields down with it, silently, because the
result is not checked. That is exactly how one attempt at this shipped broken.

**`authcheck.mjs` only ever measured the screen that offers the form, never the
form.** It existed to catch a submit button below the fold and for its whole
life measured a state where that button is not rendered — so every field added
was unchecked. It now walks the choose screen, the form, and all three sign-up
steps including both branches of the last one: 46 configurations. Anything
inside `[data-dev-only]` is skipped, because the not-connected card is absent
whenever a Supabase project is configured.

**It launches a fresh browser per configuration, which helps and does not
cure.** Reusing one browser across all forty-six made later runs pick up single
frames over 50ms while the same configuration measured alone was clean twelve
times out of twelve — contention with the teardown of earlier pages inside the
harness. Isolating them cut it sharply and produced one run of 46/46 clean, and
that run was written up here as though it were settled. It is not: occasional
single-frame stalls still appear in this container, on configurations whose p95
is 17ms and whose isolated re-measurement is clean every time.

So the standard for a frame failure is **repetition, not a single run**. One
long frame in fifteen hundred, with p95 unchanged, is the container. Three
consecutive runs failing the same configuration is the page. Do not spend a
round on the former, and do not write off the latter.

**Parent invites were already the best-built thing in this area** and only
needed calling: `create_parent_invite()` makes eight characters with no
`0/O/1/I` so a code survives being read down a phone, and
`redeem_parent_invite()` is a definer function so a parent never gains read
access to the invites table. The relation is set *after* redemption rather than
by adding a parameter to it — a defaulted parameter makes existing call sites
ambiguous — and it lives on `parent_links`, not the profile, because one adult
can be a mother to one student and a guardian to another.

**The step is in the address, not in state.** It was state, so the browser's own
Back button — the one a phone puts under your thumb — left the form entirely
and took three screens of typing with it. `?step=` fixes that and makes Forward
work too. Only `name` and `details` are guarded against a pasted deep link with
an empty form behind them: the first version guarded every step and bounced the
reader off step one the instant they reached it, because email and password are
empty there by definition.

**One reveal toggle for two password boxes.** They hold the same secret typed
twice, so revealing one and not the other tells the reader nothing — and two eye
buttons in a column read as two separate settings. It is a wrapper rather than a
prop on `Input`, which every other form in the app shares.

**An existing account used to be told to check its email.** Confirmation is off,
so nothing was ever sent: somebody who already had an account was sent away to
wait for a message that does not exist. `SIGN_UP_BLOCKED` says "if you already
have an account, sign in instead" with a link, which is true whether or not the
address is registered — so the form still never answers *is this person
registered here*.

**Tab still lands in the panel before the form.** The reel's tick buttons come
first in the DOM, so a keyboard reaches five decorative controls before the
first field. Known, not fixed, and it lives in `AuthLayout`/`AuthReel` rather
than on any one page.

**`profiles.heard_from` is asked once and never shown back.** Free text rather
than a list of five options, because with a handful of users a sentence is
worth more than a bucket and a list is a guess at the answers before any have
been collected. Only password sign-ups are asked — OAuth users never see the
form — so it is a partial sample and not a count of anything.

A bad invite code does not fail the sign-up. The account exists by then and
refusing to sign somebody in over a typo in an optional field is the worse
outcome — but it is carried to the welcome screen and said, not swallowed.

**OAuth users never saw the sign-up form, and they are most of the accounts.**
`handle_new_user()` copies a name out of the provider's metadata, so that much
arrived; everything else did not, and every one of them was silently a
`student`. `/first-run` asks them, gated on `onboarded_at` — a column that
existed from the first migration and that nothing had ever written or read.

The gate runs for every signed-in person on every protected page, so each of
its conditions exists to prevent a specific trap, and it lives in
`src/app/firstRunGate.ts` as `needsFirstRun()` rather than inline in
`RequireAuth` — because the test used to reproduce those four lines instead of
calling them, which checks that a copy behaves rather than that the app does.
Preview is excluded (sample data, no profile row, a screen that could never be
completed), and `/first-run` sits outside the gate or it redirects to itself.

**A null profile meant two different things and the gate could not tell them
apart.** `loadProfile` was fire-and-forget with `setLoading(false)` right after
it, so `loading` went false the moment the *session* resolved while the profile
was still in flight. The gate saw null, fell through, and rendered the dashboard
to somebody who had never been asked anything — asked a moment later when the
profile landed, unless it was slow or failed, in which case never. `profileReady`
now goes true when the fetch *finishes*, empty row included: "we looked and found
nothing" is an answer, and an unreadable row must not lock somebody out of the
app while the only way forward is a screen that writes to that row. Three
outcomes now, not two — `wait`, `ask`, `through` — over seven tests that call
the shipping function.

**The questions live in `aboutYou.tsx`, asked in two places.** A copy in each is
how a parent signing up one way ends up with a relation and the other way
without one. The one deliberate difference: first-run shows the name in a
single box because there is an existing value from the provider, and splitting
it into three to display it would guess wrong and make the reader clean up a
mess the app invented. Sign-up has nothing to split, so three boxes structure
the question.

## The app behind the front door

Audited on 2026-09-08 with `appcheck.mjs` beside the harness: seven screens at
six viewports plus reduced-motion and dark, entered through preview mode, which
is the only way in from a container that cannot reach Supabase. **56
configurations, p95 17 ms, no console errors, no unnamed controls.** That
measures layout, motion and console health — not writes, and not empty states
that preview happens to fill.

**One real defect, on the first screen after signing in.** The dashboard
scrolled sideways on phones — 10px at 390, 25px at 375 — with the Calendar and
Classes links off the right edge. A grid item defaults to `min-width: auto`, so
it refuses to shrink below its content's minimum: the left column measured 384px
inside a 343px parent and every card inherited it. `min-w-0` on the grid
children is what lets the truncation already in there take effect. **If a
column will not shrink, it is `min-width: auto` before it is anything else.**

**The real calendar is a test fixture and must not reach the app.** It used to
live in `src/data/schoolCalendar.ts` and was imported by *two* shipping files —
`previewSource.ts` and the import screen — so one school's actual 2026–27
calendar was in the production bundle twice, under a banner announcing it. No
school was named, so the name guard passed the whole time.

It now lives at `src/test/fixtures/realCalendar2026_27.ts`, where shipping it
takes an import across that boundary, and `noRealCalendar.test.ts` fails on one.
The app uses `sampleSchoolYear` — invented, same shape, same span. The fixture
stays because the import and duplicate-review work needs a real document to be
honest about. **`docs/discovery/source/` still holds the source PDF**; it is not
bundled, but it is in a public repo.

That guard strips comments before searching, because `sampleSchoolYear`'s own
doc comment names the real calendar to explain that it exists instead of it —
the first version failed on exactly that.

## `set_my_role()` had never worked, and every parent was a student

Found on 2026-09-09 by running the migrations and `rls_test.sql` against a
local Postgres for the first time. `select set_my_role('parent')` raised
`role may not be changed` and left the row untouched.

`guard_profile_role()` is a BEFORE UPDATE trigger that refuses a role change
unless `auth.uid()` is null or the caller is an admin. `set_my_role()` is
SECURITY DEFINER, and the pair was written assuming that being a definer
function is enough to get past it. **It is not. SECURITY DEFINER changes the
database role a function executes as; it does not touch `auth.uid()`, which
reads a session setting that is still there inside the function.** So the guard
blocked the one path built to write that column.

Nobody noticed because a student changes nothing: `handle_new_user()` already
defaults the column to 'student', so `set_my_role('student')` is not a change
and the trigger never fires. Only a parent hits it, and `applyDetails()`
correctly treats the failure as a warning rather than an error -- the account
exists by then -- so it went quiet. **This is the same failure the project had
already fixed once** ("everyone was silently `student`"): the question was added
to the form and the answer has been discarded ever since.

`20260909000700` fixes it with a transaction-local setting that `set_my_role()`
declares and clears around its own update. That setting is not the control and
must never be treated as one -- the control is still the column grant, which
refuses any client naming `role` before a policy or trigger is reached. The
trigger is the second layer, and it now admits exactly one thing: a function
that refuses 'admin' by name and takes the row id from the token.

**The test that would have caught it was already in the file**, unrun. 34
assertions pass now.

## What was added on 2026-09-09

Six migrations, two Edge Functions, five features and two audits. All of the
SQL is unrun — Supabase is unreachable from the dev container — and written to
be safe to apply twice, because this project has a GitHub integration that
applies migrations on merge *and* a habit of pasting SQL by hand.

**The owner has to do four things** before any of it works: a Groq key and
`MODEL_PROVIDER`/`MODEL_API_KEY` in Supabase Edge Function secrets; a private
`attachments` bucket (or let `20260909000400` create it); `SUPABASE_ACCESS_TOKEN`
and `SUPABASE_PROJECT_REF` as GitHub secrets so `functions.yml` can deploy;
and `BREVO_API_KEY` + `MAIL_FROM` for reminders.

**The timetable is a table, not columns and not events.** `class_meetings`
holds one row per slot. Expanding a timetable into `events` would be about a
thousand rows a student nobody asked for, each needing suppression on every
holiday. Rotating Day 1..Day N schools get `cycle_day`; the honest limit is
that counting weekdays drifts the first time a school closes unexpectedly, so
the banner says which day it *believes* it is and offers a one-tap re-anchor.
Deriving school days from the imported calendar sounds better and would be
confidently wrong in a new way whenever that calendar was incomplete.

**Marks are private by default and that default is the feature.** A student
whose parent is linked can experience mark tracking as surveillance; defaulting
to visible makes that choice for them. `score` and `out_of` stay separate so
17/20 does not become 85, and `letter` exists because some report cards give
only "Level 3" and inventing a number would be making data up. No average is
stored: it is computed on read and shown with its working ("Weighted, from 5
marks. 2 not counted"). An unmarked row is excluded, never counted as zero —
an upcoming test is not a test you failed.

**Report cards are the import pipeline again**, deliberately the same shape.
The model produces a proposal; every line starts `pending` however confident it
claimed to be; nothing reaches `grades` until a person accepts that line *and*
picks a class. Owner-only with no parent arm anywhere: sharing one mark is a
different act from handing over the document it came from, with its comments
and every other mark on it. The model is told not to correct spelling, because
a misread subject name is the signal telling a student not to trust that line.

**The assistant reads as the user.** `calenda-chat` forwards the caller's JWT
into its Supabase client, so every read goes through the same policies the app
does. This is the opposite of `notify-dispatch`, which runs as the service role
because it must reach everybody's reminders and accepts no input about whose. A
service-role assistant is one prompt injection in one shared note away from
reading every account; a JWT-scoped one cannot return anything its user could
not already open in a tab. The quota is claimed *before* the model is asked,
and it is a constant inside a definer function taking no arguments — a
caller-supplied limit is not a limit.

**The walkthrough ends on the student's own school, and there is no "x".**
`<school> x Calenda` is the visual grammar of a partnership lockup, which would
be an endorsement claim under a live trademark. Put to the owner; he chose this
version. `schoolMark()` never derives initials — a school on the list gets its
curated monogram, one typed into the "another school" box gets its own name.
Two tests hold the line, one on invented initials and one on the separator.

**Reminders had never sent anything, and FACTS.md said they had.** Two
independent reasons: `reminders.yml` opened with `if [ -z
"$SUPABASE_FUNCTION_URL" ]; then exit 0` and that secret was never set, so it
ran hourly, printed one line and passed; and no Edge Function had ever been
deployed. Sixty green checks a day for a feature that had never delivered
anything, under a landing panel about reminders. The workflow now **fails**
when unconfigured — a job that passes without doing its work is worse than one
that fails, because nothing will ever prompt you to look. The sender moved off
`onboarding@resend.dev`, which only ever reached the account owner.

`docs/FACTS.md` line 48 read "Notifications (verified live end-to-end)". It now
says delivery is not yet verified and explains how the claim came to be false.
**Nothing on the marketing pages may claim reminders are delivered until one
has been.** The landing page's Reminders panel is still written as though they
are; that is the owner's call and it is flagged, not quietly rewritten.

**The mobile drawer was lying about being a modal.** It has carried
`role="dialog" aria-modal="true"` since it was written and never moved focus
into itself or trapped it — so a screen reader was told a modal had opened
while focus stayed behind it, and Tab walked out into a covered page.
Announcing a trap that does not exist is worse than not announcing one.

**Day one had never been looked at.** Preview seeds two classes, a year of
events, a notebook, a timetable and a term of marks, so every audit ever run
measured a full account. Emptied by building with the seeds off: every screen
already had a decent empty state, except the dashboard, which said "you're all
caught up" to somebody who had not started and then showed five cards each
correctly reporting that it was empty. Day one now gets one card and three
steps, gated on classes *and* events *and* assignments all being empty.

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
