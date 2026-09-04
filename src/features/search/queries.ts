import { useQuery } from '@tanstack/react-query'
import { dataSource } from '@/data'
import type { PlainDate } from '@/lib/events'

export type SearchHit = {
  kind: 'event' | 'note' | 'assignment' | 'class'
  id: string
  title: string
  subtitle: string | null
  occurs_on: PlainDate | null
  class_id: string | null
}

const MIN_QUERY = 2

export function useSearch(query: string) {
  const trimmed = query.trim()
  return useQuery({
    queryKey: ['search', trimmed],
    queryFn: () => dataSource.search(trimmed),
    // One letter matches almost everything, which is slower and less useful
    // than not searching yet.
    enabled: trimmed.length >= MIN_QUERY,
    // Results for a given string do not change while the palette is open.
    staleTime: 30_000,
    placeholderData: (previous) => previous,
  })
}
