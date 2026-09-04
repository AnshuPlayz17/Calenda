# Calenda

A personal school command centre — community events, a personal calendar,
Google Calendar, class workspaces, notebooks, assignments and personalised
reminders in one place.

> Calenda is a personal project. It is not affiliated with, endorsed by, or an
> official product of University of Toronto Schools.

## Documentation

| Document | What it covers |
|---|---|
| [`docs/SPEC.md`](docs/SPEC.md) | Architecture, decisions and their reasoning, free-tier limits, phases |
| [`docs/DATA-MODEL.md`](docs/DATA-MODEL.md) | Schema, indexes, RLS design |
| [`docs/discovery/FINDINGS.md`](docs/discovery/FINDINGS.md) | What the school-events PDF actually contains, and the glyph corruption in it |

## Running locally

```bash
npm install
cp .env.example .env.local     # then fill in your Supabase project values
npm run dev
```

The app boots without Supabase configured — it shows a setup notice on the
sign-in screen instead of crashing, so a fresh clone always runs.

```bash
npm test        # unit tests
npm run typecheck
npm run build   # production bundle
```

## Database

**Setting up a new project:** paste [`supabase/setup.sql`](supabase/setup.sql)
into the Supabase SQL Editor and run it once. It is generated from the
migrations by `scripts/build-setup-sql.sh` -- don't edit it by hand.

It runs in a single transaction, so it is all-or-nothing: a dropped connection
leaves the database untouched and you simply run it again. It also records each
migration in `supabase_migrations.schema_migrations`, so running it by hand
does **not** conflict with the GitHub integration -- when that later deploys,
it sees these as applied and skips them.

Migrations use the CLI's timestamp naming so both paths work:

```
supabase/migrations/20260904000100_init.sql   schema, indexes, constraints
supabase/migrations/20260904000200_rls.sql    row-level security
supabase/migrations/20260904000300_seed.sql   categories and school year
```

After adding a migration, regenerate the setup file:

```bash
./scripts/build-setup-sql.sh
```

### Verifying the security policies

The policies are the entire permission boundary, so they have adversarial
tests: each one attempts an access that must fail, and requires it to fail.

```bash
psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f supabase/tests/rls_test.sql
```

It covers a linked parent reading an unshared event, an admin reading private
notebooks and Google refresh tokens, a user self-publishing a community event,
and a user promoting themselves to admin. Any failure exits non-zero.

Parent invites have their own suite, since redeeming a code grants standing
access to another person's shared content:

```bash
psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f supabase/tests/parent_invite_test.sql
```

It covers single use, expiry, self-redemption, code enumeration (every failure
returns the same message, so a wrong code cannot be told from a used one), and
that nobody -- including a linked parent -- can list invite codes.

**Promoting the first admin** is a deliberate one-time SQL statement. There is
no application code path that grants admin, so a bug cannot create one.

Sign in through the app once first -- the profile row is created on first
sign-in, so running this earlier matches nothing:

```sql
update profiles set role = 'admin'
where id = (select id from auth.users where email = 'you@example.com');
```

## Configuration

Only two values reach the browser, and both are safe there:

| Variable | Notes |
|---|---|
| `VITE_SUPABASE_URL` | Identifies the project |
| `VITE_SUPABASE_ANON_KEY` | Public by design; grants nothing on its own, because every table is behind RLS |

Service-role keys, OAuth client secrets and provider API keys must never appear
in this repository or the bundle. They belong in Supabase Edge Function secrets.

### Supabase URL configuration

**Authentication → URL Configuration** decides where Supabase sends people back
to after any redirect-based sign-in. It defaults to `http://localhost:3000`,
which is right while developing and wrong everywhere else -- an OAuth round trip
ends on a dead `localhost` page rather than the app.

| Field | Value |
|---|---|
| Site URL | `https://<user>.github.io/Calenda/` |
| Redirect URLs | `https://<user>.github.io/Calenda/**` |

The `**` matters: without it only the root is allowed, so a flow returning to
`#/settings` is rejected. This governs magic links as well as OAuth.

### Google Calendar

Import is read-only and needs no app verification, because it never stores a
Google credential -- see `docs/SPEC.md` §7.

1. Google Cloud → new project → enable the **Google Calendar API** (under
   APIs & Services, *not* the Auth Platform screen)
2. **Data Access** → add `.../auth/calendar.readonly`
3. **Audience** → External, Testing, and list every user under **Test users**
4. **Clients** → Web application → authorised redirect URI is the Supabase
   callback: `https://<project>.supabase.co/auth/v1/callback`
5. Supabase → **Authentication → Sign In / Providers → Google** → paste the
   client ID and secret

Testing mode shows an "unverified app" warning and caps you at 100 test users.
Both are acceptable here; see the spec for why verification is not pursued.

### Sign-in providers

Google, Microsoft, GitHub, Discord and Facebook are enabled, alongside
email + password and magic links. Each must also be configured in the Supabase
dashboard.

**Apple is deliberately disabled.** It requires an Apple Developer Program
membership at $99 USD/year to create the Service ID and signing key. The button,
callback route and linking logic all ship — set `enabled: true` in
`src/lib/providers.ts` once the credentials exist.

## Notifications

Preferences, per-category reminder offsets, quiet hours and web-push
subscription all work as soon as the migrations are applied. **Sending**
needs two more things, and until they exist reminders queue but never go out:

1. **Deploy the dispatcher**

   ```bash
   supabase functions deploy notify-dispatch
   ```

2. **Give it credentials**

   ```bash
   npx web-push generate-vapid-keys          # once
   supabase secrets set VAPID_PUBLIC_KEY=... VAPID_PRIVATE_KEY=...
   supabase secrets set RESEND_API_KEY=...   # resend.com, free tier
   ```

   Put the **public** VAPID key in `VITE_VAPID_PUBLIC_KEY` as a repository
   variable too -- the browser needs it to subscribe, and it is safe to
   publish. The private key never leaves Supabase.

Then either add `SUPABASE_FUNCTION_URL` as a repository secret (the hourly
`reminders.yml` workflow pokes it), or schedule it inside Postgres with
`pg_cron`. Both are safe to run together: `claim_due_reminders()` marks rows
sent as it claims them under `for update skip locked`, so two dispatchers
cannot send the same reminder.

### Why not SMS

Text messaging is not free for a Canadian number. Carrier email-to-SMS
gateways -- the old workaround -- were shut down through 2024-25 (Bell ended
theirs on 2025-12-31), and Twilio offers trial credit rather than a free tier.
The channel enum includes `sms` and the phone/consent columns exist, so adding
it later is credentials plus a verification flow, not a rebuild.

## Deployment

`main` deploys to GitHub Pages via `.github/workflows/deploy.yml`, which
typechecks and tests before building. Set `VITE_SUPABASE_URL` and
`VITE_SUPABASE_ANON_KEY` as **repository variables** (Settings → Secrets and
variables → Actions → Variables).

The app uses hash routing because GitHub Pages has no server to rewrite deep
links. The build also writes a `404.html` fallback. For a custom domain, set
`VITE_BASE=/`.

## Branding

The school crest is University of Toronto Schools' trademark and is not bundled
with this source. Drop the official file at `public/brand/uts-logo.svg` and the
lockup picks it up automatically; until then a neutral Calenda mark stands in
rather than an imitation of someone else's crest.
