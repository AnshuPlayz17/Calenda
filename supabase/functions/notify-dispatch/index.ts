/**
 * Sends the reminders that are due.
 *
 * Invoked on a schedule (pg_cron or GitHub Actions). Runs as the service role,
 * so it bypasses RLS -- which is why it must never accept user input about
 * WHOSE reminders to send. It only ever asks the database what is due.
 *
 * Safety comes from claim_due_reminders(), which marks rows sent as it claims
 * them under `for update skip locked`. Two dispatchers running at once cannot
 * both pick up the same row, so a duplicate reminder is impossible even if the
 * schedule fires twice.
 *
 * Deploy:  supabase functions deploy notify-dispatch  (or merge -- the
 *          functions.yml workflow does it, so no local CLI is needed)
 * Secrets: BREVO_API_KEY and MAIL_FROM (preferred), or RESEND_API_KEY
 *          VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY, VAPID_SUBJECT
 *
 * THIS HAS NEVER ACTUALLY DELIVERED A REMINDER
 *
 * Two independent reasons, both found on 2026-09-09. The hourly workflow began
 * with `if [ -z "$SUPABASE_FUNCTION_URL" ]; then exit 0` and that secret was
 * never set, so it ran every hour, printed one line and passed. And no Edge
 * Function had ever been deployed, so there was nothing at the other end to
 * call. Meanwhile the landing page carries a whole panel about reminders and
 * FACTS.md called notifications "verified live end-to-end".
 *
 * The workflow now fails loudly instead of skipping, and the sender below
 * moved off `onboarding@resend.dev` -- which only ever delivered to the
 * project owner, so even a working dispatcher would have reached nobody else.
 *
 * ANYONE CAN INVOKE THIS, AND THAT IS DELIBERATE
 *
 * It is called with the anon key, which is public by design, so a stranger can
 * POST to it. Audited on 2026-09-09 and left alone, because the worst they can
 * do is ask it to do its job early: it sends only what claim_due_reminders()
 * says is already due, that claim marks rows as it takes them under `for
 * update skip locked`, and Deno.serve here takes no request argument at all --
 * there is nothing in the call to point it at somebody. So a thousand
 * invocations send the same reminders once and no reminder arrives early.
 *
 * A shared-secret header was considered and rejected. It would need a new
 * secret set in two places before reminders worked at all, which is another
 * way for a feature that has never delivered anything to keep not delivering
 * anything -- and it would buy protection against wasted compute rather than
 * against a wrong send. If the free tier's invocation budget ever becomes the
 * binding constraint, that is the moment to add it, not before.
 */
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import webpush from 'https://esm.sh/web-push@3.6.7'
import { leadIn } from './leadIn.ts'

type Reminder = {
  id: string
  profile_id: string
  subject_type: string
  subject_id: string
  channel: 'email' | 'web_push' | 'sms'
  offset_minutes: number
}

const supabase = createClient(
  Deno.env.get('SUPABASE_URL')!,
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
)

const RESEND_KEY = Deno.env.get('RESEND_API_KEY')
const BREVO_KEY = Deno.env.get('BREVO_API_KEY')
/**
 * The address reminders come from.
 *
 * It has to be a sender Brevo has verified for this account -- the same
 * subdomain the auth mail already goes through, e.g.
 * "Calenda <something@NNNNNNN.brevosend.com>". Sending "from" a personal Gmail
 * through a third party is the alternative and it is worse: it fails DMARC
 * alignment and gets filtered, because the mail is signed by Brevo while
 * claiming to be from Google.
 */
const MAIL_FROM = Deno.env.get('MAIL_FROM') ?? ''
/**
 * MAIL_FROM is required by both branches, so it belongs in the readiness check
 * rather than only in the sender. Without it here, a project with a Resend key
 * and no sender address would report email as configured, then fail every
 * single reminder -- filling the queue with rows that can never succeed, which
 * is exactly the state the `skip` path below exists to prevent.
 */
const EMAIL_READY = Boolean(MAIL_FROM && (BREVO_KEY || RESEND_KEY))
const VAPID_PUBLIC = Deno.env.get('VAPID_PUBLIC_KEY')
const VAPID_PRIVATE = Deno.env.get('VAPID_PRIVATE_KEY')
const VAPID_SUBJECT = Deno.env.get('VAPID_SUBJECT') ?? 'mailto:noreply@calenda.app'

if (VAPID_PUBLIC && VAPID_PRIVATE) {
  webpush.setVapidDetails(VAPID_SUBJECT, VAPID_PUBLIC, VAPID_PRIVATE)
}

/**
 * Looks up what a reminder is actually about.
 *
 * `body` is set only where the message is not "how long until a thing". An
 * announcement has no future date to count back from -- it is the thing itself
 * arriving -- so it carries its own words instead of being described.
 */
