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

/** Looks up what a reminder is actually about. */
async function describe(r: Reminder): Promise<{ title: string; when: string } | null> {
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

async function sendPush(profileId: string, title: string, body: string, tag: string) {
  if (!VAPID_PUBLIC || !VAPID_PRIVATE) throw new Error('push not configured')

  const { data: subs } = await supabase
    .from('push_subscriptions').select('*').eq('profile_id', profileId)

  for (const sub of subs ?? []) {
    try {
      await webpush.sendNotification(
        { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
        JSON.stringify({ title, body, tag }),
      )
    } catch (err) {
      // 404/410 means the browser threw the subscription away -- remove it
      // rather than retrying forever.
      const status = (err as { statusCode?: number }).statusCode
      if (status === 404 || status === 410) {
        await supabase.from('push_subscriptions').delete().eq('endpoint', sub.endpoint)
      } else {
        throw err
      }
    }
  }
}

/** Parks a reminder that cannot be delivered, without counting it a failure. */
async function skip(queueId: string, why: string) {
  await supabase.from('notification_queue')
    .update({ state: 'skipped', error: why })
    .eq('id', queueId)
}

Deno.serve(async () => {
  // Top up the queue first, so a reminder created since the last run is not
  // missed. Both steps are idempotent.
  await supabase.rpc('schedule_reminders')

  const { data: due, error } = await supabase.rpc('claim_due_reminders', { batch: 100 })
  if (error) {
    return new Response(JSON.stringify({ error: error.message }), { status: 500 })
  }

  let sent = 0
  let failed = 0
  let skipped = 0

  for (const r of (due ?? []) as Reminder[]) {
    try {
      const subject = await describe(r)
      // The event was deleted after the reminder was queued; nothing to say.
      if (!subject) continue

      const title = subject.title
      const body = `${leadIn(subject.when, r.offset_minutes)}: ${title}`

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
        if (user.user?.email) {
          await sendEmail(user.user.email, `Calenda — ${title}`, body)
        }
      } else if (r.channel === 'web_push') {
        // Same tag for the same subject, so a re-send replaces rather than
        // stacks on the lock screen.
        await sendPush(r.profile_id, 'Calenda', body, `${r.subject_type}:${r.subject_id}`)
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
})
