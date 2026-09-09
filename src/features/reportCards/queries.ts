import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { dataSource } from '@/data'
import type { ReportCardLine } from '@/lib/types'

const CARDS = 'report-cards'
const LINES = 'report-card-lines'

export function useReportCards() {
  return useQuery({ queryKey: [CARDS], queryFn: () => dataSource.listReportCards() })
}

export function useReportCard(id: string | undefined) {
  return useQuery({
    queryKey: [CARDS, id],
    queryFn: () => dataSource.getReportCard(id!),
    enabled: Boolean(id),
  })
}

export function useReportCardLines(id: string | undefined) {
  return useQuery({
    queryKey: [LINES, id],
    queryFn: () => dataSource.listReportCardLines(id!),
    enabled: Boolean(id),
  })
}

export function useUploadReportCard() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ file, term }: { file: File; term: string | null }) =>
      dataSource.createReportCard(file, term),
    onSuccess: () => qc.invalidateQueries({ queryKey: [CARDS] }),
  })
}

export function useDecodeReportCard() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: string) => dataSource.decodeReportCard(id),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: [CARDS] })
      void qc.invalidateQueries({ queryKey: [LINES] })
    },
  })
}

export function useUpdateLine() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, patch }: {
      id: string
      patch: { decision?: ReportCardLine['decision']; matchedClassId?: string | null }
    }) => dataSource.updateReportCardLine(id, patch),
    onSuccess: () => qc.invalidateQueries({ queryKey: [LINES] }),
  })
}

export function useApplyReportCard() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: string) => dataSource.applyReportCard(id),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: [CARDS] })
      void qc.invalidateQueries({ queryKey: [LINES] })
      // The marks it just wrote are the whole point, so the grades screens
      // must not still be showing the state from before.
      void qc.invalidateQueries({ queryKey: ['grades'] })
    },
  })
}

export function useDeleteReportCard() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: string) => dataSource.deleteReportCard(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: [CARDS] }),
  })
}