async function describe(
  r: Reminder,
): Promise<{ title: string; when: string; body?: string } | null> {
  if (r.subject_type === 'event') {
    const { data } = await supabase
      .from('events').select('title, start_date').eq('id', r.subject_id).maybeSingle()
    return data ? { title: data.title, when: data.start_date } : null
  }
  if (r.subject_type === 'assignment') {
    const { data } = await supabase
      .from('assignments').select('title, due_at').eq('id', r.subject_id).maybeSingle()
    return data ? { title: data.title, when: data.due_at ?? '' } : null
  }
  if (r.subject_type === 'announcement') {
    const { data } = await supabase
      .from('announcement_messages')
      .select('body, group_name').eq('id', r.subject_id).maybeSingle()
    // The class is the title, so a lock screen says which class before the
    // words. `when` is unused for this type and is deliberately empty rather
    // than a made-up date.
    return data ? { title: data.group_name, when: '', body: data.body } : null
  }
  return null
}

/**
 * Brevo first, Resend only as a fallback.
 *
 * Brevo is where this project's mail already goes -- Supabase auth uses it over
 * custom SMTP from a verified subdomain -- so reminders arriving from the same
 * place is both one less service and one less way to fail DMARC. Its HTTP API
 * is used rather than SMTP because an Edge Function has no SMTP client.
 *
 * The Resend branch is kept only because it is what exists today and removing
 * it in the same change that moves the sender would make a failure impossible
 * to attribute. It no longer uses onboarding@resend.dev.
 */
async function sendEmail(to: string, subject: string, body: string) {
  if (BREVO_KEY && MAIL_FROM) {
    const { name, email } = parseFrom(MAIL_FROM)
    const res = await fetch('https://api.brevo.com/v3/smtp/email', {
      method: 'POST',
      headers: {
        'api-key': BREVO_KEY,
        'Content-Type': 'application/json',
        accept: 'application/json',
      },
      body: JSON.stringify({
        sender: { name, email },
        to: [{ email: to }],
        subject,
        textContent: body,
      }),
    })
    if (!res.ok) {
      throw new Error(`brevo ${res.status}: ${(await res.text()).slice(0, 200)}`)
    }
    return
  }

  if (!RESEND_KEY) throw new Error('email not configured')
  if (!MAIL_FROM) {
    // Refused rather than falling back to onboarding@resend.dev, which delivers
    // only to the account owner. A reminder that silently reaches nobody is
    // worse than one that fails and says why.
    throw new Error('MAIL_FROM is not set, so mail would only reach the owner')
  }
  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${RESEND_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ from: MAIL_FROM, to: [to], subject, text: body }),
  })
  if (!res.ok) throw new Error(`email failed: ${res.status}`)
}

/** "Calenda <a@b.com>" into its two halves; a bare address works too. */
function parseFrom(value: string): { name: string; email: string } {
  const match = value.match(/^\s*(.*?)\s*<([^>]+)>\s*$/)
  if (match) return { name: match[1] || 'Calenda', email: match[2]! }
  return { name: 'Calenda', email: value.trim() }
}

/**
 * Pushes to every subscription this person has, and REPORTS HOW MANY LANDED.
 *
 * It used to return nothing, and the caller counted `sent++` regardless. Two
 * ways that lied, both found on 2026-09-10 while chasing a reminder that the
 * logs insisted had been delivered:
 *
 *   - A person with no subscriptions at all: the loop ran zero times, threw
 *     nothing, and the run reported a delivery.
 *   - A subscription the browser had discarded: Google answers 404/410, this
 *     tidily deleted the row -- and then also reported a delivery, because
 *     handling an error is not the same as succeeding at the thing.
 *
 * Returning a count makes the caller able to tell "nobody was reached" from
 * "somebody was reached", which is the only distinction that number exists to
 * draw.
 *
 * One dead subscription also no longer takes down the live ones beside it. The
 * old `throw err` abandoned the rest of the loop, so a stale row on a second
 * device could silence the phone in your hand.
 */
