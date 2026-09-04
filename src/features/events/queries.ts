import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { dataSource } from '@/data'
import type { EventFilters } from '@/data'
import type { NewEventInput } from '@/lib/types'
import type { ImportOptions, ImportWrite, ReviewAction } from '@/data/source'

const EVENTS = 'events'

export function useCategories() {
  return useQuery({
    queryKey: ['categories'],
    queryFn: () => dataSource.listCategories(),
    staleTime: 10 * 60_000,
  })
}

export function useEvents(filters: EventFilters | null) {
  return useQuery({
    // The whole filter set is the key, so changing a filter refetches rather
    // than showing a stale window.
    queryKey: [EVENTS, filters],
    queryFn: () => dataSource.listEvents(filters!),
    enabled: filters !== null,
    placeholderData: (previous) => previous, // no flash while paging months
  })
}

/** Any successful write invalidates every event window at once. */
function useInvalidateEvents() {
  const qc = useQueryClient()
  return () => qc.invalidateQueries({ queryKey: [EVENTS] })
}

export function useCreateEvent(schoolYearId: string | undefined) {
  const invalidate = useInvalidateEvents()
  return useMutation({
    mutationFn: (input: NewEventInput) => {
      if (!schoolYearId) throw new Error('Pick a school year first.')
      return dataSource.createEvent(input, schoolYearId)
    },
    onSuccess: invalidate,
  })
}

export function useUpdateEvent() {
  const invalidate = useInvalidateEvents()
  return useMutation({
    mutationFn: ({ id, input }: { id: string; input: NewEventInput }) =>
      dataSource.updateEvent(id, input),
    onSuccess: invalidate,
  })
}

export function useDeleteEvent() {
  const invalidate = useInvalidateEvents()
  return useMutation({
    mutationFn: (id: string) => dataSource.deleteEvent(id),
    onSuccess: invalidate,
  })
}

export function useMySuggestions(schoolYearId: string | undefined) {
  return useQuery({
    queryKey: ['suggestions', schoolYearId],
    queryFn: () => dataSource.listMySuggestions(schoolYearId!),
    enabled: Boolean(schoolYearId),
  })
}

export function usePendingReview(schoolYearId: string | undefined) {
  return useQuery({
    queryKey: ['review-queue', schoolYearId],
    queryFn: () => dataSource.listPendingReview(schoolYearId!),
    enabled: Boolean(schoolYearId),
  })
}

export function useAllForYear(schoolYearId: string | undefined, enabled = true) {
  return useQuery({
    queryKey: ['all-events', schoolYearId],
    queryFn: () => dataSource.listAllForYear(schoolYearId!),
    enabled: Boolean(schoolYearId) && enabled,
  })
}

/** A decision changes the queue, the author's list, and the calendar. */
function useInvalidateReview() {
  const qc = useQueryClient()
  return () => {
    void qc.invalidateQueries({ queryKey: ['review-queue'] })
    void qc.invalidateQueries({ queryKey: ['suggestions'] })
    void qc.invalidateQueries({ queryKey: [EVENTS] })
    void qc.invalidateQueries({ queryKey: ['all-events'] })
  }
}

export function useReviewEvent() {
  const invalidate = useInvalidateReview()
  return useMutation({
    mutationFn: ({ id, action, note }: { id: string; action: ReviewAction; note?: string }) =>
      dataSource.reviewEvent(id, action, note),
    onSuccess: invalidate,
  })
}

export function useImportEvents(schoolYearId: string | undefined, options: ImportOptions) {
  const invalidate = useInvalidateReview()
  return useMutation({
    mutationFn: (writes: ImportWrite[]) => {
      if (!schoolYearId) throw new Error('Pick a school year first.')
      return dataSource.importEvents(writes, schoolYearId, options)
    },
    onSuccess: invalidate,
  })
}

/** Preview only -- absent on the Supabase source, so the button never appears. */
export function useClearAll(schoolYearId: string | undefined) {
  const invalidate = useInvalidateReview()
  return useMutation({
    mutationFn: async () => {
      if (!dataSource.clearAll || !schoolYearId) return
      await dataSource.clearAll(schoolYearId)
    },
    onSuccess: invalidate,
  })
}
