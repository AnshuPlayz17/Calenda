import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { dataSource } from '@/data'
import type { EventFilters } from '@/data'
import type { NewEventInput } from '@/lib/types'

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
