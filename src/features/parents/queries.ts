import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { dataSource } from '@/data'
import type { Shareable } from '@/lib/types'

const LINKS = 'parent-links'

export function useParentLinks() {
  return useQuery({ queryKey: [LINKS], queryFn: () => dataSource.listParentLinks() })
}

export function useCreateInvite() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: () => dataSource.createParentInvite(),
    onSuccess: () => qc.invalidateQueries({ queryKey: [LINKS] }),
  })
}

export function useRedeemInvite() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (code: string) => dataSource.redeemParentInvite(code),
    onSuccess: () => qc.invalidateQueries({ queryKey: [LINKS] }),
  })
}

export function useRevokeLink() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: string) => dataSource.revokeParentLink(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: [LINKS] }),
  })
}

export function useSetShared() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ kind, id, shared }: { kind: Shareable; id: string; shared: boolean }) =>
      dataSource.setSharedWithParents(kind, id, shared),
    // Sharing changes what a parent sees everywhere, so refetch broadly.
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['events'] })
      void qc.invalidateQueries({ queryKey: ['classes'] })
      void qc.invalidateQueries({ queryKey: ['pages'] })
      void qc.invalidateQueries({ queryKey: ['assignments'] })
    },
  })
}
