/**
 * Service worker for web push.
 *
 * Deliberately minimal: it shows notifications and opens the app. It does not
 * cache anything, because a stale cached bundle is a worse problem than a
 * slightly slower load, and Calenda is already fast.
 */

/**
 * Take over as soon as a new copy is installed.
 *
 * Without these, a fixed service worker sits in `waiting` until every tab on
 * the origin is closed -- so a push bug stays fixed only in theory. Nothing
 * here is cached, so there is no half-updated state to worry about: the whole
 * script is a push handler and a click handler.
 */
self.addEventListener('install', () => self.skipWaiting())
self.addEventListener('activate', (event) => event.waitUntil(self.clients.claim()))

self.addEventListener('push', (event) => {
  /**
   * A push with no readable payload STILL notifies.
   *
   * This used to be `if (!event.data) return` -- a silent exit. On 2026-09-10
   * a push was accepted by Google, addressed to a freshly created
   * subscription, reported `{"sent":1,"failed":0}` by the dispatcher, and
   * showed nothing. Three very different faults produce that -- the push not
   * arriving, arriving with an undecryptable body, or arriving empty -- and
   * this handler could not tell them apart, because two of the three look
   * exactly like the fourth possibility of everything being fine.
   *
   * Notifying anyway is also just better behaviour. A reminder that arrives
   * saying less than it should is worth more than no reminder, because the
   * person still looks at their calendar.
   */
  let payload = {
    title: 'Calenda',
    body: 'You have a reminder. Open Calenda to see it.',
  }

  if (event.data) {
    try {
      payload = event.data.json()
    } catch {
      payload = { title: 'Calenda', body: event.data.text() }
    }
  }

  event.waitUntil(
    self.registration.showNotification(payload.title ?? 'Calenda', {
      body: payload.body ?? '',
      icon: payload.icon ?? './brand/favicon.svg',
      badge: './brand/favicon.svg',
      tag: payload.tag,
      // Replacing a same-tag notification rather than stacking, so a
      // re-sent reminder never appears twice on the lock screen.
      renotify: Boolean(payload.tag),
      data: { url: payload.url ?? './' },
    }),
  )
})

self.addEventListener('notificationclick', (event) => {
  event.notification.close()
  const target = event.notification.data?.url ?? './'

  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clients) => {
      // Focus an existing tab rather than opening a duplicate.
      for (const client of clients) {
        if ('focus' in client) return client.focus()
      }
      return self.clients.openWindow(target)
    }),
  )
})
