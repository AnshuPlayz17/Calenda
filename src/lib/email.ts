/**
 * Whether Calenda can actually send an email.
 *
 * Everything that recovers an account goes through an inbox -- a magic link, a
 * password reset, a confirmation -- and none of it is worth putting on a page
 * unless a message genuinely arrives. This was off until one did.
 *
 * Verified on 2026-09-07, twice, and the second one is the one that counts.
 *
 * First: a recovery mail sent from Authentication -> Users landed in the inbox
 * rather than in spam, from Supabase's built-in sender. That proved delivery.
 *
 * Then the whole thing, on the live site and through this app's own code --
 * "Forgot your password?" on the sign-in page, the mail, the link, and a
 * working "Set a new password" form at the other end. That is what proves the
 * link survives hash routing, which was the open question `recoveryToken.ts`
 * was written to close and which nothing in the dev container could answer.
 *
 * THE SENDER, AND THE THREE LIMITS THAT MATTER
 *
 * Mail now goes through Brevo over custom SMTP, not Supabase's built-in
 * sender. The From address is on a subdomain Brevo owns and has SPF and DKIM
 * for, which is better than the alternative that was considered: sending
 * "from" a personal Gmail address through a third party fails DMARC alignment
 * and gets filtered, because the mail is signed by Brevo while claiming to be
 * from Google.
 *
 * Three limits stack, and they interact:
 *
 *   1. Supabase enforces a minimum gap between emails to one address,
 *      server-side. Unbypassable, and the reason "you can only request this
 *      after N seconds" exists.
 *   2. Supabase's project-wide "Emails per hour" under Authentication ->
 *      Rate Limits. Call it N; the most that can leave in a day is 24N.
 *   3. Brevo's free plan: 300 emails a day.
 *
 * So N must be 12 or lower for it to be arithmetically impossible to exhaust
 * the daily quota -- 24 x 12 = 288. At 30 an hour a determined stranger could
 * burn 720 in a day, and the cost lands on the wrong person: the quota is gone
 * and somebody who genuinely cannot get in cannot reset their password either.
 * Twelve an hour is far beyond what a handful of testers need. Keep it there.
 *
 * `features/auth/emailCooldown.ts` adds a per-address countdown in the browser
 * on top of that. It is a courtesy for the person who presses the button twice,
 * never a control -- clearing site data defeats it -- and it must not be
 * described as one.
 *
 * Turning this back off is one line, and is the right move if delivery ever
 * stops being reliable. A reset that silently drops an address is worse than
 * no reset, because it sends someone away from the sign-in page to wait for
 * something that is not coming.
 */
export const emailDelivery = true

/**
 * What to tell someone who cannot get in, when the flag above is off.
 *
 * Unused while it is on, and deliberately kept: turning delivery back off has
 * to be one line, and it is not if the honest message has to be rewritten from
 * scratch at the same time. Kept here beside the flag so the message and the
 * reason for it cannot drift apart.
 */
export const NO_RECOVERY_NOTE
  = 'Password recovery by email is not switched on yet. If you signed up with '
  + 'Google, GitHub or Discord, use that button instead — it works whether or '
  + 'not you remember a password.'
