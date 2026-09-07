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
 * WHAT IS STILL TRUE AND MATTERS
 *
 * The built-in sender is rate limited to roughly two messages an hour and
 * comes from a shared Supabase domain, which is fine for one user and a few
 * testers and is not fine for a school. Before this goes to more people, add
 * SMTP credentials under Authentication -> Emails -> Custom SMTP. Brevo is the
 * free option that does not need a domain -- it verifies a single sender
 * address, so a personal address works. Resend is the other free tier but
 * wants DNS records on a domain you own.
 *
 * The redirect URL must stay on the allow list under Authentication -> URL
 * Configuration:
 *
 *     https://anshuplayz17.github.io/Calenda/#/reset-password
 *
 * The `#` is load-bearing. This app is hash-routed, and an entry without it
 * sends the recovery link to the landing page with the token attached to the
 * wrong route. Supabase does not fail in that case -- it silently substitutes
 * the Site URL, which is how a correctly configured project still delivers a
 * link that goes nowhere useful.
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
