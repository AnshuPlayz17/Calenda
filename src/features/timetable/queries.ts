import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { dataSource } from '@/data'
import type { NewMeetingInput } from '@/lib/types'

const MEETINGS = 'meetings'

export function useMeetings(classId: string | undefined) {
  return useQuery({
    queryKey: [MEETINGS, classId],
    queryFn: () => dataSource.listMeetings(classId!),
    enabled: Boolean(classId),
  })
}

/**
 * The whole week, which is how a timetable is read.
 *
 * Separate from `useMeetings` rather than derived from it: the grid needs the
 * class name and colour beside every block, and assembling that on the client
 * from two caches means the grid renders once with blocks that have no names.
 */
export function useWeekMeetings(schoolYearId: string | undefined) {
  return useQuery({
    queryKey: [MEETINGS, 'week', schoolYearId],
    queryFn: () => dataSource.listWeekMeetings(schoolYearId!),
    enabled: Boolean(schoolYearId),
  })
}

function useInvalidateMeetings() {
  const qc = useQueryClient()
  // Both the per-class list and the week grid, always. A slot added from the
  // class workspace that does not appear on the timetable until a reload is
  // the kind of bug that reads as "it didn't save".
  return () => qc.invalidateQueries({ queryKey: [MEETINGS] })
}

export function useCreateMeeting(classId: string | undefined) {
  const invalidate = useInvalidateMeetings()
  return useMutation({
    mutationFn: (input: NewMeetingInput) => dataSource.createMeeting(classId!, input),
    onSuccess: invalidate,
  })
}

export function useUpdateMeeting() {
  const invalidate = useInvalidateMeetings()
  return useMutation({
    mutationFn: ({ id, input }: { id: string; input: NewMeetingInput }) =>
      dataSource.updateMeeting(id, input),
    onSuccess: invalidate,
  })
}

export function useDeleteMeeting() {
  const invalidate = useInvalidateMeetings()
  return useMutation({
    mutationFn: (id: string) => dataSource.deleteMeeting(id),
    onSuccess: invalidate,
  })
}
