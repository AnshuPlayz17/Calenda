import { useCallback, useEffect, useState } from 'react'
import { dataSource } from '@/data'

/**
 * Web push for this device.
 *
 * Push is per-device, not per-account: granting it on a laptop says nothing
 * about a phone. The UI reflects that rather than pretending it is one switch.
 *
 * The VAPID public key is safe in the bundle by design -- it identifies the
 * server to the push service. The matching private key lives only in the Edge
 * Function that sends.
 */
const VAPID_PUBLIC_KEY = import.meta.env.VITE_VAPID_PUBLIC_KEY as string | undefined

type Status = 'unsupported' | 'unconfigured' | 'denied' | 'off' | 'on'

/**
 * Returns an ArrayBuffer rather than a Uint8Array: PushManager.subscribe wants
 * a BufferSource backed by a real ArrayBuffer, and a Uint8Array over a generic
 * ArrayBufferLike does not satisfy that.
 */
function urlBase64ToBuffer(base64: string): ArrayBuffer {
  const padding = '='.repeat((4 - (base64.length % 4)) % 4)
  const raw = atob((base64 + padding).replace(/-/g, '+').replace(/_/g, '/'))
  const bytes = new Uint8Array(new ArrayBuffer(raw.length))
  for (let i = 0; i < raw.length; i++) bytes[i] = raw.charCodeAt(i)
  return bytes.buffer
}

export function usePushNotifications() {
  const [status, setStatus] = useState<Status>('off')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const supported =
    typeof window !== 'undefined' &&
    'serviceWorker' in navigator &&
    'PushManager' in window &&
    'Notification' in window

  useEffect(() => {
    let active = true

    async function check() {
      if (!supported) return setStatus('unsupported')
      if (!VAPID_PUBLIC_KEY) return setStatus('unconfigured')
      if (Notification.permission === 'denied') return setStatus('denied')

      const reg = await navigator.serviceWorker.getRegistration()
      const sub = await reg?.pushManager.getSubscription()
      if (active) setStatus(sub ? 'on' : 'off')
    }

    void check()
    return () => { active = false }
  }, [supported])

  const enable = useCallback(async () => {
    setBusy(true)
    setError(null)
    try {
      if (!VAPID_PUBLIC_KEY) throw new Error('Push notifications are not configured yet.')

      const permission = await Notification.requestPermission()
      if (permission !== 'granted') {
        setStatus(permission === 'denied' ? 'denied' : 'off')
        return
      }

      const reg = await navigator.serviceWorker.register(
        `${import.meta.env.BASE_URL}sw.js`,
        { scope: import.meta.env.BASE_URL },
      )
      await navigator.serviceWorker.ready

      const sub = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToBuffer(VAPID_PUBLIC_KEY),
      })

      await dataSource.savePushSubscription(sub.toJSON())
      setStatus('on')
    } catch (err) {
      setError(err instanceof Error ? err.message : "We couldn't turn on notifications.")
    } finally {
      setBusy(false)
    }
  }, [])

  const disable = useCallback(async () => {
    setBusy(true)
    setError(null)
    try {
      const reg = await navigator.serviceWorker.getRegistration()
      const sub = await reg?.pushManager.getSubscription()
      if (sub) {
        await dataSource.removePushSubscription(sub.endpoint)
        await sub.unsubscribe()
      }
      setStatus('off')
    } catch (err) {
      setError(err instanceof Error ? err.message : "We couldn't turn off notifications.")
    } finally {
      setBusy(false)
    }
  }, [])

  return { status, busy, error, enable, disable }
}
