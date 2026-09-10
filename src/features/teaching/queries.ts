import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { dataSource } from '@/data'
import type { NewEventInput } from '@/lib/types'

/**
 * One key prefix for everything about teaching, and every mutation invalidates
 * all of it.
 *
 * Finer-grained keys were the obvious thing and are wrong here: almost every
 * write changes two lists at once. Publishing a date changes the class's dates
 * and the member's calendar; removing a student changes the roster, the member
 * count on the card above it, and the progress table. A roster that still shows
 * somebody after they were removed reads as "it didn't save", which is the bug
 * this project has already shipped once from exactly this shortcut.
 */
const TEACHING = 'teaching'

export function useTeachingGroups(schoolYearId: string | undefined) {
  return useQuery({
    queryKey: [TEACHING, 'groups', schoolYearId],
    queryFn: () => dataSource.listTeachingGroups(schoolYearId!),
    enabled: Boolean(schoolYearId),
  })
}

export function useGroupMembers(groupId: string | undefined) {
  return useQuery({
    queryKey: [TEACHING, 'members', groupId],
    queryFn: () => dataSource.listGroupMembers(groupId!),
    enabled: Boolean(groupId),
  })
}

export function useGroupEvents(groupId: string | undefined) {
  return useQuery({
    queryKey: [TEACHING, 'events', groupId],
    queryFn: () => dataSource.listGroupEvents(groupId!),
    enabled: Boolean(groupId),
  })
}

export function useGroupAnnouncements(groupId: string | undefined) {
  return useQuery({
    queryKey: [TEACHING, 'announcements', groupId],
    queryFn: () => dataSource.listGroupAnnouncements(groupId!),
    enabled: Boolean(groupId),
  })
}

export function useGroupProgress(groupId: string | undefined) {
  return useQuery({
    queryKey: [TEACHING, 'progress', groupId],
    queryFn: () => dataSource.listGroupProgress(groupId!),
    enabled: Boolean(groupId),
  })
}

export function useMyGroups() {
  return useQuery({
    queryKey: [TEACHING, 'mine'],
    queryFn: () => dataSource.listMyGroups(),
  })
}

export function useMyAnnouncements(limit = 5) {
  return useQuery({
    queryKey: [TEACHING, 'my-announcements', limit],
    queryFn: () => dataSource.listMyAnnouncements(limit),
  })
}

function useInvalidateTeaching() {
  const qc = useQueryClient()
  return () => qc.invalidateQueries({ queryKey: [TEACHING] })
}

/**
 * Publishing a date also changes what members see on their calendar, which is
 * a different cache entirely. Both, or a student who is looking at their
 * calendar when the teacher publishes sees it appear on the next reload and
 * not before -- and reloads are exactly what nobody does.
 */
function useInvalidateTeachingAndCalendar() {
  const qc = useQueryClient()
  return () => {
    qc.invalidateQueries({ queryKey: [TEACHING] })
    qc.invalidateQueries({ queryKey: ['events'] })
  }
}

export function useCreateTeachingGroup(schoolYearId: string | undefined) {
  const invalidate = useInvalidateTeaching()
  return useMutation({
    mutationFn: (input: { name: string; subject?: string; room?: string }) =>
      dataSource.createTeachingGroup(schoolYearId!, input),
    onSuccess: invalidate,
  })
}

export function useRotateJoinCode() {
  const invalidate = useInvalidateTeaching()
  return useMutation({
    mutationFn: (groupId: string) => dataSource.rotateJoinCode(groupId),
    onSuccess: invalidate,
  })
}

export function useCloseJoinCode() {
  const invalidate = useInvalidateTeaching()
  return useMutation({
    mutationFn: (groupId: string) => dataSource.closeJoinCode(groupId),
    onSuccess: invalidate,
  })
}

export function useRemoveGroupMember() {
  const invalidate = useInvalidateTeaching()
  return useMutation({
    mutationFn: (memberId: string) => dataSource.removeGroupMember(memberId),
    onSuccess: invalidate,
  })
}

export function usePublishGroupEvent(groupId: string, schoolYearId: string | undefined) {
  const invalidate = useInvalidateTeachingAndCalendar()
  return useMutation({
    mutationFn: (input: NewEventInput) =>
      dataSource.publishGroupEvent(groupId, schoolYearId!, input),
    onSuccess: invalidate,
  })
}

export function useAnnounceToGroup(groupId: string) {
  const invalidate = useInvalidateTeaching()
  return useMutation({
    mutationFn: ({ body, notify }: { body: string; notify: boolean }) =>
      dataSource.announceToGroup(groupId, body, notify),
    onSuccess: invalidate,
  })
}

export function useJoinGroup() {
  const invalidate = useInvalidateTeachingAndCalendar()
  return useMutation({
    mutationFn: (code: string) => dataSource.joinGroup(code),
    onSuccess: invalidate,
  })
}

export function useUpdateMyGroup() {
  const invalidate = useInvalidateTeaching()
  return useMutation({
    mutationFn: ({ id, patch }: {
      id: string
      patch: { classId?: string | null; shareProgress?: boolean }
    }) => dataSource.updateMyGroup(id, patch),
    onSuccess: invalidate,
  })
}

export function useLeaveGroup() {
  const invalidate = useInvalidateTeachingAndCalendar()
  return useMutation({
    mutationFn: (membershipId: string) => dataSource.leaveGroup(membershipId),
    onSuccess: invalidate,
  })
}
