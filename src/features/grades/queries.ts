import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { dataSource } from '@/data'
import type { NewGradeInput } from '@/lib/types'

const GRADES = 'grades'

export function useGrades(classId: string | undefined) {
  return useQuery({
    queryKey: [GRADES, classId],
    queryFn: () => dataSource.listGrades(classId!),
    enabled: Boolean(classId),
  })
}

export function useAllGrades(schoolYearId: string | undefined) {
  return useQuery({
    queryKey: [GRADES, 'all', schoolYearId],
    queryFn: () => dataSource.listAllGrades(schoolYearId!),
    enabled: Boolean(schoolYearId),
  })
}

function useInvalidateGrades() {
  const qc = useQueryClient()
  return () => qc.invalidateQueries({ queryKey: [GRADES] })
}

export function useCreateGrade(classId: string | undefined) {
  const invalidate = useInvalidateGrades()
  return useMutation({
    mutationFn: (input: NewGradeInput) => dataSource.createGrade(classId!, input),
    onSuccess: invalidate,
  })
}

export function useUpdateGrade() {
  const invalidate = useInvalidateGrades()
  return useMutation({
    mutationFn: ({ id, input }: { id: string; input: NewGradeInput }) =>
      dataSource.updateGrade(id, input),
    onSuccess: invalidate,
  })
}

export function useDeleteGrade() {
  const invalidate = useInvalidateGrades()
  return useMutation({
    mutationFn: (id: string) => dataSource.deleteGrade(id),
    onSuccess: invalidate,
  })
}
