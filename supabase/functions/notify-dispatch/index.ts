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
 * Deploy:  supabase functions deploy notify-dispatch
 * Secrets: RESEND_API_KEY, VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY, VAPID_SUBJECT
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

async function sendEmail(to: string, subject: string, body: string) {
  if (!RESEND_KEY) throw new Error('email not configured')
  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${RESEND_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      from: 'Calenda <onboarding@resend.dev>',
      to: [to],
      subject,
      text: body,
    }),
  })
  if (!res.ok) throw new Error(`email failed: ${res.status}`)
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
      if (r.channel === 'email' && !RESEND_KEY) {
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
