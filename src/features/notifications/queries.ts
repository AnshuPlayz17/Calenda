import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { dataSource } from '@/data'
import type { CategoryPreference, NotificationPreferences } from '@/lib/types'

type PrefsPayload = { prefs: NotificationPreferences; categories: CategoryPreference[] }

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

/**
 * A switch has to move the instant it is pressed.
 *
 * These were plain mutations that refetched before the UI changed, so every
 * tap sat still for a round trip and then jumped -- and two quick taps raced,
 * because a slow first response could land after the second and put the switch
 * back. Writing to the cache first fixes both: the switch is immediate, and
 * the cache, not the server's reply order, is what the UI reads.
 */
export function useUpdatePreferences() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (patch: Partial<NotificationPreferences>) =>
      dataSource.updateNotificationPreferences(patch),

    onMutate: async (patch) => {
      // Stop any in-flight read from overwriting what we are about to set.
      await qc.cancelQueries({ queryKey: [PREFS] })
      const previous = qc.getQueryData<PrefsPayload>([PREFS])
      if (previous) {
        qc.setQueryData<PrefsPayload>([PREFS], {
          ...previous,
          prefs: { ...previous.prefs, ...patch },
        })
      }
      return { previous }
    },

    onError: (_err, _patch, context) => {
      // Put the switch back where it was, rather than leaving it showing a
      // setting that was never saved.
      if (context?.previous) qc.setQueryData([PREFS], context.previous)
    },

    onSettled: () => {
      void qc.invalidateQueries({ queryKey: [PREFS] })
      // What will be sent depends on these settings, so the upcoming-reminders
      // list is refetched -- but only once the write has settled.
      void qc.invalidateQueries({ queryKey: [QUEUE] })
    },
  })
}

export function useUpdateCategoryPreference() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ categoryId, patch }: {
      categoryId: string
      patch: { enabled?: boolean; offsets?: number[] }
    }) => dataSource.updateCategoryPreference(categoryId, patch),

    onMutate: async ({ categoryId, patch }) => {
      await qc.cancelQueries({ queryKey: [PREFS] })
      const previous = qc.getQueryData<PrefsPayload>([PREFS])
      if (previous) {
        qc.setQueryData<PrefsPayload>([PREFS], {
          ...previous,
          categories: previous.categories.map((c) =>
            c.category_id === categoryId
              ? {
                  ...c,
                  ...(patch.enabled === undefined ? {} : { enabled: patch.enabled }),
                  // The stored field is offsets_minutes; the patch calls it
                  // offsets, so the rename has to happen here too or the
                  // optimistic row silently keeps the old timings.
                  ...(patch.offsets === undefined ? {} : { offsets_minutes: patch.offsets }),
                }
              : c),
        })
      }
      return { previous }
    },

    onError: (_err, _vars, context) => {
      if (context?.previous) qc.setQueryData([PREFS], context.previous)
    },

    onSettled: () => {
      void qc.invalidateQueries({ queryKey: [PREFS] })
      void qc.invalidateQueries({ queryKey: [QUEUE] })
    },
  })
}
