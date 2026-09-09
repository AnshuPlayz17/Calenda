# Turning on what was built on 2026-09-09

Everything in this document is done in a browser. No terminal, no Supabase CLI,
no keychain prompt.

Nothing built on 2026-09-09 works until steps 1 to 3 are done. Step 4 is the
one that has been broken since the project started.

---

## 1. A model key (about two minutes)

The assistant and the report-card reader both need one. Without it they say so
plainly rather than failing oddly — that is deliberate — but they do nothing.

1. **[console.groq.com](https://console.groq.com)** → sign up → **API Keys** →
   Create. Free, no card.
2. Supabase → your project → **Edge Functions** → **Secrets**
   (if that tab is missing: Project Settings → Edge Functions → Secrets)
3. Add two:

   | Key | Value |
   |---|---|
   | `MODEL_PROVIDER` | `groq` |
   | `MODEL_API_KEY` | the key from step 1 |

**Never paste the key into a chat.** Anything typed into a conversation lives in
a transcript.

Two secrets rather than one so the provider can be changed later by editing one
word. `MODEL_PROVIDER` also accepts `gemini` or `openai-compatible`; the latter
reads `MODEL_BASE_URL`. Optional: `MODEL_NAME` and `MODEL_VISION_NAME` override
the defaults without a redeploy.

**One limit worth knowing before you rely on it:** report-card reading needs a
model that can look at an image. Groq reads images, so a photo or a screenshot
works. It cannot read PDFs — the app says "take a photo of it instead" rather
than failing obscurely. Gemini reads PDFs directly if that matters more than
speed.

---

## 2. Deploy secrets for GitHub (about two minutes)

So merging deploys the Edge Functions and you never need a working local CLI.

1. **[supabase.com/dashboard/account/tokens](https://supabase.com/dashboard/account/tokens)**
   → Generate new token → name it `GitHub Actions — Calenda deploys`.
   Scope it: **Project → Read**, **Edge Functions → Read-write**, everything
   else None. Copy it — shown once.
2. Project Settings → General → copy the **Reference ID** (about 20 characters,
   not the word "calenda").
3. **[GitHub → Secrets → Actions](https://github.com/AnshuPlayz17/Calenda/settings/secrets/actions)**
   → make sure you are on the **Secrets** tab, not Variables → add:

   | Name | Value |
   |---|---|
   | `SUPABASE_ACCESS_TOKEN` | the token from step 1 |
   | `SUPABASE_PROJECT_REF` | the reference ID from step 2 |

---

## 3. Merge

The GitHub integration applies everything in `supabase/migrations/` and
`functions.yml` deploys both Edge Functions.

The `attachments` storage bucket creates itself (migration
`20260909000400`) — private, 10MB a file. If that migration ever fails with
*"must be owner of table objects"*, nothing is lost: create the same four rules
by hand under Storage → Policies, which runs as the owning role. The bucket
insert is unaffected either way.

**Every migration was applied to a real Postgres before being committed**, in
order, twice, with all 108 SQL assertions passing. CI now does the same on
every pull request. What that does *not* cover is your real data — a migration
can be correct and still meet a row it did not expect.

---

## 4. Reminders, which have never sent anything

Two independent reasons, both found on 2026-09-09:

- `reminders.yml` began with a guard on `SUPABASE_FUNCTION_URL`, a secret that
  was never set. It ran every hour since 4 September, printed one line, and
  passed. **Sixty green checks a day for a feature that had never delivered
  anything.**
- No Edge Function had ever been deployed, so there was nothing to call.

The workflow now **fails** when unconfigured instead of passing quietly. Step 2
above supplies what it needs.

The sender also moved off `onboarding@resend.dev`, which only ever delivers to
the Resend account holder — so even a working dispatcher would have reached no
user. Add two more Edge Function secrets:

| Key | Value |
|---|---|
| `BREVO_API_KEY` | Brevo → SMTP & API → API Keys |
| `MAIL_FROM` | `Calenda <something@NNNNNNN.brevosend.com>` — the verified sender your auth mail already uses |

Both are required. Without `MAIL_FROM` the dispatcher skips email rather than
failing every reminder, which is the safer of the two wrong answers.

### Then prove it

Run the **Send reminders** workflow by hand (Actions → Send reminders → Run
workflow) and check that a reminder arrives. Until one has:

> **Nothing on the marketing pages may claim reminders are delivered.**

`docs/FACTS.md` has been corrected to say delivery is unverified, and the two
landing panels that read as though reminders arrive now describe the *schedule*
instead — "Scheduled by you, and never doubled", rather than "Warned early".
Everything they claim (per-category lead times, quiet hours, a duplicate
refused by a unique constraint) is true today and stays true once delivery is
on, so nothing there needs changing after you have seen one arrive. If you
would rather have the old wording back it is one commit.

---

## 5. Optional: schedule from the database instead

`supabase/schedule-notifications.sql` sets up pg_cron inside Postgres. Its own
comment explains why it is better than the Actions cron: GitHub disables
scheduled workflows after 60 days of repository inactivity, and a summer
holiday is longer than that.

Both paths call the same function and both are safe to have.

---

## What is still not verified, and by whom

I could not check any of this against your project — Supabase is unreachable
from the container this was built in.

| Verified | How |
|---|---|
| Every migration, in order, twice | Applied to a real Postgres 16 |
| 108 SQL assertions | `./scripts/db-test.sh`, now also in CI |
| Edge Function syntax + security properties | esbuild parse and guards in `npm test` |
| Every screen, 72 configurations | The browser harness, several clean runs |
| Keyboard order, 9 screens | 0 problems |

| Not verified | Who can |
|---|---|
| The functions actually running on Deno | You, after step 3 |
| A reminder arriving | You, step 4 |
| The assistant answering | You, after step 1 |
| Report-card reading accuracy | Nobody, until it meets a real report card — which is exactly why nothing it reads is saved until you agree with it, line by line |
| Anything against your real data | You |