async function sendPush(
  profileId: string, title: string, body: string, tag: string,
): Promise<{ delivered: number; reason: string | null }> {
  if (!VAPID_PUBLIC || !VAPID_PRIVATE) throw new Error('push not configured')

  const { data: subs } = await supabase
    .from('push_subscriptions').select('*').eq('profile_id', profileId)

  if (!subs || subs.length === 0) {
    return { delivered: 0, reason: 'no device is subscribed to push' }
  }

  let delivered = 0
  let lastError: string | null = null

  for (const sub of subs) {
    try {
      await webpush.sendNotification(
        { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
        JSON.stringify({ title, body, tag }),
      )
      delivered++
    } catch (err) {
      // 404/410 means the browser threw the subscription away -- remove it
      // rather than retrying forever. It is not a delivery.
      const status = (err as { statusCode?: number }).statusCode
      if (status === 404 || status === 410) {
        await supabase.from('push_subscriptions').delete().eq('endpoint', sub.endpoint)
        lastError = 'the subscription had expired and was removed'
      } else {
        // Recorded and carried past, not thrown: the next subscription in the
        // list may be the one the person is actually looking at.
        lastError = String(err).slice(0, 200)
        console.error('[notify-dispatch] push failed', lastError)
      }
    }
  }

  return { delivered, reason: delivered > 0 ? null : (lastError ?? 'push was not delivered') }
}

/** Parks a reminder that cannot be delivered, without counting it a failure. */
async function skip(queueId: string, why: string) {
  await supabase.from('notification_queue')
    .update({ state: 'skipped', error: why })
    .eq('id', queueId)
}

/**
 * Everything a run answers with, whatever happened.
 *
 * `where` is the point it got to. A 500 that says only "500" costs a round of
 * guessing, and this function has exactly three places outside the per-reminder
 * loop where one can come from -- so it says which.
 */
function problem(where: string, detail: string) {
  console.error(`[notify-dispatch] ${where}: ${detail}`)
  return new Response(JSON.stringify({ error: detail, where }), {
    status: 500,
    headers: { 'Content-Type': 'application/json' },
  })
}

Deno.serve(async () => {
  // The whole body, because an unhandled throw here is an opaque 500 with no
  // body at all -- which is what the hourly workflow got on 2026-09-11 at
  // 06:04 UTC and could say nothing about. The per-reminder loop already
  // catches its own errors; this catches the three calls outside it.
  try {
    return await dispatch()
  } catch (err) {
    return problem('an unhandled error', String(err).slice(0, 500))
  }
})

async function dispatch(): Promise<Response> {
  // Top up the queue first, so a reminder created since the last run is not
  // missed. Both steps are idempotent.
  //
  // Its result is read. It was called and discarded, so a failure here meant
  // the queue was silently not topped up and the run went on to report a
  // perfectly healthy `{"sent":0}` -- a success signal not downstream of the
  // success, which is the bug this file keeps growing.
  const scheduled = await supabase.rpc('schedule_reminders')
  if (scheduled.error) {
    return problem('topping up the queue', scheduled.error.message)
  }

  const { data: due, error } = await supabase.rpc('claim_due_reminders', { batch: 100 })
  if (error) {
    return problem('claiming what is due', error.message)
  }

  let sent = 0
  let failed = 0
  let skipped = 0

  for (const r of (due ?? []) as Reminder[]) {
    try {
      const subject = await describe(r)
      if (!subject) {
        // The subject was deleted after the reminder was queued, or this is a
        // subject_type nothing here knows how to describe. Recorded and
        // counted rather than `continue`d past: claim_due_reminders() has
        // already marked this row sent, so a silent skip is a delivery in the
        // logs and nothing on the phone -- which is the exact shape of the four
        // bugs that made reminders report success for five days.
        await skip(r.id, `nothing to say about ${r.subject_type} ${r.subject_id}`)
        skipped++
        continue
      }

      const title = subject.title
      const body = subject.body ?? `${leadIn(subject.when, r.offset_minutes)}: ${title}`

      // A channel with no sender behind it is skipped, not failed. Marking it
      // failed would fill the queue with rows that can never succeed and make
      // a missing API key look like a broken reminder.
      if (r.channel === 'email' && !EMAIL_READY) {
        await skip(r.id, 'email sending is not configured')
        skipped++
        continue
      }
      if (r.channel === 'web_push' && !(VAPID_PUBLIC && VAPID_PRIVATE)) {
        await skip(r.id, 'web push is not configured')
        skipped++
        continue
      }

      if (r.channel === 'email') {
        const { data: user } = await supabase.auth.admin.getUserById(r.profile_id)
        // An account with no address is not a delivery. This used to fall
        // through the `if` and count as one.
        if (!user.user?.email) {
          await skip(r.id, 'the account has no email address')
          skipped++
          continue
        }
        await sendEmail(user.user.email, `Calenda — ${title}`, body)
      } else if (r.channel === 'web_push') {
        // Same tag for the same subject, so a re-send replaces rather than
        // stacks on the lock screen.
        const push = await sendPush(
          r.profile_id, 'Calenda', body, `${r.subject_type}:${r.subject_id}`,
        )
        if (push.delivered === 0) {
          await skip(r.id, push.reason ?? 'push was not delivered')
          skipped++
          continue
        }
      } else {
        // SMS has no free sender. Skipped rather than failed, for the same
        // reason as above.
        await skip(r.id, 'sms is not configured')
        skipped++
        continue
      }

      await supabase.from('notification_deliveries').insert({
        queue_id: r.id,
        profile_id: r.profile_id,
        channel: r.channel,
        subject: title,
      })
      sent++
    } catch (err) {
      failed++
      await supabase.from('notification_queue')
        .update({ state: 'failed', error: String(err).slice(0, 500) })
        .eq('id', r.id)
    }
  }

  return new Response(JSON.stringify({ sent, failed, skipped }), {
    headers: { 'Content-Type': 'application/json' },
  })
}
