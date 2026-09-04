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

### Sign-in providers

Google, Microsoft, GitHub, Discord and Facebook are enabled, alongside
email + password and magic links. Each must also be configured in the Supabase
dashboard.

**Apple is deliberately disabled.** It requires an Apple Developer Program
membership at $99 USD/year to create the Service ID and signing key. The button,
callback route and linking logic all ship — set `enabled: true` in
`src/lib/providers.ts` once the credentials exist.

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
