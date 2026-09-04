/**
 * Service worker for web push.
 *
 * Deliberately minimal: it shows notifications and opens the app. It does not
 * cache anything, because a stale cached bundle is a worse problem than a
 * slightly slower load, and Calenda is already fast.
 */

self.addEventListener('push', (event) => {
  if (!event.data) return

  let payload
  try {
    payload = event.data.json()
  } catch {
    payload = { title: 'Calenda', body: event.data.text() }
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
