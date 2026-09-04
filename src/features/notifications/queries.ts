import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { dataSource } from '@/data'
import type { NotificationPreferences } from '@/lib/types'

const PREFS = 'notification-prefs'
const QUEUE = 'notification-queue'

export function useNotificationPreferences() {
  return useQuery({
    queryKey: [PREFS],
    queryFn: () => dataSource.getNotificationPreferences(),
  })
}

export function useQueuedReminders(limit = 25) {
  return useQuery({
    queryKey: [QUEUE, limit],
    queryFn: () => dataSource.listQueuedReminders(limit),
  })
}

function useInvalidate() {
  const qc = useQueryClient()
  return () => {
    void qc.invalidateQueries({ queryKey: [PREFS] })
    // Changing a preference changes what will be sent, so the preview of
    // upcoming reminders has to be refetched too.
    void qc.invalidateQueries({ queryKey: [QUEUE] })
  }
}

export function useUpdatePreferences() {
  const invalidate = useInvalidate()
  return useMutation({
    mutationFn: (patch: Partial<NotificationPreferences>) =>
      dataSource.updateNotificationPreferences(patch),
    onSuccess: invalidate,
  })
}

export function useUpdateCategoryPreference() {
  const invalidate = useInvalidate()
  return useMutation({
    mutationFn: ({ categoryId, patch }: {
      categoryId: string
      patch: { enabled?: boolean; offsets?: number[] }
    }) => dataSource.updateCategoryPreference(categoryId, patch),
    onSuccess: invalidate,
  })
}
