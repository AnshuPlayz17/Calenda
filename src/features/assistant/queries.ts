import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { dataSource } from '@/data'

const THREADS = 'chat-threads'
const MESSAGES = 'chat-messages'
const QUOTA = 'chat-quota'

/**
 * `enabled` is not an optimisation, it is a bug fix.
 *
 * AssistantPanel is mounted by AppShell on every screen so it can animate in,
 * which means its hooks run on every page load whether or not anybody opened
 * it -- two Supabase requests per navigation, for a panel nobody looked at, for
 * every user. Gated on the panel actually being open.
 */
export function useChatThreads(enabled = true) {
  return useQuery({
    queryKey: [THREADS],
    queryFn: () => dataSource.listChatThreads(),
    enabled,
  })
}

export function useChatMessages(threadId: string | null) {
  return useQuery({
    queryKey: [MESSAGES, threadId],
    queryFn: () => dataSource.listChatMessages(threadId!),
    enabled: Boolean(threadId),
  })
}

export function useChatQuota(enabled = true) {
  return useQuery({
    queryKey: [QUOTA],
    queryFn: () => dataSource.chatQuotaRemaining(),
    enabled,
    // The counter is a courtesy, not a control -- the database decides. A
    // stale-by-a-minute number is fine and refetching it constantly is not.
    staleTime: 60_000,
  })
}

export function useCreateThread() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (title: string) => dataSource.createChatThread(title),
    onSuccess: () => qc.invalidateQueries({ queryKey: [THREADS] }),
  })
}

export function useDeleteThread() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: string) => dataSource.deleteChatThread(id),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: [THREADS] })
      void qc.invalidateQueries({ queryKey: [MESSAGES] })
    },
  })
}

export function useSendMessage() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ threadId, text }: { threadId: string; text: string }) =>
      dataSource.sendChatMessage(threadId, text),
    onSuccess: (_reply, vars) => {
      // The question and the answer are both written server-side, so the list
      // is refetched rather than appended to -- appending would show the reply
      // without the question that is now also in the table.
      void qc.invalidateQueries({ queryKey: [MESSAGES, vars.threadId] })
      void qc.invalidateQueries({ queryKey: [THREADS] })
      void qc.invalidateQueries({ queryKey: [QUOTA] })
    },
  })
}
