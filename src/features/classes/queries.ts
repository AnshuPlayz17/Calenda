import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { dataSource } from '@/data'
import type {
  Assignment, NewAssignmentInput, NewClassInput,
} from '@/lib/types'

const CLASSES = 'classes'
const PAGES = 'pages'
const ASSIGNMENTS = 'assignments'
const TASKS = 'tasks'

export function useClasses(schoolYearId: string | undefined, includeArchived = false) {
  return useQuery({
    queryKey: [CLASSES, schoolYearId, includeArchived],
    queryFn: () => dataSource.listClasses(schoolYearId!, includeArchived),
    enabled: Boolean(schoolYearId),
  })
}

export function useClass(id: string | undefined) {
  return useQuery({
    queryKey: [CLASSES, 'one', id],
    queryFn: () => dataSource.getClass(id!),
    enabled: Boolean(id),
  })
}

export function useCreateClass(schoolYearId: string | undefined) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (input: NewClassInput) => {
      if (!schoolYearId) throw new Error('Pick a school year first.')
      return dataSource.createClass(input, schoolYearId)
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: [CLASSES] }),
  })
}

export function useUpdateClass() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, input }: { id: string; input: NewClassInput }) =>
      dataSource.updateClass(id, input),
    onSuccess: () => qc.invalidateQueries({ queryKey: [CLASSES] }),
  })
}

export function useArchiveClass() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, archived }: { id: string; archived: boolean }) =>
      dataSource.setClassArchived(id, archived),
    onSuccess: () => qc.invalidateQueries({ queryKey: [CLASSES] }),
  })
}

export function useDeleteClass() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: string) => dataSource.deleteClass(id),
    // A deleted class takes its pages, assignments and tasks with it.
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: [CLASSES] })
      void qc.invalidateQueries({ queryKey: [PAGES] })
      void qc.invalidateQueries({ queryKey: [ASSIGNMENTS] })
      void qc.invalidateQueries({ queryKey: [TASKS] })
    },
  })
}

// ------------------------------------------------------------- notebook --

export function usePages(classId: string | undefined) {
  return useQuery({
    queryKey: [PAGES, classId],
    queryFn: () => dataSource.listPages(classId!),
    enabled: Boolean(classId),
  })
}

export function useRecentPages(limit = 5) {
  return useQuery({
    queryKey: [PAGES, 'recent', limit],
    queryFn: () => dataSource.recentPages(limit),
  })
}

export function useCreatePage(classId: string | undefined) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ parentId, title }: { parentId: string | null; title?: string }) =>
      dataSource.createPage(classId!, parentId, title),
    onSuccess: () => qc.invalidateQueries({ queryKey: [PAGES] }),
  })
}

export function useUpdatePage() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, patch }: {
      id: string
      patch: { title?: string; content?: unknown; contentText?: string }
    }) => dataSource.updatePage(id, patch),
    // Only the title shows in the tree, so a content save need not refetch it.
    onSuccess: (_d, vars) => {
      if (vars.patch.title !== undefined) void qc.invalidateQueries({ queryKey: [PAGES] })
    },
  })
}

export function useDeletePage() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: string) => dataSource.deletePage(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: [PAGES] }),
  })
}

// ---------------------------------------------------------- assignments --

export function useAssignments(classId: string | undefined) {
  return useQuery({
    queryKey: [ASSIGNMENTS, classId],
    queryFn: () => dataSource.listAssignments(classId!),
    enabled: Boolean(classId),
  })
}

export function useUpcomingAssignments(schoolYearId: string | undefined, limit = 20) {
  return useQuery({
    queryKey: [ASSIGNMENTS, 'upcoming', schoolYearId, limit],
    queryFn: () => dataSource.listUpcomingAssignments(schoolYearId!, limit),
    enabled: Boolean(schoolYearId),
  })
}

function useInvalidateAssignments() {
  const qc = useQueryClient()
  return () => qc.invalidateQueries({ queryKey: [ASSIGNMENTS] })
}

export function useCreateAssignment(classId: string | undefined) {
  const invalidate = useInvalidateAssignments()
  return useMutation({
    mutationFn: (input: NewAssignmentInput) => dataSource.createAssignment(classId!, input),
    onSuccess: invalidate,
  })
}

export function useUpdateAssignment() {
  const invalidate = useInvalidateAssignments()
  return useMutation({
    mutationFn: ({ id, input }: { id: string; input: NewAssignmentInput }) =>
      dataSource.updateAssignment(id, input),
    onSuccess: invalidate,
  })
}

export function useSetAssignmentStatus() {
  const invalidate = useInvalidateAssignments()
  return useMutation({
    mutationFn: ({ id, status }: { id: string; status: Assignment['status'] }) =>
      dataSource.setAssignmentStatus(id, status),
    onSuccess: invalidate,
  })
}

export function useDeleteAssignment() {
  const invalidate = useInvalidateAssignments()
  return useMutation({
    mutationFn: (id: string) => dataSource.deleteAssignment(id),
    onSuccess: invalidate,
  })
}

// ---------------------------------------------------------------- tasks --

export function useTasks(classId: string | undefined) {
  return useQuery({
    queryKey: [TASKS, classId],
    queryFn: () => dataSource.listTasks(classId!),
    enabled: Boolean(classId),
  })
}

function useInvalidateTasks() {
  const qc = useQueryClient()
  return () => qc.invalidateQueries({ queryKey: [TASKS] })
}

export function useCreateTask(classId: string | null) {
  const invalidate = useInvalidateTasks()
  return useMutation({
    mutationFn: (title: string) => dataSource.createTask(classId, title),
    onSuccess: invalidate,
  })
}

export function useToggleTask() {
  const invalidate = useInvalidateTasks()
  return useMutation({
    mutationFn: ({ id, done }: { id: string; done: boolean }) =>
      dataSource.toggleTask(id, done),
    onSuccess: invalidate,
  })
}

export function useDeleteTask() {
  const invalidate = useInvalidateTasks()
  return useMutation({
    mutationFn: (id: string) => dataSource.deleteTask(id),
    onSuccess: invalidate,
  })
}
